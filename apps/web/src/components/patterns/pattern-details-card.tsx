'use client';

import { getDisplayBaseSymbol } from '@/lib/display-symbol';
import { getTimeAgo } from '@/lib/format';
import { getPatternLabel, getPatternUi } from '@/lib/patterns/color-map';
import type { PatternListItem } from '@/lib/patterns/models';

interface PatternDetailsCardProps {
  item: PatternListItem | null;
  onOpenInTerminal?: () => void;
  loading?: boolean;
}

export function PatternDetailsCard({
  item,
  onOpenInTerminal,
  loading = false,
}: PatternDetailsCardProps) {
  if (!item) {
      return (
        <div className="glass-card border border-border rounded-2xl p-4">
          <div className="text-sm text-text-muted">
          Select a setup to inspect its live chart.
          </div>
        </div>
      );
  }

  const colors = getPatternUi(item.kind);

  return (
    <div className="glass-card border border-border rounded-2xl p-4 flex items-start justify-between gap-4">
      <div className="space-y-2 min-w-0">
        <div className="text-base font-semibold text-text-primary">
          {getDisplayBaseSymbol(item.symbol)}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`px-2 py-0.5 text-[11px] rounded-md border uppercase tracking-wide ${colors.bg} ${colors.border} ${colors.text}`}
          >
            {getPatternLabel(item.kind)}
          </span>
          <span className="text-xs text-text-muted uppercase">
            {item.timeframe}
          </span>
          <span className="text-xs text-text-muted capitalize">
            {item.status}
          </span>
          <span className="text-xs text-text-muted">Quality {item.quality}</span>
          <span className="text-xs text-text-muted">
            Updated {getTimeAgo(item.updatedAt)}
          </span>
        </div>
      </div>

      <button
        onClick={onOpenInTerminal}
        disabled={!onOpenInTerminal || loading}
        className="px-3 py-2 text-xs rounded-xl border border-border text-text-muted hover:text-text-secondary shrink-0"
      >
        {loading ? 'Loading...' : 'Open in Terminal'}
      </button>
    </div>
  );
}
