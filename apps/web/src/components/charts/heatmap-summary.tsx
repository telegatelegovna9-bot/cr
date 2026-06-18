'use client';

import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { formatPrice } from '@/lib/format';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  type HeatmapSummarySnapshot,
  shouldCommitHeatmapSummary,
} from './heatmap-summary-state';

const EMPTY_SUMMARY: HeatmapSummarySnapshot = {
  barrier: null,
  topAbove: null,
  topBelow: null,
  bias: 'balanced',
  upPath: 'blocked',
  downPath: 'blocked',
};

const HEATMAP_SUMMARY_MIN_INTERVAL_MS = 400;

export interface HeatmapSummaryHandle {
  publish: (summary: HeatmapSummarySnapshot) => void;
}

export const HeatmapSummary = forwardRef<HeatmapSummaryHandle>(function HeatmapSummary(_props, ref) {
  const [collapsed, setCollapsed] = useState(false);
  const [summary, setSummary] = useState<HeatmapSummarySnapshot>(EMPTY_SUMMARY);
  const latestSummaryRef = useRef<HeatmapSummarySnapshot | null>(null);
  const lastCommittedAtRef = useRef(0);

  useImperativeHandle(ref, () => ({
    publish(nextSummary) {
      const now = Date.now();
      if (!shouldCommitHeatmapSummary({
        previous: latestSummaryRef.current,
        next: nextSummary,
        lastCommittedAt: lastCommittedAtRef.current,
        now,
        minIntervalMs: HEATMAP_SUMMARY_MIN_INTERVAL_MS,
      })) {
        return;
      }

      latestSummaryRef.current = nextSummary;
      lastCommittedAtRef.current = now;
      setSummary(nextSummary);
    },
  }), []);

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
          onClick={() => setCollapsed(value => !value)}
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
            {summary.barrier ? `${fmtUsd(summary.barrier.usd)} @ ${formatPrice(summary.barrier.price)}` : '—'}
          </div>
          <div>
            Up target:{' '}
            {summary.topAbove ? `${fmtUsd(summary.topAbove.usd)} @ ${formatPrice(summary.topAbove.price)}` : '—'}
          </div>
          <div>
            Down target:{' '}
            {summary.topBelow ? `${fmtUsd(summary.topBelow.usd)} @ ${formatPrice(summary.topBelow.price)}` : '—'}
          </div>
          <div>Up path: {summary.upPath}</div>
          <div>Down path: {summary.downPath}</div>
          <div>Bias: {summary.bias}</div>
        </div>
      )}
    </div>
  );
});
