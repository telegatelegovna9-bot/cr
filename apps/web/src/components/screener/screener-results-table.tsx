import type { ScreenerSnapshotMetricId, ScreenerSnapshotRow } from '@crypto-screener/shared';
import { formatNumber, formatPercent, formatPrice, getTimeAgo } from '../../lib/format';

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

interface ScreenerResultsTableProps {
  rows: ScreenerSnapshotRow[];
  onRowClick?: (row: ScreenerSnapshotRow) => void;
}

export function ScreenerResultsTable({ rows, onRowClick }: ScreenerResultsTableProps) {
  return (
    <div className="glass-card min-h-0 flex-1 overflow-hidden">
      <div className="h-full overflow-auto">
        <div className="space-y-2 p-2 md:hidden">
          {rows.length === 0 ? (
            <div className="rounded-xl border border-border px-3 py-6 text-center text-sm text-text-muted">
              No matches yet
            </div>
          ) : (
            rows.map(row => (
              <button
                key={`${row.exchange}:${row.marketType}:${row.symbol}`}
                type="button"
                className="w-full rounded-xl border border-border bg-bg-primary/20 p-3 text-left transition-colors hover:bg-bg-primary/30"
                onClick={() => onRowClick?.(row)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-text-primary">{row.symbol}</div>
                    <div className="mt-1 text-[11px] uppercase text-text-muted">
                      {row.exchange} · {row.marketType}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-text-primary">{formatPrice(row.price)}</div>
                    <div className="mt-1 text-[11px] text-text-muted">{getTimeAgo(row.updatedAt)}</div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                  <MetricCard label="Change %" value={formatPercent(metric(row, '1m.changePct'))} />
                  <MetricCard label="Volume Spike %" value={formatPercent(metric(row, '1m.volumeSpikePct'))} />
                  <MetricCard label="Funding %" value={formatPercent(row.fundingPct ?? undefined)} />
                  <MetricCard label="Spread %" value={formatPercent(row.spreadPct ?? undefined)} />
                </div>
              </button>
            ))
          )}
        </div>

        <table className="hidden w-full min-w-[980px] text-left text-xs md:table">
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
            {rows.length === 0 ? (
              <tr>
                <td colSpan={HEADERS.length} className="px-3 py-6 text-center text-text-muted">
                  No matches yet
                </td>
              </tr>
            ) : (
              rows.map(row => (
                <tr
                  key={`${row.exchange}:${row.marketType}:${row.symbol}`}
                  className="cursor-pointer border-b border-border/60 text-text-secondary transition-colors hover:bg-bg-primary/30 hover:text-text-primary"
                  onClick={() => onRowClick?.(row)}
                >
                  <td className="px-3 py-2 font-semibold text-text-primary">{row.symbol}</td>
                  <td className="px-3 py-2 uppercase">{row.exchange}</td>
                  <td className="px-3 py-2">{row.marketType}</td>
                  <td className="px-3 py-2">{formatPrice(row.price)}</td>
                  <td className="px-3 py-2">{formatPercent(metric(row, '1m.changePct'))}</td>
                  <td className="px-3 py-2">{formatPercent(metric(row, '1m.volumeSpikePct'))}</td>
                  <td className="px-3 py-2">{formatPercent(metric(row, '1m.tradesSpikePct'))}</td>
                  <td className="px-3 py-2">{formatPercent(metric(row, '1m.oiChangePct'))}</td>
                  <td className="px-3 py-2">{formatPercent(row.fundingPct ?? undefined)}</td>
                  <td className="px-3 py-2">{formatPercent(row.spreadPct ?? undefined)}</td>
                  <td className="px-3 py-2">{formatNumber(metric(row, '1m.turnover'))}</td>
                  <td className="px-3 py-2">{getTimeAgo(row.updatedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function metric(row: ScreenerSnapshotRow, key: ScreenerSnapshotMetricId): number | undefined {
  const value = row.metrics[key];
  return typeof value === 'number' ? value : undefined;
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg-primary/30 px-2.5 py-2">
      <div className="text-[10px] text-text-muted">{label}</div>
      <div className="mt-1 font-semibold text-text-primary">{value}</div>
    </div>
  );
}
