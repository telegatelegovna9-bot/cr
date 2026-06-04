import type { LiquidityBand } from './liquidity-buckets';

export interface KeyLevel {
  price: number;
  usd: number;
  side: 'bid' | 'ask';
  label: 'Liquidity Above' | 'Liquidity Below' | 'Nearest Magnet' | 'Reaction Zone';
}

export interface LiquidityGap {
  fromPrice: number;
  toPrice: number;
}

export interface LiquiditySignals {
  topAbove: KeyLevel | null;
  topBelow: KeyLevel | null;
  nearestMagnet: KeyLevel | null;
  reactionZones: KeyLevel[];
  gaps: LiquidityGap[];
  bias: 'pull up' | 'pull down' | 'balanced';
}

function strongestLevel(
  bands: LiquidityBand[],
  side: 'bid' | 'ask',
  currentPrice: number,
  label: KeyLevel['label'],
): KeyLevel | null {
  const filtered = bands.filter(b => side === 'ask' ? b.price > currentPrice : b.price < currentPrice);
  if (!filtered.length) return null;

  const strongest = [...filtered].sort((a, b) => b.usd - a.usd)[0];
  return strongest
    ? {
        price: strongest.price,
        usd: strongest.usd,
        side,
        label,
      }
    : null;
}

function detectLiquidityGaps(bands: LiquidityBand[]): LiquidityGap[] {
  if (bands.length < 2) return [];
  const sorted = [...bands].sort((a, b) => a.price - b.price);
  const gaps: LiquidityGap[] = [];

  let minStep = Number.POSITIVE_INFINITY;
  for (let i = 1; i < sorted.length; i++) {
    const step = sorted[i].price - sorted[i - 1].price;
    if (step > 0 && step < minStep) minStep = step;
  }

  const threshold = Number.isFinite(minStep)
    ? (sorted.length <= 2 ? minStep * 0.95 : Math.max(minStep * 3, sorted[0].price * 0.004))
    : 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const next = sorted[i];
    if (next.price - prev.price >= threshold) {
      gaps.push({ fromPrice: prev.price, toPrice: next.price });
    }
  }

  return gaps;
}

export function summarizeLiquidityBias({
  currentPrice,
  topAbove,
  topBelow,
}: {
  currentPrice: number;
  topAbove: { price: number; usd: number } | null;
  topBelow: { price: number; usd: number } | null;
}): LiquiditySignals['bias'] {
  if (!topAbove && !topBelow) return 'balanced';
  if (topAbove && !topBelow) return 'pull up';
  if (!topAbove && topBelow) return 'pull down';

  const aboveDistance = Math.max((topAbove!.price - currentPrice) / currentPrice, 0.00001);
  const belowDistance = Math.max((currentPrice - topBelow!.price) / currentPrice, 0.00001);

  const aboveScore = topAbove!.usd / aboveDistance;
  const belowScore = topBelow!.usd / belowDistance;

  if (aboveScore > belowScore * 1.15) return 'pull up';
  if (belowScore > aboveScore * 1.15) return 'pull down';
  return 'balanced';
}

export function buildLiquiditySignals({
  currentPrice,
  bands,
}: {
  currentPrice: number;
  bands: LiquidityBand[];
}): LiquiditySignals {
  const topAbove = strongestLevel(bands, 'ask', currentPrice, 'Liquidity Above');
  const topBelow = strongestLevel(bands, 'bid', currentPrice, 'Liquidity Below');

  const magnetCandidates = [topAbove, topBelow].filter((level): level is KeyLevel => level !== null);
  const nearestMagnet = magnetCandidates.length
    ? [...magnetCandidates].sort((a, b) => {
        const aDistance = Math.max(Math.abs(a.price - currentPrice) / currentPrice, 0.00001);
        const bDistance = Math.max(Math.abs(b.price - currentPrice) / currentPrice, 0.00001);
        return (b.usd / bDistance) - (a.usd / aDistance);
      })[0]
    : null;

  const reactionZones = [topAbove, topBelow]
    .filter((level): level is KeyLevel => level !== null)
    .map(level => ({ ...level, label: 'Reaction Zone' as const }));

  return {
    topAbove,
    topBelow,
    nearestMagnet: nearestMagnet
      ? { ...nearestMagnet, label: 'Nearest Magnet' }
      : null,
    reactionZones,
    gaps: detectLiquidityGaps(bands),
    bias: summarizeLiquidityBias({ currentPrice, topAbove, topBelow }),
  };
}
