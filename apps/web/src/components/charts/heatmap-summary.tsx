'use client';

import { formatPrice } from '@/lib/format';

type SummaryLevel = { price: number; usd: number } | null;

export function HeatmapSummary({
  topAbove,
  topBelow,
  bias,
}: {
  topAbove: SummaryLevel;
  topBelow: SummaryLevel;
  bias: 'pull up' | 'pull down' | 'balanced';
}) {
  const fmtUsd = (value: number) => {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
    return `${Math.round(value)}`;
  };

  return (
    <div className="absolute top-2 right-2 z-20 rounded-lg border border-white/10 bg-black/55 px-2 py-1.5 text-[10px] text-white/80 backdrop-blur-sm pointer-events-none">
      <div className="font-semibold uppercase tracking-[0.16em] text-[9px] text-white/55">Liquidity</div>
      <div className="mt-1 space-y-0.5">
        <div>
          Above:{' '}
          {topAbove ? `${fmtUsd(topAbove.usd)} @ ${formatPrice(topAbove.price)}` : '—'}
        </div>
        <div>
          Below:{' '}
          {topBelow ? `${fmtUsd(topBelow.usd)} @ ${formatPrice(topBelow.price)}` : '—'}
        </div>
        <div>Bias: {bias}</div>
      </div>
    </div>
  );
}
