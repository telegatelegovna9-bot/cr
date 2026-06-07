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

export function PatternsListRow({
  item,
  selected,
  onClick,
}: PatternsListRowProps) {
  const colors = getPatternUi(item.kind);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-2xl border transition-all ${
        selected
          ? 'border-accent/30 bg-accent/8'
          : 'border-border bg-bg-primary/30 hover:bg-surface-hover'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-text-primary truncate">
            {getDisplayBaseSymbol(item.symbol)}
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span
              className={`px-2 py-0.5 text-[11px] rounded-md border uppercase tracking-wide ${colors.bg} ${colors.border} ${colors.text}`}
            >
              {getPatternLabel(item.kind)}
            </span>
            <span className="text-[11px] text-text-muted uppercase">
              {item.timeframe}
            </span>
            <span className="text-[11px] text-text-muted capitalize">
              {item.status}
            </span>
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="text-sm font-semibold text-text-primary">
            {item.quality}
          </div>
          <div className="text-[11px] text-text-muted">{getTimeAgo(item.updatedAt)}</div>
        </div>
      </div>
    </button>
  );
}
