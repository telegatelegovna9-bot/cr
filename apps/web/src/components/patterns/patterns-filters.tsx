'use client';

import { PATTERN_LABEL_MAP } from '@/lib/patterns/color-map';
import type { PatternFilters, PatternKind, PatternTimeframe } from '@/lib/patterns/models';

interface PatternsFiltersProps {
  search: string;
  filters: PatternFilters;
  onSearchChange: (value: string) => void;
  onFiltersChange: (filters: PatternFilters) => void;
}

function toggleValue<T extends string>(values: T[], value: T): T[] {
  return values.includes(value)
    ? values.filter(item => item !== value)
    : [...values, value];
}

const SMC_KINDS: PatternKind[] = ['breakout', 'retest', 'structure_break', 'liquidity_sweep', 'fvg'];
const FORMATION_KINDS: PatternKind[] = ['triangle', 'wedge', 'flag', 'cascade'];
const ALL_TIMEFRAMES: PatternTimeframe[] = ['5m', '15m', '1h', '4h', '1d'];

export function PatternsFilters({
  search,
  filters,
  onSearchChange,
  onFiltersChange,
}: PatternsFiltersProps) {
  return (
    <div className="space-y-2.5">
      <input
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Search symbol"
        className="w-full bg-bg-primary/40 border border-border rounded-xl px-3 py-2 text-sm text-text-primary outline-none"
      />

      <div className="space-y-1">
        <div className="text-[10px] text-text-muted uppercase tracking-wider px-0.5">SMC</div>
        <div className="flex flex-wrap gap-1.5">
          {SMC_KINDS.map(kind => (
            <button
              key={kind}
              onClick={() => onFiltersChange({ ...filters, kinds: toggleValue(filters.kinds, kind) })}
              className={`px-2.5 py-1 text-[11px] rounded-lg border capitalize ${
                filters.kinds.includes(kind)
                  ? 'border-accent/30 bg-accent/10 text-accent-light'
                  : 'border-border text-text-muted hover:text-text-secondary'
              }`}
            >
              {PATTERN_LABEL_MAP[kind]}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-[10px] text-text-muted uppercase tracking-wider px-0.5">Formations</div>
        <div className="flex flex-wrap gap-1.5">
          {FORMATION_KINDS.map(kind => (
            <button
              key={kind}
              onClick={() => onFiltersChange({ ...filters, kinds: toggleValue(filters.kinds, kind) })}
              className={`px-2.5 py-1 text-[11px] rounded-lg border capitalize ${
                filters.kinds.includes(kind)
                  ? 'border-accent/30 bg-accent/10 text-accent-light'
                  : 'border-border text-text-muted hover:text-text-secondary'
              }`}
            >
              {PATTERN_LABEL_MAP[kind]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {ALL_TIMEFRAMES.map(timeframe => (
          <button
            key={timeframe}
            onClick={() => onFiltersChange({ ...filters, timeframes: toggleValue(filters.timeframes, timeframe) })}
            className={`px-2.5 py-1 text-[11px] rounded-lg border font-mono ${
              filters.timeframes.includes(timeframe)
                ? 'border-accent/30 bg-accent/10 text-accent-light'
                : 'border-border text-text-muted hover:text-text-secondary'
            }`}
          >
            {timeframe}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(['forming', 'confirmed', 'finished'] as const).map(status => (
          <button
            key={status}
            onClick={() => onFiltersChange({ ...filters, statuses: toggleValue(filters.statuses, status) })}
            className={`px-2.5 py-1 text-[11px] rounded-lg border capitalize ${
              filters.statuses.includes(status)
                ? 'border-accent/30 bg-accent/10 text-accent-light'
                : 'border-border text-text-muted hover:text-text-secondary'
            }`}
          >
            {status}
          </button>
        ))}
      </div>
    </div>
  );
}
