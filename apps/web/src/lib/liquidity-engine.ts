import { buildLiquidityBuckets, type LiquidityBand } from './liquidity-buckets';
import { buildLiquiditySignals, type KeyLevel } from './liquidity-signals';

export type LiquidityType = 'real' | 'spoof' | 'iceberg' | 'absorption';

export interface HeatmapSettings {
  intensity: number;
  minSizeUsd: number;
  depthPct: number;
  autoFade: boolean;
  showDiagnostics: boolean;
}

export const DEFAULT_HEATMAP_SETTINGS: HeatmapSettings = {
  intensity: 1.0,
  minSizeUsd: 50_000,
  depthPct: 0.03,
  autoFade: true,
  showDiagnostics: false,
};

interface TrackedLevel {
  price: number;
  side: 'bid' | 'ask';
  currentQty: number;
  peakQty: number;
  minQtyObserved: number;
  totalAccumQty: number;
  firstSeen: number;
  lastSeen: number;
  snapshotCount: number;
  prevQty: number;
  refillCount: number;
  touchCount: number;
  lastTouchTime: number;
  type: LiquidityType;
  persistenceScore: number;
}

export interface VisualLevel {
  price: number;
  side: 'bid' | 'ask';
  type: LiquidityType;
  intensity: number;
  opacity: number;
}

export interface HeatmapRenderModel {
  backgroundBands: Array<LiquidityBand & { opacity: number }>;
  keyLevels: Array<{
    price: number;
    kind: 'barrier' | 'up-target' | 'down-target';
    usd: number;
  }>;
  pathZones: Array<{
    fromPrice: number;
    toPrice: number;
    direction: 'up' | 'down';
    status: 'clear' | 'mixed' | 'blocked';
  }>;
  diagnostics: Array<{
    price: number;
    side: 'bid' | 'ask';
    kind: 'spoof' | 'iceberg' | 'absorption';
    confidence: number;
  }>;
  summary: {
    barrier: { price: number; usd: number } | null;
    topAbove: { price: number; usd: number } | null;
    topBelow: { price: number; usd: number } | null;
    bias: 'pull up' | 'pull down' | 'balanced';
    upPath: 'clear' | 'mixed' | 'blocked';
    downPath: 'clear' | 'mixed' | 'blocked';
  };
}

const FADE_MS = 60_000;
const EVICT_MS = 180_000;
const TOUCH_DEBOUNCE_MS = 3_000;

export class LiquidityEngine {
  private levels = new Map<string, TrackedLevel>();
  private priceStep = 1;

  setPriceStep(step: number) {
    this.priceStep = Math.max(step, 1e-10);
  }

  private round(price: number) {
    return Math.round(price / this.priceStep) * this.priceStep;
  }

  private key(side: 'bid' | 'ask', price: number) {
    return `${side}:${price.toFixed(10)}`;
  }

  addUpdate(
    bids: { price: number; quantity: number }[],
    asks: { price: number; quantity: number }[],
    currentPrice: number,
    now = Date.now(),
  ): void {
    for (const [side, levels] of [
      ['bid' as const, bids],
      ['ask' as const, asks],
    ] as const) {
      for (const { price, quantity } of levels) {
        if (quantity <= 0) continue;
        const roundedPrice = this.round(price);
        const key = this.key(side, roundedPrice);
        const existing = this.levels.get(key);

        if (existing) {
          const prev = existing.currentQty;
          existing.prevQty = prev;
          existing.currentQty = quantity;
          existing.lastSeen = now;
          existing.snapshotCount++;
          existing.totalAccumQty += quantity;

          if (quantity > existing.peakQty) existing.peakQty = quantity;
          if (quantity < existing.minQtyObserved) existing.minQtyObserved = quantity;

          if (prev > 0 && quantity > prev * 1.5 && prev < existing.peakQty * 0.5 && existing.snapshotCount > 4) {
            existing.refillCount++;
          }

          if (currentPrice > 0 && Math.abs(currentPrice - roundedPrice) / currentPrice < 0.0008) {
            if (now - existing.lastTouchTime > TOUCH_DEBOUNCE_MS) {
              existing.touchCount++;
              existing.lastTouchTime = now;
            }
          }
        } else {
          this.levels.set(key, {
            price: roundedPrice,
            side,
            currentQty: quantity,
            peakQty: quantity,
            minQtyObserved: quantity,
            totalAccumQty: quantity,
            firstSeen: now,
            lastSeen: now,
            snapshotCount: 1,
            prevQty: 0,
            refillCount: 0,
            touchCount: 0,
            lastTouchTime: 0,
            type: 'real',
            persistenceScore: 0,
          });
        }
      }
    }

    this.updateTypes(now, currentPrice);
    this.evict(now);
  }

  private updateTypes(now: number, currentPrice: number) {
    for (const level of this.levels.values()) {
      const age = now - level.firstSeen;
      const staleness = now - level.lastSeen;
      const isActive = staleness < 800;

      const ageScore = Math.min(age / 40_000, 1) * 40;
      const countScore = Math.min(level.snapshotCount / 150, 1) * 35;
      const sizeScore = Math.min((level.peakQty * level.price) / 250_000, 1) * 25;
      level.persistenceScore = Math.round(ageScore + countScore + sizeScore);

      if (level.refillCount >= 2) {
        level.type = 'iceberg';
      } else if (level.touchCount >= 2 && isActive) {
        level.type = 'absorption';
      } else if (!isActive && level.peakQty * level.price > 25_000 && age < 30_000) {
        level.type = 'spoof';
      } else {
        level.type = 'real';
      }

      if (currentPrice > 0 && Math.abs(currentPrice - level.price) / currentPrice < 0.0008 && now - level.lastTouchTime > TOUCH_DEBOUNCE_MS) {
        level.touchCount++;
        level.lastTouchTime = now;
      }
    }
  }

  private evict(now: number) {
    for (const [key, level] of this.levels.entries()) {
      if (now - level.lastSeen > EVICT_MS) this.levels.delete(key);
    }
  }

  getVisualLevels(settings: HeatmapSettings, currentPrice: number): VisualLevel[] {
    const model = this.getRenderModel({
      currentPrice,
      depthPct: settings.depthPct,
      minSizeUsd: settings.minSizeUsd,
      intensity: settings.intensity,
      diagnosticsEnabled: settings.showDiagnostics,
    });

    return model.backgroundBands.map(band => ({
      price: band.price,
      side: band.side,
      type: 'real',
      intensity: band.intensity,
      opacity: band.opacity,
    }));
  }

  getRenderModel(settings: {
    currentPrice: number;
    depthPct: number;
    minSizeUsd: number;
    intensity: number;
    diagnosticsEnabled: boolean;
  }): HeatmapRenderModel {
    const bands = buildLiquidityBuckets({
      bids: this.collectSideLevels('bid'),
      asks: this.collectSideLevels('ask'),
      currentPrice: settings.currentPrice,
      bucketSize: this.priceStep,
      depthPct: settings.depthPct,
    }).filter(band => band.usd >= settings.minSizeUsd);

    const backgroundBands = bands
      .map(band => ({
        ...band,
        opacity: this.computeBandOpacity(band, settings.currentPrice, settings.intensity),
      }))
      .filter(band => band.opacity > 0.02);

    const signals = buildLiquiditySignals({
      currentPrice: settings.currentPrice,
      bands: backgroundBands,
    });

    return {
      backgroundBands,
      keyLevels: this.buildKeyLevels(signals.barrier, signals.upTarget, signals.downTarget),
      pathZones: this.buildPathZones(signals.barrier, signals.upTarget, signals.downTarget, signals.upPath, signals.downPath),
      diagnostics: settings.diagnosticsEnabled ? this.buildDiagnostics() : [],
      summary: {
        barrier: signals.barrier ? { price: signals.barrier.price, usd: signals.barrier.usd } : null,
        topAbove: signals.topAbove ? { price: signals.topAbove.price, usd: signals.topAbove.usd } : null,
        topBelow: signals.topBelow ? { price: signals.topBelow.price, usd: signals.topBelow.usd } : null,
        bias: signals.bias,
        upPath: signals.upPath,
        downPath: signals.downPath,
      },
    };
  }

  private collectSideLevels(side: 'bid' | 'ask') {
    return Array.from(this.levels.values())
      .filter(level => level.side === side)
      .map(level => ({
        price: level.price,
        quantity: level.currentQty,
      }));
  }

  private computeBandOpacity(band: LiquidityBand, currentPrice: number, intensity: number) {
    let opacity = 0.08 + band.intensity * 0.35;
    const distPct = currentPrice > 0 ? Math.abs(currentPrice - band.price) / currentPrice : 0;
    opacity *= Math.max(0.15, 1 - distPct * 10);
    return Math.min(opacity * intensity, 0.55);
  }

  private buildKeyLevels(barrier: KeyLevel | null, upTarget: KeyLevel | null, downTarget: KeyLevel | null) {
    const levels: HeatmapRenderModel['keyLevels'] = [];

    if (barrier) {
      levels.push({
        price: barrier.price,
        kind: 'barrier',
        usd: barrier.usd,
      });
    }

    if (upTarget) {
      levels.push({
        price: upTarget.price,
        kind: 'up-target',
        usd: upTarget.usd,
      });
    }

    if (downTarget) {
      levels.push({
        price: downTarget.price,
        kind: 'down-target',
        usd: downTarget.usd,
      });
    }

    return levels;
  }

  private buildPathZones(
    barrier: KeyLevel | null,
    upTarget: KeyLevel | null,
    downTarget: KeyLevel | null,
    upPath: 'clear' | 'mixed' | 'blocked',
    downPath: 'clear' | 'mixed' | 'blocked',
  ) {
    const zones: HeatmapRenderModel['pathZones'] = [];
    if (barrier && upTarget) {
      zones.push({
        fromPrice: barrier.price,
        toPrice: upTarget.price,
        direction: 'up',
        status: upPath,
      });
    }
    if (barrier && downTarget) {
      zones.push({
        fromPrice: barrier.price,
        toPrice: downTarget.price,
        direction: 'down',
        status: downPath,
      });
    }
    return zones;
  }

  private buildDiagnostics(): HeatmapRenderModel['diagnostics'] {
    const diagnostics: HeatmapRenderModel['diagnostics'] = [];

    for (const level of this.levels.values()) {
      if (level.type === 'real') continue;
      diagnostics.push({
        price: level.price,
        side: level.side,
        kind: level.type,
        confidence: Math.min(1, level.persistenceScore / 100),
      });
    }

    return diagnostics;
  }

  clear() {
    this.levels.clear();
  }

  get levelCount() {
    return this.levels.size;
  }
}

export function heatColor(
  intensity: number,
  side: 'bid' | 'ask',
  type: LiquidityType,
  opacity: number,
): string {
  const alpha = (opacity ?? 0).toFixed(3);

  if (type === 'absorption') {
    const r = Math.round(160 + 60 * intensity);
    const g = Math.round(90 + 50 * intensity);
    return `rgba(${r},${g},0,${alpha})`;
  }

  if (type === 'iceberg') {
    const b = Math.round(120 + 80 * intensity);
    const g = Math.round(100 + 60 * intensity);
    return `rgba(0,${g},${b},${alpha})`;
  }

  if (side === 'bid') {
    if (intensity < 0.35) {
      const t = intensity / 0.35;
      return `rgba(0,${Math.round(30 + t * 50)},${Math.round(60 + t * 60)},${alpha})`;
    }
    if (intensity < 0.7) {
      const t = (intensity - 0.35) / 0.35;
      return `rgba(0,${Math.round(80 + t * 50)},${Math.round(120 + t * 40)},${alpha})`;
    }
    const t = (intensity - 0.7) / 0.3;
    return `rgba(${Math.round(t * 20)},${Math.round(130 + t * 40)},${Math.round(160 - t * 20)},${alpha})`;
  }

  if (intensity < 0.35) {
    const t = intensity / 0.35;
    return `rgba(${Math.round(60 + t * 60)},${Math.round(t * 15)},${Math.round(t * 10)},${alpha})`;
  }
  if (intensity < 0.7) {
    const t = (intensity - 0.35) / 0.35;
    return `rgba(${Math.round(120 + t * 60)},${Math.round(15 + t * 40)},10,${alpha})`;
  }
  const t = (intensity - 0.7) / 0.3;
  return `rgba(${Math.round(180 + t * 40)},${Math.round(55 + t * 40)},${Math.round(10 + t * 10)},${alpha})`;
}
