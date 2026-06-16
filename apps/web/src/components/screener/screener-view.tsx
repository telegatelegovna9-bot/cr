'use client';

import { startTransition, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { ExchangeId, Timeframe } from '@crypto-screener/shared';
import { Loader2, Radar, TriangleAlert } from 'lucide-react';
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
  fetchCompatibleScreenerSummary,
  fetchScreenerDetail,
  fetchScreenerFeed,
  fetchScreenerHealth,
} from '@/lib/screener/api';
import {
  deriveScreenerDetailFromEvent,
  getScreenerHealthState,
  screenerModeDescription,
  type ScreenerCompatibleSummary,
  type ScreenerEventDetailItem,
  type ScreenerEventListItem,
  type ScreenerHealth,
  type ScreenerMode,
} from '@/lib/screener/models';
import { useMarketStore, useUIStore } from '@/stores';
import { ScreenerModeSwitch } from './screener-mode-switch';
import { SetupEventDetail } from './setup-event-detail';
import { SetupEventList } from './setup-event-list';
import { SetupSummaryStrip } from './setup-summary-strip';

export function ScreenerView() {
  const [mode, setMode] = useState<ScreenerMode>('best-setups');
  const [events, setEvents] = useState<ScreenerEventListItem[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [selectedDetail, setSelectedDetail] = useState<ScreenerEventDetailItem | null>(null);
  const [summary, setSummary] = useState<ScreenerCompatibleSummary | null>(null);
  const [health, setHealth] = useState<ScreenerHealth | null>(null);
  const [signals, setSignals] = useState<SignalEvent[]>([]);
  const [alerts, setAlerts] = useState<SignalAlert[]>([]);
  const [signalsHealth, setSignalsHealth] = useState('waiting for ingest');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
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
          if (isInitial) {
            setLoading(true);
            setEvents([]);
            setSelectedEventId('');
            setSelectedDetail(null);
          }
        }

        const [
          feedResponse,
          summaryResponse,
          healthResponse,
          signalResponse,
          signalAlertResponse,
          signalHealthResponse,
        ] = await Promise.all([
          fetchScreenerFeed(mode),
          fetchCompatibleScreenerSummary().catch(() => ({ summary: null, timestamp: Date.now() })),
          fetchScreenerHealth().catch(() => ({ health: null, timestamp: Date.now() })),
          fetchSignals().catch(() => ({ items: [], timestamp: Date.now() })),
          fetchSignalAlerts().catch(() => ({ items: [], timestamp: Date.now() })),
          fetchSignalHealth().catch(() => ({ health: null, timestamp: Date.now() })),
        ]);

        if (cancelled) return;

        setEvents(feedResponse.items);
        setSummary(summaryResponse.summary);
        setHealth(healthResponse.health);
        setSignals(signalResponse.items);
        setAlerts(signalAlertResponse.items);
        setSignalsHealth(
          signalHealthResponse.health?.lastIngestedAt
            ? `live ${formatSignalTime(signalHealthResponse.health.lastIngestedAt)}`
            : 'waiting for ingest',
        );
        setSelectedEventId(currentId => {
          if (feedResponse.items.some(item => item.id === currentId)) return currentId;
          return feedResponse.items[0]?.id ?? '';
        });
      } catch (nextError) {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : 'Failed to load screener events');
        setEvents([]);
        setSelectedEventId('');
        setSelectedDetail(null);
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
  }, [mode]);

  const selectedEvent = useMemo(
    () => events.find(item => item.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );

  useEffect(() => {
    let cancelled = false;
    const fallbackDetail = selectedEvent ? deriveScreenerDetailFromEvent(selectedEvent) : null;

    setSelectedDetail(fallbackDetail);

    if (!selectedEventId) {
      setDetailLoading(false);
      return;
    }

    setDetailLoading(true);

    void fetchScreenerDetail(selectedEventId)
      .then(response => {
        if (cancelled) return;
        setSelectedDetail(response.item ?? fallbackDetail);
      })
      .catch(() => {
        if (cancelled) return;
        setSelectedDetail(fallbackDetail);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedEvent, selectedEventId]);

  const compactSignals = useMemo(() => {
    return signals
      .slice()
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 6);
  }, [signals]);

  const healthState = useMemo(() => getScreenerHealthState(health), [health]);

  const openEventChart = (
    item: Pick<ScreenerEventListItem, 'symbol' | 'primaryExchange' | 'chartTimeframe'>,
  ) => {
    setSelectedSymbol(item.symbol);
    setSelectedCoin(item.symbol);
    setSelectedExchange(item.primaryExchange as ExchangeId);
    setSelectedTimeframe(item.chartTimeframe as Timeframe);
    setViewMode('terminal');
  };

  return (
    <div className="flex h-full w-full flex-col gap-3 overflow-hidden p-3">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-aurora shadow-glow-sm">
            <Radar className="h-4.5 w-4.5 text-white" />
          </div>
          <div>
            <h1 className="gradient-text text-lg font-bold">Market Screener</h1>
            <p className="text-xs text-text-muted">{screenerModeDescription(mode)}</p>
          </div>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-text-muted">
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          <span>{healthState.label}</span>
          {health?.lastComputedAt ? <span>live {formatSignalTime(health.lastComputedAt)}</span> : null}
        </div>
      </div>

      <ScreenerModeSwitch
        mode={mode}
        summary={summary}
        disabled={loading}
        onChange={nextMode => {
          startTransition(() => setMode(nextMode));
        }}
      />

      <SetupSummaryStrip
        mode={mode}
        summary={summary}
        health={health}
        healthState={healthState}
      />

      {(error || healthState.tone !== 'live') && (
        <div className={`rounded-2xl border px-4 py-3 text-sm ${
          error
            ? 'border-rose-400/20 bg-rose-500/10 text-rose-300'
            : 'border-amber-400/20 bg-amber-500/10 text-amber-300'
        }`}>
          <div className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-medium">{error ? 'Screener feed error' : `${healthState.label} snapshot`}</div>
              <div className="mt-1 text-[12px] leading-relaxed">
                {error ?? `${healthState.detail}. The UI is showing whatever the shared backend last published.`}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)_320px]">
        <SetupEventList
          mode={mode}
          items={events}
          selectedId={selectedEventId}
          loading={loading}
          healthState={healthState}
          onSelect={setSelectedEventId}
          onOpenChart={openEventChart}
        />

        <div className="min-h-0 overflow-y-auto">
          <SetupEventDetail
            mode={mode}
            item={selectedDetail}
            healthState={healthState}
            detailLoading={detailLoading}
            onOpenChart={openEventChart}
          />
        </div>

        <div className="glass-card flex min-h-0 flex-col overflow-hidden">
          <div className="border-b border-border bg-bg-primary/30 px-4 py-3">
            <div className="text-sm font-semibold text-text-primary">Signals Feed</div>
            <div className="mt-1 text-[11px] text-text-muted">
              Compact secondary context from the existing signals system. {signalsHealth}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2">
            {compactSignals.length === 0 ? (
              <div className="flex h-full min-h-[220px] items-center justify-center px-4 text-center text-sm text-text-muted">
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
                      <div className="flex flex-wrap items-center gap-2">
                        <SignalTypeBadge eventType={signal.eventType} />
                        <span className="text-[10px] text-text-muted">{formatSignalTime(signal.timestamp)}</span>
                      </div>
                      <div className="mt-2 text-sm font-medium text-text-primary">{signal.summary}</div>
                      <div className="mt-1 text-[11px] text-text-muted">
                        {signal.symbol} | {signal.exchangesInvolved.join(', ').toUpperCase()}
                      </div>
                      <div className="mt-2 text-[11px] text-text-secondary">
                        {formatSignalUsd(signal.usdValue)} | {formatSignalPrice(signal.price)}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => openEventChart({
                        symbol: signal.symbol,
                        primaryExchange: signal.exchange,
                        chartTimeframe: '5m',
                      })}
                      className="ghost-btn !rounded-xl !px-2.5 !py-2 !text-[11px] shrink-0"
                    >
                      Open
                    </button>
                  </div>
                </motion.div>
              ))
            )}
          </div>

          <div className="border-t border-border bg-bg-primary/20 px-4 py-3">
            <div className="text-[11px] text-text-muted">Recent retained alerts: {alerts.length}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SignalTypeBadge({ eventType }: { eventType: SignalEvent['eventType'] }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${signalTypeTone(eventType)}`}>
      {signalTypeLabel(eventType)}
    </span>
  );
}
