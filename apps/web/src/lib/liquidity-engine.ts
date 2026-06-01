// Liquidity tracking engine with smart classification
// Processes orderbook updates and classifies levels: Real, Spoof, Iceberg, Absorption

export type LiquidityType = 'real' | 'spoof' | 'iceberg' | 'absorption';

export interface HeatmapSettings {
  showReal: boolean;
  showSpoof: boolean;
  showIceberg: boolean;
  showAbsorption: boolean;
  intensity: number;   // 0.5 – 2.0
  minSizeUsd: number;  // USD threshold
  autoFade: boolean;
}

export const DEFAULT_HEATMAP_SETTINGS: HeatmapSettings = {
  showReal: true,
  showSpoof: true,
  showIceberg: true,
  showAbsorption: true,
  intensity: 1.0,
  minSizeUsd: 0,
  autoFade: true,
};

interface TrackedLevel {
  price: number;
  side: 'bid' | 'ask';
  currentQty: number;
  peakQty: number;
  minQtyObserved: number;
  totalAccumQty: number;  // sum of all observations (for intensity)
  firstSeen: number;
  lastSeen: number;
  snapshotCount: number;
  prevQty: number;
  refillCount: number;    // iceberg: volume depletes then refills
  touchCount: number;     // absorption: price hit this level
  lastTouchTime: number;
  type: LiquidityType;
  persistenceScore: number; // 0–100 (drives visual brightness)
}

export interface VisualLevel {
  price: number;
  side: 'bid' | 'ask';
  type: LiquidityType;
  /** 0–1: normalized accumulated volume, drives color intensity */
  intensity: number;
  /** 0–1: transparency after decay/distance/persistence */
  opacity: number;
}

// Time constants
const FADE_MS = 60_000;
const EVICT_MS = 180_000;
const TOUCH_DEBOUNCE_MS = 3_000;

export class LiquidityEngine {
  private levels = new Map<string, TrackedLevel>();
  private priceStep = 1;

  setPriceStep(step: number) {
    this.priceStep = Math.max(step, 1e-10);
  }

  private round(p: number): number {
    return Math.round(p / this.priceStep) * this.priceStep;
  }

  private key(side: 'bid' | 'ask', price: number): string {
    return `${side}:${price.toFixed(10)}`;
  }

  /** Feed one orderbook diff/snapshot update */
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
        const rp = this.round(price);
        const k = this.key(side, rp);
        const ex = this.levels.get(k);

        if (ex) {
          const prev = ex.currentQty;
          ex.prevQty = prev;
          ex.currentQty = quantity;
          ex.lastSeen = now;
          ex.snapshotCount++;
          ex.totalAccumQty += quantity;

          if (quantity > ex.peakQty) ex.peakQty = quantity;
          if (quantity < ex.minQtyObserved) ex.minQtyObserved = quantity;

          // Iceberg: qty dropped, then jumped back up significantly
          if (prev > 0 && quantity > prev * 1.5 && prev < ex.peakQty * 0.5 && ex.snapshotCount > 4) {
            ex.refillCount++;
          }

          // Absorption: price is touching this level
          if (currentPrice > 0 && Math.abs(currentPrice - rp) / currentPrice < 0.0008) {
            if (now - ex.lastTouchTime > TOUCH_DEBOUNCE_MS) {
              ex.touchCount++;
              ex.lastTouchTime = now;
            }
          }
        } else {
          this.levels.set(k, {
            price: rp, side,
            currentQty: quantity, peakQty: quantity,
            minQtyObserved: quantity, prevQty: 0,
            totalAccumQty: quantity,
            firstSeen: now, lastSeen: now,
            snapshotCount: 1,
            refillCount: 0, touchCount: 0, lastTouchTime: 0,
            type: 'real', persistenceScore: 0,
          });
        }
      }
    }

    this.updateTypes(now, currentPrice);
    this.evict(now);
  }

  private updateTypes(now: number, currentPrice: number): void {
    for (const lvl of this.levels.values()) {
      const age = now - lvl.firstSeen;
      const staleness = now - lvl.lastSeen;
      const isActive = staleness < 800;

      // Persistence score (drives brightness)
      const ageS = Math.min(age / 40_000, 1) * 40;
      const cntS = Math.min(lvl.snapshotCount / 150, 1) * 35;
      const sizeS = Math.min((lvl.peakQty * lvl.price) / 250_000, 1) * 25;
      lvl.persistenceScore = Math.round(ageS + cntS + sizeS);

      // Classify
      if (lvl.refillCount >= 2) {
        lvl.type = 'iceberg';
      } else if (lvl.touchCount >= 2 && isActive) {
        lvl.type = 'absorption';
      } else if (!isActive && lvl.peakQty * lvl.price > 25_000 && age < 30_000) {
        // Appeared, was large, disappeared without price touching → spoof
        lvl.type = 'spoof';
      } else {
        lvl.type = 'real';
      }
    }
  }

  private evict(now: number): void {
    for (const [k, lvl] of this.levels.entries()) {
      if (now - lvl.lastSeen > EVICT_MS) this.levels.delete(k);
    }
  }

  /** Returns levels ready for canvas rendering */
  getVisualLevels(settings: HeatmapSettings, currentPrice: number): VisualLevel[] {
    const now = Date.now();
    const result: VisualLevel[] = [];

    // Find max for normalization (log scale for better range)
    let maxAccum = 1;
    for (const lvl of this.levels.values()) {
      if (lvl.totalAccumQty > maxAccum) maxAccum = lvl.totalAccumQty;
    }

    for (const lvl of this.levels.values()) {
      if (!settings.showReal && lvl.type === 'real') continue;
      if (!settings.showSpoof && lvl.type === 'spoof') continue;
      if (!settings.showIceberg && lvl.type === 'iceberg') continue;
      if (!settings.showAbsorption && lvl.type === 'absorption') continue;

      const usd = lvl.currentQty * lvl.price;
      if (settings.minSizeUsd > 0 && usd < settings.minSizeUsd) continue;

      const age = now - lvl.lastSeen;
      if (settings.autoFade && age > FADE_MS * 1.1) continue;

      let opacity = 1.0;

      if (settings.autoFade) {
        opacity *= Math.max(0, 1 - age / FADE_MS);
      }

      // Persistence brightness: new levels are dim, persistent ones brighter
      opacity *= 0.1 + 0.9 * (lvl.persistenceScore / 100);

      // Distance fade: levels far from mid-price are nearly invisible
      if (currentPrice > 0) {
        const distPct = Math.abs(currentPrice - lvl.price) / currentPrice;
        opacity *= Math.max(0.05, 1 - distPct * 8);
      }

      if (lvl.type === 'spoof') opacity *= 0.5;
      if (lvl.type === 'iceberg') opacity *= 0.85;
      if (lvl.type === 'spoof') opacity *= 0.65 + 0.35 * Math.sin(now * 0.0025);

      // Cap at 0.55 — dark muted palette, candles always win visually
      opacity = Math.min(opacity * settings.intensity, 0.55);
      if (opacity < 0.025) continue;

      const logAccum = Math.log1p(lvl.totalAccumQty);
      const logMax = Math.log1p(maxAccum);
      const intensity = Math.min(logAccum / logMax, 1);

      result.push({ price: lvl.price, side: lvl.side, type: lvl.type, intensity, opacity });
    }

    return result;
  }

  clear() {
    this.levels.clear();
  }

  get levelCount() { return this.levels.size; }
}

// ─── Color System ─────────────────────────────────────────────────────────────

/**
 * Heatmap color palette: dark, muted tones that read as background.
 * Candles must ALWAYS be the primary visual element — colors here
 * are intentionally desaturated so they never compete with price action.
 *
 * Bid palette : dark navy → muted teal (never bright green)
 * Ask palette : dark maroon → muted rust (never bright red)
 * Strong levels get slightly brighter, but cap stays low.
 */
export function heatColor(
  intensity: number,
  side: 'bid' | 'ask',
  type: LiquidityType,
  opacity: number,
): string {
  const a = (opacity ?? 0).toFixed(3);

  if (type === 'absorption') {
    // Muted amber — not competing with candle green/red
    const r = Math.round(160 + 60 * intensity);
    const g = Math.round(90 + 50 * intensity);
    return `rgba(${r},${g},0,${a})`;
  }

  if (type === 'iceberg') {
    // Muted steel blue
    const b = Math.round(120 + 80 * intensity);
    const g = Math.round(100 + 60 * intensity);
    return `rgba(0,${g},${b},${a})`;
  }

  if (side === 'bid') {
    // Dark navy → muted teal. Never bright green (would clash with bullish candles).
    if (intensity < 0.35) {
      const t = intensity / 0.35;
      return `rgba(0,${Math.round(30 + t * 50)},${Math.round(60 + t * 60)},${a})`;
    } else if (intensity < 0.70) {
      const t = (intensity - 0.35) / 0.35;
      return `rgba(0,${Math.round(80 + t * 50)},${Math.round(120 + t * 40)},${a})`;
    } else {
      const t = (intensity - 0.70) / 0.30;
      return `rgba(${Math.round(t * 20)},${Math.round(130 + t * 40)},${Math.round(160 - t * 20)},${a})`;
    }
  } else {
    // Dark maroon → muted rust. Never bright red (would clash with bearish candles).
    if (intensity < 0.35) {
      const t = intensity / 0.35;
      return `rgba(${Math.round(60 + t * 60)},${Math.round(t * 15)},${Math.round(t * 10)},${a})`;
    } else if (intensity < 0.70) {
      const t = (intensity - 0.35) / 0.35;
      return `rgba(${Math.round(120 + t * 60)},${Math.round(15 + t * 40)},10,${a})`;
    } else {
      const t = (intensity - 0.70) / 0.30;
      return `rgba(${Math.round(180 + t * 40)},${Math.round(55 + t * 40)},${Math.round(10 + t * 10)},${a})`;
    }
  }
}
