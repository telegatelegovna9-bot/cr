const FILTER_LABELS = [
  'Change %',
  'Trades',
  'Turnover',
  'NATR %',
  'Spread %',
  'Funding %',
  'Volume Spike %',
  'Trades Spike %',
  'OI Change %',
  'OI',
  'Delta Volume %',
  'Delta Volume',
  'Price',
];

export function ScreenerFilterGrid() {
  return (
    <div className="glass-card grid grid-cols-1 gap-3 p-3 md:grid-cols-2 xl:grid-cols-4">
      {FILTER_LABELS.map(label => (
        <div key={label} className="rounded-xl border border-border bg-bg-primary/20 p-3">
          <div className="mb-2 text-xs font-semibold text-text-primary">{label}</div>
          <div className="space-y-2">
            <input className="input-premium !py-2 !text-xs" placeholder="Timeframe" />
            <div className="grid grid-cols-2 gap-2">
              <input className="input-premium !py-2 !text-xs" placeholder="Min" />
              <input className="input-premium !py-2 !text-xs" placeholder="Max" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
