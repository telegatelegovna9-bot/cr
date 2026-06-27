import type { ScreenerFilters, ScreenerMetricKey, ScreenerMetricRange, ScreenerTimeframeMetricKey, Timeframe } from '@crypto-screener/shared';

const FILTER_DEFS: Array<{
  key: ScreenerMetricKey;
  label: string;
  timeframe: boolean;
}> = [
  { key: 'changePct', label: 'Change %', timeframe: true },
  { key: 'trades', label: 'Trades', timeframe: true },
  { key: 'turnover', label: 'Turnover', timeframe: true },
  { key: 'natrPct', label: 'NATR %', timeframe: true },
  { key: 'spreadPct', label: 'Spread %', timeframe: false },
  { key: 'fundingPct', label: 'Funding %', timeframe: false },
  { key: 'volumeSpikePct', label: 'Volume Spike %', timeframe: true },
  { key: 'tradesSpikePct', label: 'Trades Spike %', timeframe: true },
  { key: 'oiChangePct', label: 'OI Change %', timeframe: true },
  { key: 'oi', label: 'OI', timeframe: false },
  { key: 'deltaVolumePct', label: 'Delta Volume %', timeframe: true },
  { key: 'deltaVolume', label: 'Delta Volume', timeframe: true },
  { key: 'price', label: 'Price', timeframe: false },
];

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'];

interface ScreenerFilterGridProps {
  filters: ScreenerFilters;
  onMetricChange: (metric: ScreenerMetricKey, next: ScreenerMetricRange | null) => void;
}

export function ScreenerFilterGrid({ filters, onMetricChange }: ScreenerFilterGridProps) {
  return (
    <div className="glass-card grid grid-cols-1 gap-2 p-2.5 md:grid-cols-2 xl:grid-cols-3">
      {FILTER_DEFS.map(({ key, label, timeframe }) => {
        const range = filters.metrics[key];

        return (
        <div key={key} className="rounded-xl border border-border bg-bg-primary/20 p-2.5">
          <div className="mb-1.5 text-[11px] font-semibold text-text-primary">{label}</div>
          <div className="space-y-1.5">
            {timeframe ? (
              <select
                className="input-premium !py-1.5 !text-[11px]"
                value={range?.timeframe ?? '1m'}
                onChange={event =>
                  onMetricChange(key, {
                    ...range,
                    timeframe: event.target.value as ScreenerTimeframeMetricKey extends typeof key ? Timeframe : Timeframe,
                  })
                }
              >
                {TIMEFRAMES.map(value => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            ) : (
              <div className="rounded-lg border border-dashed border-border px-2.5 py-1.5 text-[10px] text-text-muted">
                Current value
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <input
                className="input-premium !py-1.5 !text-[11px]"
                placeholder="Min"
                value={range?.min ?? ''}
                onChange={event => onMetricChange(key, nextRange(range, timeframe, 'min', event.target.value))}
              />
              <input
                className="input-premium !py-1.5 !text-[11px]"
                placeholder="Max"
                value={range?.max ?? ''}
                onChange={event => onMetricChange(key, nextRange(range, timeframe, 'max', event.target.value))}
              />
            </div>
          </div>
        </div>
      )})}
    </div>
  );
}

function nextRange(
  current: ScreenerMetricRange | undefined,
  timeframeEnabled: boolean,
  field: 'min' | 'max',
  raw: string,
): ScreenerMetricRange | null {
  const next: ScreenerMetricRange = {
    ...(current ?? {}),
  };

  if (timeframeEnabled && !next.timeframe) {
    next.timeframe = '1m';
  }

  if (raw.trim() === '') {
    delete next[field];
  } else {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return current ?? null;
    }
    next[field] = parsed;
  }

  if (next.min === undefined && next.max === undefined && !next.timeframe) {
    return null;
  }

  if (next.min === undefined && next.max === undefined && timeframeEnabled) {
    return null;
  }

  return next;
}
