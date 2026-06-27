const HEADERS = [
  'Symbol',
  'Exchange',
  'Market',
  'Price',
  'Change %',
  'Volume Spike %',
  'Trades Spike %',
  'OI Change %',
  'Funding %',
  'Spread %',
  'Turnover',
  'Updated',
];

export function ScreenerResultsTable() {
  return (
    <div className="glass-card min-h-0 flex-1 overflow-hidden">
      <div className="h-full overflow-auto">
        <table className="w-full min-w-[980px] text-left text-xs">
          <thead className="sticky top-0 bg-bg-primary/90 backdrop-blur">
            <tr>
              {HEADERS.map(header => (
                <th key={header} className="border-b border-border px-3 py-2 font-semibold text-text-secondary">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={HEADERS.length} className="px-3 py-6 text-center text-text-muted">
                No matches yet
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
