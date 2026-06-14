'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { ExchangeId, Timeframe } from '@crypto-screener/shared';
import {
  Activity,
  Bell,
  ExternalLink,
  Loader2,
  Radar,
  Search,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import {
  fetchSignalAlerts,
  fetchSignalHealth,
  fetchSignals,
} from '@/lib/signals/api';
import {
  formatSignalPrice,
  formatSignalTime,
  formatSignalUsd,
  signalTypeLabel,
  signalTypeTone,
  type SignalAlert,
  type SignalEvent,
} from '@/lib/signals/models';
import {
  fetchScreener,
  fetchScreenerHealth,
  fetchScreenerSummary,
} from '@/lib/screener/api';
import {
  formatScreenerNumber,
  formatScreenerPercent,
  formatScreenerPrice,
  type ScreenerHealth,
  type ScreenerMarketType,
  type ScreenerRow,
  type ScreenerSummary,
} from '@/lib/screener/models';
import { useMarketStore, useUIStore } from '@/stores';

type MarketFilter = 'all' | ScreenerMarketType;
type ChangeWindow = '1m' | '5m' | '15m';
type ScoreFilter = 'all' | '40' | '60' | '80';

const SCORE_THRESHOLDS: Record<ScoreFilter, number> = {
  all: 0,
  '40': 40,
  '60': 60,
  '80': 80,
};

export function ScreenerView() {
  const [search, setSearch] = useState('');
  const [marketFilter, setMarketFilter] = useState<MarketFilter>('all');
  const [changeWindow, setChangeWindow] = useState<ChangeWindow>('5m');
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>('40');
  const [screenerRows, setScreenerRows] = useState<ScreenerRow[]>([]);
  const [screenerSummary, setScreenerSummary] = useState<ScreenerSummary | null>(null);
  const [screenerHealth, setScreenerHealth] = useState<ScreenerHealth | null>(null);
  const [signals, setSignals] = useState<SignalEvent[]>([]);
  const [alerts, setAlerts] = useState<SignalAlert[]>([]);
  const [signalsHealth, setSignalsHealth] = useState<string>('waiting for ingest');
  const [selectedRowId, setSelectedRowId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setSelectedSymbol = useMarketStore(state => state.setSelectedSymbol);
  const setSelectedExchange = useMarketStore(state => state.setSelectedExchange);
  const setSelectedTimeframe = useMarketStore(state => state.setSelectedTimeframe);
  const setViewMode = useUIStore(state => state.setViewMode);
  const setSelectedCoin = useUIStore(state => state.setSelectedCoin);

  useEffect(() => {
    let cancelled = false;

    const load = async (isInitial = false) => {
      try {
        if (!cancelled) {
          setError(null);
          if (isInitial) setLoading(true);
        }

        const [
          screenerResponse,
          screenerSummaryResponse,
          screenerHealthResponse,
          signalResponse,
          signalAlertResponse,
          signalHealthResponse,
        ] = await Promise.all([
          fetchScreener(),
          fetchScreenerSummary().catch(() => ({ summary: null, timestamp: Date.now() })),
          fetchScreenerHealth().catch(() => ({ health: null, timestamp: Date.now() })),
          fetchSignals().catch(() => ({ items: [], timestamp: Date.now() })),
          fetchSignalAlerts().catch(() => ({ items: [], timestamp: Date.now() })),
          fetchSignalHealth().catch(() => ({ health: null, timestamp: Date.now() })),
        ]);

        if (cancelled) return;

        setScreenerRows(screenerResponse.items);
        setScreenerSummary(screenerSummaryResponse.summary);
        setScreenerHealth(screenerHealthResponse.health);
        setSignals(signalResponse.items);
        setAlerts(signalAlertResponse.items);
        setSignalsHealth(
          signalHealthResponse.health?.lastIngestedAt
            ? `live ${formatSignalTime(signalHealthResponse.health.lastIngestedAt)}`
            : 'waiting for ingest',
        );
        setSelectedRowId(currentId => {
          if (screenerResponse.items.some(item => item.id === currentId)) return currentId;
          return screenerResponse.items[0]?.id ?? '';
        });
      } catch (nextError) {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : 'Failed to load market screener');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load(true);
    const interval = window.setInterval(() => {
      void load(false);
    }, 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return screenerRows
      .filter(row => {
        if (marketFilter !== 'all' && row.marketType !== marketFilter) return false;
        if (row.score < SCORE_THRESHOLDS[scoreFilter]) return false;
        if (!needle) return true;

        const haystack = [
          row.symbol,
          row.baseAsset,
          row.primaryExchange,
          row.state ?? '',
          row.reasons.join(' '),
        ]
          .join(' ')
          .toLowerCase();

        return haystack.includes(needle);
      })
      .sort((a, b) => {
        const aChange = getChangeValue(a, changeWindow);
        const bChange = getChangeValue(b, changeWindow);
        return b.score - a.score || Math.abs(bChange) - Math.abs(aChange);
      });
  }, [changeWindow, marketFilter, scoreFilter, screenerRows, search]);

  const selectedRow = filteredRows.find(row => row.id === selectedRowId) ?? filteredRows[0] ?? null;

  const compactSignals = useMemo(() => {
    return signals
      .slice()
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 8);
  }, [signals]);

  const visibleSourceCount = useMemo(
    () =>
      screenerHealth
        ? Object.values(screenerHealth.sources).filter(source => source.status === 'live').length
        : 0,
    [screenerHealth],
  );

  const averageScore = filteredRows.length > 0
    ? filteredRows.reduce((sum, row) => sum + row.score, 0) / filteredRows.length
    : 0;

  const openChart = (symbol: string, exchange: string, timeframe: Timeframe) => {
    setSelectedSymbol(symbol);
    setSelectedCoin(symbol);
    setSelectedExchange(exchange as ExchangeId);
    setSelectedTimeframe(timeframe);
    setViewMode('terminal');
  };

  return (
    <div className="h-full w-full flex flex-col p-3 gap-3 overflow-hidden">
      <div className="flex flex-col xl:flex-row items-start xl:items-center gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-aurora flex items-center justify-center shadow-glow-sm">
            <Radar className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold gradient-text">Market Screener</h1>
            <p className="text-xs text-text-muted">
              Shared market acceleration, volume and OI monitoring with compact signals context
            </p>
          </div>
        </div>

        <div className="flex-1" />

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search token, state..."
              className="input-premium !py-2 !pl-9 !pr-4 !text-xs w-full !rounded-xl"
            />
          </div>

          <FilterGroup>
            {(['5m', '1m', '15m'] as ChangeWindow[]).map(value => (
              <FilterChip
                key={value}
                active={changeWindow === value}
                onClick={() => setChangeWindow(value)}
                label={value.toUpperCase()}
              />
            ))}
          </FilterGroup>

          <FilterGroup>
            {(['all', '40', '60', '80'] as ScoreFilter[]).map(value => (
              <FilterChip
                key={value}
                active={scoreFilter === value}
                onClick={() => setScoreFilter(value)}
                label={value === 'all' ? 'All scores' : `Score ${value}+`}
              />
            ))}
          </FilterGroup>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 shrink-0">
        <SummaryCard
          label="Active rows"
          value={String(filteredRows.length)}
          helper={screenerSummary ? `${screenerSummary.totalRows} total in shared snapshot` : 'Rows matching current filters'}
          icon={Activity}
        />
        <SummaryCard
          label="Avg score"
          value={averageScore > 0 ? averageScore.toFixed(0) : '0'}
          helper="Current filtered opportunity strength"
          icon={Zap}
        />
        <SummaryCard
          label="Momentum"
          value={String(filteredRows.filter(row => row.state === 'Momentum').length)}
          helper="Fast movers in selected snapshot"
          icon={TrendingUp}
        />
        <SummaryCard
          label="Breakout watch"
          value={String(filteredRows.filter(row => row.state === 'Breakout Watch').length)}
          helper="Volume plus directional expansion"
          icon={ShieldAlert}
        />
        <SummaryCard
          label="Stress setups"
          value={String(filteredRows.filter(row => row.state === 'Short Squeeze Risk' || row.state === 'Long Liquidation Risk').length)}
          helper={
            screenerSummary
              ? `${screenerSummary.shortSqueezeRiskCount + screenerSummary.longLiquidationRiskCount} total squeeze/liquidation rows`
              : 'High-pressure squeeze or liquidation-style states'
          }
          icon={Bell}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.5fr)_380px] gap-3 flex-1 min-h-0">
        <div className="glass-card overflow-hidden min-h-0 flex flex-col">
          <div className="px-4 py-3 border-b border-border bg-bg-primary/30 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-text-primary">Primary screener</div>
              <div className="text-[11px] text-text-muted">
                Shared backend view over price velocity, volume expansion and open interest changes
              </div>
            </div>

            <div className="flex items-center gap-2">
              <FilterGroup>
                {(['all', 'futures', 'spot'] as MarketFilter[]).map(value => (
                  <FilterChip
                    key={value}
                    active={marketFilter === value}
                    onClick={() => setMarketFilter(value)}
                    label={value === 'all' ? 'All markets' : value}
                  />
                ))}
              </FilterGroup>

              <div className="text-[10px] uppercase tracking-wider text-text-muted flex items-center gap-2">
                {loading && <Loader2 className="w-3 h-3 animate-spin" />}
                {screenerHealth?.lastComputedAt ? `live ${formatSignalTime(screenerHealth.lastComputedAt)}` : 'waiting'}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {error ? (
              <div className="h-full flex items-center justify-center text-center text-sm text-negative px-6">
                {error}
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center text-sm text-text-muted px-6">
                No screener rows match current filters yet.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredRows.map(row => {
                  const changeValue = getChangeValue(row, changeWindow);
                  return (
                    <button
                      key={row.id}
                      onClick={() => setSelectedRowId(row.id)}
                      className={`w-full text-left px-4 py-3 transition-colors cursor-pointer ${
                        selectedRow?.id === row.id
                          ? 'bg-accent/8'
                          : 'hover:bg-bg-primary/35'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="text-sm font-semibold text-text-primary">{row.symbol}</div>
                            <span className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider bg-bg-primary/50 text-text-muted border border-border">
                              {row.primaryExchange}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider bg-bg-primary/50 text-text-muted border border-border">
                              {row.marketType}
                            </span>
                            {row.state && <ScreenerStateBadge state={row.state} />}
                          </div>

                          <div className="mt-2 grid grid-cols-2 lg:grid-cols-5 gap-3 text-[11px]">
                            <MetricPill label={`Price ${changeWindow.toUpperCase()}`} value={formatScreenerPercent(changeValue)} tone={changeValue >= 0 ? 'positive' : 'negative'} />
                            <MetricPill label="Volume spike" value={`${row.volumeSpikeRatio.toFixed(2)}x`} />
                            <MetricPill label="OI change" value={formatScreenerPercent(row.openInterestChangePct)} />
                            <MetricPill label="Taker ratio" value={row.takerBuyRatio !== null ? `${row.takerBuyRatio.toFixed(2)}x` : 'n/a'} />
                            <MetricPill label="Liq proxy" value={formatScreenerNumber(row.liquidationUsd)} />
                            <MetricPill label="Score" value={row.score.toFixed(0)} />
                          </div>
                        </div>

                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            openChart(row.symbol, row.primaryExchange, changeWindow);
                          }}
                          className="ghost-btn !py-2 !px-3 !text-xs !rounded-xl shrink-0 flex items-center gap-1.5"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Open Chart
                        </button>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="min-h-0 flex flex-col gap-3">
          <div className="glass-card overflow-hidden min-h-[250px] flex flex-col">
            {selectedRow ? (
              <>
                <div className="px-4 py-3 border-b border-border bg-bg-primary/30 flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="text-lg font-bold text-text-primary">{selectedRow.symbol}</div>
                      {selectedRow.state && <ScreenerStateBadge state={selectedRow.state} />}
                    </div>
                    <div className="mt-1 text-xs text-text-muted">
                      {selectedRow.primaryExchange.toUpperCase()} · {selectedRow.marketType}
                    </div>
                  </div>

                  <button
                    onClick={() => openChart(selectedRow.symbol, selectedRow.primaryExchange, changeWindow)}
                    className="ghost-btn !py-2 !px-3 !text-xs !rounded-xl shrink-0 flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open Chart
                  </button>
                </div>

                <div className="p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <DetailMetric label="Last price" value={formatScreenerPrice(selectedRow.lastPrice)} />
                    <DetailMetric label="Score" value={selectedRow.score.toFixed(0)} />
                    <DetailMetric label="Price 1m" value={formatScreenerPercent(selectedRow.priceChange1m)} />
                    <DetailMetric label="Price 5m" value={formatScreenerPercent(selectedRow.priceChange5m)} />
                    <DetailMetric label="Price 15m" value={formatScreenerPercent(selectedRow.priceChange15m)} />
                    <DetailMetric label="Volume ratio" value={`${selectedRow.volumeSpikeRatio.toFixed(2)}x`} />
                    <DetailMetric label="Volume now" value={formatScreenerNumber(selectedRow.volumeNow)} />
                    <DetailMetric label="Volume avg" value={formatScreenerNumber(selectedRow.volumeAvg)} />
                    <DetailMetric label="OI now" value={formatScreenerNumber(selectedRow.openInterestNow)} />
                    <DetailMetric label="OI change" value={formatScreenerPercent(selectedRow.openInterestChangePct)} />
                    <DetailMetric label="Taker ratio" value={selectedRow.takerBuyRatio !== null ? `${selectedRow.takerBuyRatio.toFixed(2)}x` : 'n/a'} />
                    <DetailMetric label="Liq proxy" value={formatScreenerNumber(selectedRow.liquidationUsd)} />
                  </div>

                  <div className="rounded-2xl border border-border bg-bg-primary/25 p-4">
                    <div className="text-xs uppercase tracking-wider text-text-muted mb-3">Why flagged</div>
                    <div className="space-y-2">
                      {selectedRow.reasons.length > 0 ? selectedRow.reasons.map(reason => (
                        <div key={reason} className="text-sm text-text-secondary leading-relaxed">
                          • {reason}
                        </div>
                      )) : (
                        <div className="text-sm text-text-muted">This row is currently tracked but does not have a strong explanatory label yet.</div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-center text-sm text-text-muted px-6">
                Select a screener row to inspect it in detail.
              </div>
            )}
          </div>

          <div className="glass-card overflow-hidden flex-1 min-h-0 flex flex-col">
            <div className="px-4 py-3 border-b border-border bg-bg-primary/30">
              <div className="text-sm font-semibold text-text-primary">Signals feed</div>
              <div className="text-[11px] text-text-muted">
                Compact secondary context from the existing market-signals system · {signalsHealth}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {compactSignals.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center text-sm text-text-muted px-4">
                  No compact market signals yet.
                </div>
              ) : (
                compactSignals.map(signal => (
                  <motion.div
                    key={signal.id}
                    layout
                    className="rounded-2xl border border-border bg-bg-primary/25 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <SignalTypeBadge eventType={signal.eventType} />
                          <span className="text-[10px] text-text-muted">{formatSignalTime(signal.timestamp)}</span>
                        </div>
                        <div className="mt-2 text-sm font-medium text-text-primary">{signal.summary}</div>
                        <div className="mt-1 text-[11px] text-text-muted">
                          {signal.symbol} · {signal.exchangesInvolved.join(', ').toUpperCase()}
                        </div>
                        <div className="mt-2 text-[11px] text-text-secondary">
                          {formatSignalUsd(signal.usdValue)} · {formatSignalPrice(signal.price)}
                        </div>
                      </div>

                      <button
                        onClick={() => openChart(signal.symbol, signal.exchange, '5m')}
                        className="ghost-btn !py-2 !px-2.5 !text-[11px] !rounded-xl shrink-0"
                      >
                        Open
                      </button>
                    </div>
                  </motion.div>
                ))
              )}
            </div>

            <div className="px-4 py-3 border-t border-border bg-bg-primary/20">
              <div className="text-[11px] text-text-muted">
                Recent alerts in retention: {alerts.length}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1 bg-bg-primary/40 rounded-xl p-1 border border-border">
      {children}
    </div>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs rounded-lg transition-all duration-200 cursor-pointer font-medium ${
        active
          ? 'bg-accent/15 text-accent-light shadow-glow-sm'
          : 'text-text-muted hover:text-text-secondary'
      }`}
    >
      {label}
    </button>
  );
}

function SummaryCard({
  label,
  value,
  helper,
  icon: Icon,
}: {
  label: string;
  value: string;
  helper: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-text-muted">{label}</div>
          <div className="mt-2 text-2xl font-bold text-text-primary">{value}</div>
          <div className="mt-2 text-[11px] text-text-muted leading-relaxed">{helper}</div>
        </div>
        <div className="w-10 h-10 rounded-xl bg-bg-primary/40 border border-border flex items-center justify-center">
          <Icon className="w-4.5 h-4.5 text-accent-light" />
        </div>
      </div>
    </div>
  );
}

function MetricPill({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'positive' | 'negative';
}) {
  const toneClass =
    tone === 'positive'
      ? 'text-emerald-300 border-emerald-400/20 bg-emerald-500/5'
      : tone === 'negative'
        ? 'text-rose-300 border-rose-400/20 bg-rose-500/5'
        : 'text-text-secondary border-border bg-bg-primary/35';

  return (
    <div className={`rounded-xl border px-3 py-2 ${toneClass}`}>
      <div className="text-[10px] uppercase tracking-wider text-text-muted">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-bg-primary/25 p-3">
      <div className="text-[10px] uppercase tracking-wider text-text-muted">{label}</div>
      <div className="mt-2 text-sm font-semibold text-text-primary">{value}</div>
    </div>
  );
}

function SignalTypeBadge({ eventType }: { eventType: SignalEvent['eventType'] }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider border ${signalTypeTone(eventType)}`}>
      {signalTypeLabel(eventType)}
    </span>
  );
}

function ScreenerStateBadge({ state }: { state: NonNullable<ScreenerRow['state']> }) {
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider bg-sky-500/10 text-sky-300 border border-sky-400/20">
      {state}
    </span>
  );
}

function getChangeValue(row: ScreenerRow, window: ChangeWindow): number {
  switch (window) {
    case '1m':
      return row.priceChange1m;
    case '5m':
      return row.priceChange5m;
    case '15m':
      return row.priceChange15m;
  }
}
