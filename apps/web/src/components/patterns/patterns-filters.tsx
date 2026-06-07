'use client';

import { PATTERN_LABEL_MAP } from '@/lib/patterns/color-map';
import type { PatternFilters } from '@/lib/patterns/models';

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

export function PatternsFilters({
  search,
  filters,
  onSearchChange,
  onFiltersChange,
}: PatternsFiltersProps) {
  return (
    <div className="space-y-3">
      <input
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Search symbol"
        className="w-full bg-bg-primary/40 border border-border rounded-xl px-3 py-2 text-sm text-text-primary outline-none"
      />

      <div className="flex flex-wrap gap-2">
        {(['breakout', 'retest', 'structure_break', 'liquidity_sweep'] as const).map(kind => (
          <button
            key={kind}
            onClick={() =>
              onFiltersChange({
                ...filters,
                kinds: toggleValue(filters.kinds, kind),
              })
            }
            className={`px-3 py-1.5 text-xs rounded-lg border capitalize ${
              filters.kinds.includes(kind)
                ? 'border-accent/30 bg-accent/10 text-accent-light'
                : 'border-border text-text-muted'
            }`}
          >
            {PATTERN_LABEL_MAP[kind]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {(['5m', '15m', '1h'] as const).map(timeframe => (
          <button
            key={timeframe}
            onClick={() =>
              onFiltersChange({
                ...filters,
                timeframes: toggleValue(filters.timeframes, timeframe),
              })
            }
            className={`px-3 py-1.5 text-xs rounded-lg border ${
              filters.timeframes.includes(timeframe)
                ? 'border-accent/30 bg-accent/10 text-accent-light'
                : 'border-border text-text-muted'
            }`}
          >
            {timeframe}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {(['forming', 'confirmed', 'finished'] as const).map(status => (
          <button
            key={status}
            onClick={() =>
              onFiltersChange({
                ...filters,
                statuses: toggleValue(filters.statuses, status),
              })
            }
            className={`px-3 py-1.5 text-xs rounded-lg border capitalize ${
              filters.statuses.includes(status)
                ? 'border-accent/30 bg-accent/10 text-accent-light'
                : 'border-border text-text-muted'
            }`}
          >
            {status}
          </button>
        ))}
      </div>
    </div>
  );
}
