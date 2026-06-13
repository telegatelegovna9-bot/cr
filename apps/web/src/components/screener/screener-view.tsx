'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
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
  fetchSignalSummary,
} from '@/lib/signals/api';
import {
  type SignalHealth,
  formatSignalPrice,
  formatSignalTime,
  formatSignalTradeCount,
  formatSignalUsd,
  signalTypeLabel,
  signalTypeTone,
  type SignalAlert,
  type SignalEvent,
  type SignalEventType,
  type SignalSummary,
} from '@/lib/signals/models';
import { useAlertStore, useUIStore } from '@/stores';

type TypeFilter = 'all' | SignalEventType;
type SizeFilter = 'all' | '100k' | '250k' | '500k' | '1m';

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'All signals' },
  { value: 'large_buy', label: 'Large buys' },
  { value: 'large_sell', label: 'Large sells' },
  { value: 'block_trade', label: 'Block trades' },
  { value: 'cross_exchange_activity', label: 'Cross-exchange' },
  { value: 'anomalous_activity', label: 'Anomalies' },
];

const SIZE_THRESHOLDS: Record<SizeFilter, number> = {
  all: 0,
  '100k': 100_000,
  '250k': 250_000,
  '500k': 500_000,
  '1m': 1_000_000,
};

export function ScreenerView() {
  const addTriggeredAlert = useAlertStore(state => state.addTriggeredAlert);
  const alertConfig = useAlertStore(state => state.config);
  const addAlertHistory = useUIStore(state => state.addAlert);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sizeFilter, setSizeFilter] = useState<SizeFilter>('100k');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [signals, setSignals] = useState<SignalEvent[]>([]);
  const [alerts, setAlerts] = useState<SignalAlert[]>([]);
  const [summary, setSummary] = useState<SignalSummary | null>(null);
  const [health, setHealth] = useState<SignalHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seenSignalAlertIds = useRef<Set<string>>(new Set());
  const initializedSignalAlerts = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const load = async (isInitial = false) => {
      try {
        if (!cancelled) {
          setError(null);
          if (isInitial) setLoading(true);
        }

        const [signalResponse, alertResponse, summaryResponse, healthResponse] = await Promise.all([
          fetchSignals(),
          fetchSignalAlerts().catch(() => ({ items: [], timestamp: Date.now() })),
          fetchSignalSummary().catch(() => ({ summary: null, timestamp: Date.now() })),
          fetchSignalHealth().catch(() => ({ health: null, timestamp: Date.now() })),
        ]);

        if (cancelled) return;

        setSignals(signalResponse.items);
        setAlerts(alertResponse.items);
        setSummary(summaryResponse.summary);
        setHealth(healthResponse.health);
        setSelectedId((currentId) => {
          if (signalResponse.items.some(item => item.id === currentId)) return currentId;
          return signalResponse.items[0]?.id ?? '';
        });
      } catch (nextError) {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : 'Failed to load market signals');
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

  useEffect(() => {
    if (!alertConfig.marketSignalsEnabled) return;

    if (!initializedSignalAlerts.current) {
      seenSignalAlertIds.current = new Set(alerts.map(alert => alert.id));
      initializedSignalAlerts.current = true;
      return;
    }

    for (const alert of alerts) {
      if (seenSignalAlertIds.current.has(alert.id)) continue;
      seenSignalAlertIds.current.add(alert.id);

      addAlertHistory({
        id: `signal-history-${alert.id}`,
        type: 'market_signal',
        priority: alert.minUsdThreshold >= 500_000 ? 'high' : 'medium',
        symbol: signals.find(signal => signal.id === alert.signalId)?.symbol ?? 'UNKNOWN',
        exchange: (signals.find(signal => signal.id === alert.signalId)?.exchange ?? 'binance') as any,
        title: alert.title,
        message: alert.body,
        data: {
          signalId: alert.signalId,
          minUsdThreshold: alert.minUsdThreshold,
        },
        read: false,
        createdAt: alert.timestamp,
      });

      addTriggeredAlert({
        id: `signal-toast-${alert.id}`,
        alertId: alert.signalId,
        symbol: signals.find(signal => signal.id === alert.signalId)?.symbol ?? 'UNKNOWN',
        alert: {
          type: 'market_signal',
          condition: alert.title,
          value: alert.minUsdThreshold,
        },
        currentPrice: signals.find(signal => signal.id === alert.signalId)?.price ?? 0,
        triggeredAt: alert.timestamp,
      });
    }
  }, [alerts, alertConfig.marketSignalsEnabled, addAlertHistory, addTriggeredAlert, signals]);

  const filteredSignals = useMemo(() => {
    const searchNeedle = search.trim().toLowerCase();
    return signals.filter(signal => {
      if (typeFilter !== 'all' && signal.eventType !== typeFilter) return false;
      if (signal.usdValue < SIZE_THRESHOLDS[sizeFilter]) return false;
      if (!searchNeedle) return true;

      const haystack = [
        signal.symbol,
        signal.baseAsset,
        signal.exchange,
        signal.summary,
        signal.details,
        signal.exchangesInvolved.join(' '),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(searchNeedle);
    });
  }, [search, signals, sizeFilter, typeFilter]);

  const selectedSignal =
    filteredSignals.find(signal => signal.id === selectedId) ??
    filteredSignals[0] ??
    null;

  const filteredSummary = useMemo(() => {
    const totalUsd = filteredSignals.reduce((sum, signal) => sum + signal.usdValue, 0);
    const buyUsd = filteredSignals
      .filter(signal => signal.side === 'buy')
      .reduce((sum, signal) => sum + signal.usdValue, 0);
    const sellUsd = filteredSignals
      .filter(signal => signal.side === 'sell')
      .reduce((sum, signal) => sum + signal.usdValue, 0);
    const crossExchangeCount = filteredSignals.filter(signal => signal.eventType === 'cross_exchange_activity').length;
    return { totalUsd, buyUsd, sellUsd, crossExchangeCount };
  }, [filteredSignals]);

  return (
    <div className="h-full w-full flex flex-col p-3 gap-3 overflow-hidden">
      <div className="flex flex-col xl:flex-row items-start xl:items-center gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-aurora flex items-center justify-center shadow-glow-sm">
            <Radar className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold gradient-text">Global Market Signals</h1>
            <p className="text-xs text-text-muted">
              Background multi-exchange monitoring for large trades, clusters and anomalies
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
              placeholder="Search token, exchange..."
              className="input-premium !py-2 !pl-9 !pr-4 !text-xs w-full !rounded-xl"
            />
          </div>

          <div className="flex items-center gap-1 bg-bg-primary/40 rounded-xl p-1 border border-border">
            {(['all', '100k', '250k', '500k', '1m'] as SizeFilter[]).map((value) => (
              <button
                key={value}
                onClick={() => setSizeFilter(value)}
                className={`px-3 py-1.5 text-xs rounded-lg transition-all duration-200 cursor-pointer font-medium ${
                  sizeFilter === value
                    ? 'bg-accent/15 text-accent-light shadow-glow-sm'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {value === 'all' ? 'All live' : `>= $${value.toUpperCase()}`}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 shrink-0">
        <SummaryCard label="Visible notional" value={formatSignalUsd(filteredSummary.totalUsd)} helper="Current filtered signal size" icon={Activity} />
        <SummaryCard label="Buy pressure" value={formatSignalUsd(filteredSummary.buyUsd)} helper="Large buys and buy clusters" icon={TrendingUp} />
        <SummaryCard label="Sell pressure" value={formatSignalUsd(filteredSummary.sellUsd)} helper="Large sells and sell clusters" icon={TrendingDown} />
        <SummaryCard
          label="Cross-exchange"
          value={String(filteredSummary.crossExchangeCount)}
          helper={summary ? `${summary.crossExchangeSignals} total in shared retention` : 'Signals confirmed on multiple venues'}
          icon={ShieldAlert}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(360px,460px)_minmax(0,1fr)] gap-3 flex-1 min-h-0">
        <div className="glass-card overflow-hidden min-h-0 flex flex-col">
          <div className="px-4 py-3 border-b border-border bg-bg-primary/30 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-text-primary">Signal feed</div>
              <div className="text-[11px] text-text-muted">
                Shared backend monitoring across Hyperliquid, Binance, Bybit, OKX and Coinbase
              </div>
            </div>
            <div className="text-[10px] uppercase tracking-wider text-text-muted flex items-center gap-2">
              {loading && <Loader2 className="w-3 h-3 animate-spin" />}
              {health?.lastIngestedAt ? `live ${formatSignalTime(health.lastIngestedAt)}` : 'waiting for ingest'}
              {filteredSignals.length} signals
            </div>
          </div>

          <div className="px-3 py-2 border-b border-border bg-bg-primary/15 flex gap-1 overflow-x-auto">
            {TYPE_FILTERS.map((filter) => (
              <button
                key={filter.value}
                onClick={() => setTypeFilter(filter.value)}
                className={`px-3 py-1.5 text-[11px] rounded-lg whitespace-nowrap transition-all duration-200 cursor-pointer font-medium ${
                  typeFilter === filter.value
                    ? 'bg-accent/15 text-accent-light shadow-glow-sm'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
            {error ? (
              <div className="h-full flex items-center justify-center text-center text-sm text-negative px-6">
                {error}
              </div>
            ) : filteredSignals.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center text-sm text-text-muted px-6">
                No market signals match current filters.
              </div>
            ) : (
              filteredSignals.map((signal) => (
                <button
                  key={signal.id}
                  onClick={() => setSelectedId(signal.id)}
                  className={`w-full text-left rounded-2xl border p-4 transition-all duration-200 cursor-pointer ${
                    selectedSignal?.id === signal.id
                      ? 'border-accent/40 bg-accent/10 shadow-glow-sm'
                      : 'border-border bg-bg-primary/30 hover:border-border-light hover:bg-bg-primary/45'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <SignalTypeBadge eventType={signal.eventType} />
                        <SignalPriorityBadge score={signal.priorityScore} />
                        <span className="text-[11px] text-text-muted">{formatSignalTime(signal.timestamp)}</span>
                      </div>
                      <div className="text-sm font-bold text-text-primary">{signal.summary}</div>
                      <div className="text-[11px] text-text-muted leading-relaxed">
                        {signal.symbol} on {signal.exchangesInvolved.join(', ').toUpperCase()}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold font-mono text-text-primary">{formatSignalUsd(signal.usdValue)}</div>
                      <div className="text-[11px] text-text-muted">{formatSignalTradeCount(signal.tradeCount)}</div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="glass-card overflow-hidden min-h-0 flex flex-col">
          {selectedSignal ? (
            <>
              <div className="px-5 py-4 border-b border-border bg-bg-primary/30 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <SignalTypeBadge eventType={selectedSignal.eventType} />
                    <SignalPriorityBadge score={selectedSignal.priorityScore} />
                  </div>
                  <h2 className="mt-3 text-2xl font-bold text-text-primary">{selectedSignal.summary}</h2>
                  <p className="mt-2 text-sm text-text-secondary max-w-3xl leading-relaxed">
                    {selectedSignal.details}
                  </p>
                </div>

                <button className="ghost-btn !py-2 !px-3 !text-xs !rounded-xl flex items-center gap-1.5 shrink-0">
                  <ExternalLink className="w-3.5 h-3.5" />
                  View venue
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                  <DetailMetric label="Primary exchange" value={selectedSignal.exchange.toUpperCase()} />
                  <DetailMetric label="Market" value={selectedSignal.symbol} />
                  <DetailMetric label="Signal size" value={formatSignalUsd(selectedSignal.usdValue)} />
                  <DetailMetric label="Price" value={formatSignalPrice(selectedSignal.price)} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-border bg-bg-primary/30 p-4">
                    <div className="text-xs uppercase tracking-wider text-text-muted mb-3">Signal detail</div>
                    <div className="space-y-3 text-sm">
                      <KeyValue label="Observed at" value={formatSignalTime(selectedSignal.timestamp)} />
                      <KeyValue label="Side" value={selectedSignal.side === 'buy' ? 'Buy pressure' : 'Sell pressure'} />
                      <KeyValue label="Trade count" value={formatSignalTradeCount(selectedSignal.tradeCount)} />
                      <KeyValue label="Confidence" value={`${Math.round(selectedSignal.confidenceScore * 100)}%`} />
                      <KeyValue label="Priority" value={`${Math.round(selectedSignal.priorityScore * 100)}%`} />
                      <KeyValue label="Block trade" value={selectedSignal.isBlockTrade ? 'Yes' : 'No'} />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border bg-bg-primary/30 p-4">
                    <div className="text-xs uppercase tracking-wider text-text-muted mb-3">Context</div>
                    <div className="space-y-3 text-sm">
                      <KeyValue label="Base asset" value={selectedSignal.baseAsset} />
                      <KeyValue label="Quote asset" value={selectedSignal.quoteAsset} />
                      <KeyValue label="Venues" value={selectedSignal.exchangesInvolved.map(ex => ex.toUpperCase()).join(', ')} />
                      <KeyValue label="Type" value={signalTypeLabel(selectedSignal.eventType)} />
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-bg-primary/30 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Bell className="w-4 h-4 text-accent-light" />
                    <div className="text-xs uppercase tracking-wider text-text-muted">Recent alerts</div>
                  </div>
                  {alerts.length === 0 ? (
                    <div className="text-sm text-text-muted">No recent high-priority alerts available yet.</div>
                  ) : (
                    <div className="space-y-3">
                      {alerts.slice(0, 5).map(alert => (
                        <div key={alert.id} className="rounded-xl border border-border bg-bg-primary/40 px-3 py-3">
                          <div className="text-sm font-semibold text-text-primary">{alert.title}</div>
                          <div className="mt-1 text-xs text-text-secondary">{alert.body}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {health ? (
                  <div className="rounded-2xl border border-border bg-bg-primary/30 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Zap className="w-4 h-4 text-accent-light" />
                      <div className="text-xs uppercase tracking-wider text-text-muted">Signal health</div>
                    </div>
                    <div className="space-y-3 text-sm">
                      <KeyValue label="Last ingest" value={health.lastIngestedAt ? formatSignalTime(health.lastIngestedAt) : 'No events yet'} />
                      <KeyValue label="Total ingested events" value={String(health.totalEventsIngested)} />
                      <KeyValue label="Stored signals" value={String(health.totalSignalsStored)} />
                      <KeyValue label="Stored alerts" value={String(health.totalAlertsStored)} />
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-text-muted">
              No selected signal
            </div>
          )}
        </div>
      </div>
    </div>
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
  icon: typeof Activity;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card px-4 py-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] uppercase tracking-wider text-text-muted">{label}</div>
        <Icon className="w-4 h-4 text-accent-light" />
      </div>
      <div className="mt-2 text-2xl font-bold text-text-primary">{value}</div>
      <div className="mt-1 text-xs text-text-secondary">{helper}</div>
    </motion.div>
  );
}

function SignalTypeBadge({ eventType }: { eventType: SignalEventType }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${signalTypeTone(eventType)}`}>
      <span>{signalTypeLabel(eventType)}</span>
    </span>
  );
}

function SignalPriorityBadge({ score }: { score: number }) {
  const content =
    score >= 0.9
      ? { label: 'Critical', className: 'text-rose-300 bg-rose-500/10 border-rose-400/20' }
      : score >= 0.75
        ? { label: 'High', className: 'text-amber-300 bg-amber-500/10 border-amber-400/20' }
        : { label: 'Active', className: 'text-text-secondary bg-bg-primary/40 border-border' };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${content.className}`}>
      {content.label}
    </span>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-bg-primary/30 px-4 py-4">
      <div className="text-[11px] uppercase tracking-wider text-text-muted">{label}</div>
      <div className="mt-2 text-sm font-bold text-text-primary break-all">{value}</div>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-text-muted">{label}</span>
      <span className="text-right text-text-primary">{value}</span>
    </div>
  );
}
