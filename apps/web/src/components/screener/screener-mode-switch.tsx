'use client';

import type { ScreenerCompatibleSummary, ScreenerMode } from '@/lib/screener/models';
import { screenerModeLabel } from '@/lib/screener/models';

const MODES: ScreenerMode[] = ['best-setups', 'spot', 'futures'];

function getModeCount(summary: ScreenerCompatibleSummary | null, mode: ScreenerMode): number | null {
  if (!summary) return null;

  switch (mode) {
    case 'best-setups':
      return summary.eventCounts.bestSetupsCount;
    case 'spot':
      return summary.eventCounts.spotCount;
    case 'futures':
      return summary.eventCounts.futuresCount;
  }
}

export function ScreenerModeSwitch({
  mode,
  onChange,
  summary,
  disabled = false,
}: {
  mode: ScreenerMode;
  onChange: (mode: ScreenerMode) => void;
  summary: ScreenerCompatibleSummary | null;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-bg-primary/35 p-1.5">
      {MODES.map(candidate => {
        const active = candidate === mode;
        const count = getModeCount(summary, candidate);

        return (
          <button
            key={candidate}
            type="button"
            disabled={disabled}
            onClick={() => onChange(candidate)}
            className={`min-w-[132px] rounded-xl px-3 py-2 text-left transition-all duration-200 cursor-pointer ${
              active
                ? 'bg-accent/15 text-text-primary shadow-glow-sm'
                : 'text-text-muted hover:bg-bg-primary/40 hover:text-text-secondary'
            } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
          >
            <div className="text-sm font-semibold">{screenerModeLabel(candidate)}</div>
            <div className="mt-1 text-[11px] uppercase tracking-wider">
              {count === null ? '...' : `${count} events`}
            </div>
          </button>
        );
      })}
    </div>
  );
}
