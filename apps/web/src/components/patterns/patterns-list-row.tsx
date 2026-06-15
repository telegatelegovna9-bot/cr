'use client';

import { getDisplayBaseSymbol } from '@/lib/display-symbol';
import { getTimeAgo } from '@/lib/format';
import { getPatternLabel, getPatternUi } from '@/lib/patterns/color-map';
import type { PatternListItem } from '@/lib/patterns/models';

interface PatternsListRowProps {
  item: PatternListItem;
  selected: boolean;
  onClick: () => void;
}

function getFreshnessDot(updatedAt: number): { color: string; title: string } {
  const ageMs = Date.now() - updatedAt;
  if (ageMs < 2 * 60_000) return { color: 'bg-emerald-400', title: 'Fresh (< 2 min)' };
  if (ageMs < 10 * 60_000) return { color: 'bg-yellow-400', title: 'Recent (< 10 min)' };
  return { color: 'bg-zinc-500', title: 'Older (> 10 min)' };
}

const TF_WEIGHT: Record<string, string> = {
  '1d': 'opacity-100',
  '4h': 'opacity-90',
  '1h': 'opacity-80',
  '15m': 'opacity-70',
  '5m': 'opacity-60',
};

export function PatternsListRow({
  item,
  selected,
  onClick,
}: PatternsListRowProps) {
  const colors = getPatternUi(item.kind);
  const dot = getFreshnessDot(item.updatedAt);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-2xl border transition-all ${
        selected
          ? 'border-accent/30 bg-accent/8'
          : 'border-border bg-bg-primary/30 hover:bg-surface-hover'
      } ${TF_WEIGHT[item.timeframe] ?? 'opacity-80'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-2 h-2 rounded-full shrink-0 ${dot.color}`}
              title={dot.title}
            />
            <div className="text-sm font-medium text-text-primary truncate">
              {getDisplayBaseSymbol(item.symbol)}
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span
              className={`px-2 py-0.5 text-[10px] rounded-md border uppercase tracking-wide ${colors.bg} ${colors.border} ${colors.text}`}
            >
              {getPatternLabel(item.kind)}
            </span>
            <span className="text-[10px] font-mono text-text-muted uppercase">
              {item.timeframe}
            </span>
            <span className={`text-[10px] capitalize ${
              item.status === 'forming' ? 'text-yellow-400/80' :
              item.status === 'confirmed' ? 'text-emerald-400/80' :
              'text-zinc-500'
            }`}>
              {item.status}
            </span>
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="text-sm font-semibold text-text-primary">
            {item.quality}
          </div>
          <div className="text-[10px] text-text-muted">{getTimeAgo(item.updatedAt)}</div>
        </div>
      </div>
    </button>
  );
}
