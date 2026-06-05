'use client';

import { formatPrice } from '@/lib/format';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

type SummaryLevel = { price: number; usd: number } | null;

export function HeatmapSummary({
  barrier,
  topAbove,
  topBelow,
  bias,
  upPath,
  downPath,
}: {
  barrier: SummaryLevel;
  topAbove: SummaryLevel;
  topBelow: SummaryLevel;
  bias: 'pull up' | 'pull down' | 'balanced';
  upPath: 'clear' | 'mixed' | 'blocked';
  downPath: 'clear' | 'mixed' | 'blocked';
}) {
  const [collapsed, setCollapsed] = useState(false);
  const fmtUsd = (value: number) => {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
    return `${Math.round(value)}`;
  };

  return (
    <div className="absolute top-10 left-2 z-20 rounded-lg border border-white/10 bg-black/55 px-2 py-1.5 text-[10px] text-white/80 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold uppercase tracking-[0.16em] text-[9px] text-white/55">Liquidity</div>
        <button
          type="button"
          onClick={() => setCollapsed(v => !v)}
          className="text-white/55 hover:text-white/85 transition-colors"
          aria-label={collapsed ? 'Expand liquidity summary' : 'Collapse liquidity summary'}
        >
          {collapsed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
        </button>
      </div>
      {!collapsed && (
        <div className="mt-1 space-y-0.5 pointer-events-none">
          <div>
            Barrier:{' '}
            {barrier ? `${fmtUsd(barrier.usd)} @ ${formatPrice(barrier.price)}` : '—'}
          </div>
          <div>
            Up target:{' '}
            {topAbove ? `${fmtUsd(topAbove.usd)} @ ${formatPrice(topAbove.price)}` : '—'}
          </div>
          <div>
            Down target:{' '}
            {topBelow ? `${fmtUsd(topBelow.usd)} @ ${formatPrice(topBelow.price)}` : '—'}
          </div>
          <div>Up path: {upPath}</div>
          <div>Down path: {downPath}</div>
          <div>Bias: {bias}</div>
        </div>
      )}
    </div>
  );
}
