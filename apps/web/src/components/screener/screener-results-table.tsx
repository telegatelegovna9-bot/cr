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
