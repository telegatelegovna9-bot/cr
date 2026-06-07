'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Loader2,
  Search,
  Zap,
} from 'lucide-react';
import { fetchHyperliquidFlows } from '@/lib/flows/api';
import {
  formatFlowAmount,
  formatFlowUsd,
  shortenAddress,
  type HyperliquidFlowEvent,
  type HyperliquidFlowKind,
  type HyperliquidFlowProvider,
} from '@/lib/flows/models';

type KindFilter = 'all' | HyperliquidFlowKind;
type SizeFilter = 'all' | '100k' | '500k' | '1m';

const KIND_FILTERS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'All flows' },
  { value: 'twap-started', label: 'TWAP started' },
  { value: 'twap-completed', label: 'TWAP done' },
  { value: 'twap-cancelled', label: 'TWAP cancelled' },
  { value: 'core-transfer', label: 'Core transfer' },
  { value: 'spot-transfer', label: 'Spot transfer' },
];

const SIZE_THRESHOLDS: Record<SizeFilter, number> = {
  all: 0,
  '100k': 100_000,
  '500k': 500_000,
  '1m': 1_000_000,
};

export function ScreenerView() {
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [sizeFilter, setSizeFilter] = useState<SizeFilter>('500k');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [events, setEvents] = useState<HyperliquidFlowEvent[]>([]);
  const [provider, setProvider] = useState<HyperliquidFlowProvider>('mock');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async (isInitial = false) => {
      try {
        if (!cancelled) {
          setError(null);
          if (isInitial) setLoading(true);
        }

        const response = await fetchHyperliquidFlows({
          kind: kindFilter,
          search,
          minUsd: SIZE_THRESHOLDS[sizeFilter],
          limit: 50,
        });

        if (cancelled) return;
        setEvents(response.items);
        setProvider(response.provider);
        setSelectedId((currentId) => {
          if (response.items.some((item) => item.id === currentId)) return currentId;
          return response.items[0]?.id ?? '';
        });
      } catch (nextError) {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : 'Failed to load flows');
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
  }, [kindFilter, search, sizeFilter]);

  const filteredEvents = useMemo(() => events, [events]);

  const selectedEvent =
    filteredEvents.find((event) => event.id === selectedId) ??
    filteredEvents[0] ??
    null;

  const summary = useMemo(() => {
    const totalUsd = filteredEvents.reduce((sum, event) => sum + event.usdValue, 0);
    const twapCount = filteredEvents.filter((event) => event.kind.startsWith('twap')).length;
    const transferCount = filteredEvents.filter((event) => event.kind.includes('transfer')).length;
    return { totalUsd, twapCount, transferCount };
  }, [filteredEvents]);

  return (
    <div className="h-full w-full flex flex-col p-3 gap-3 overflow-hidden">
      <div className="flex flex-col xl:flex-row items-start xl:items-center gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-aurora flex items-center justify-center shadow-glow-sm">
            <Zap className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold gradient-text">Hyperliquid Flows</h1>
            <p className="text-xs text-text-muted">
              Public TWAP and transfer activity formatted for fast monitoring
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
              placeholder="Search token or wallet..."
              className="input-premium !py-2 !pl-9 !pr-4 !text-xs w-full !rounded-xl"
            />
          </div>

          <div className="flex items-center gap-1 bg-bg-primary/40 rounded-xl p-1 border border-border">
            {(['all', '100k', '500k', '1m'] as SizeFilter[]).map((value) => (
              <button
                key={value}
                onClick={() => setSizeFilter(value)}
                className={`px-3 py-1.5 text-xs rounded-lg transition-all duration-200 cursor-pointer font-medium ${
                  sizeFilter === value
                    ? 'bg-accent/15 text-accent-light shadow-glow-sm'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {value === 'all' ? 'All size' : `>= $${value.toUpperCase()}`}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 shrink-0">
        <SummaryCard label="Visible flow" value={formatFlowUsd(summary.totalUsd)} helper="Current filtered notional" />
        <SummaryCard label="TWAP events" value={String(summary.twapCount)} helper="Started / completed / cancelled" />
        <SummaryCard label="Transfers" value={String(summary.transferCount)} helper="Core and spot transfers" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(360px,460px)_minmax(0,1fr)] gap-3 flex-1 min-h-0">
        <div className="glass-card overflow-hidden min-h-0 flex flex-col">
          <div className="px-4 py-3 border-b border-border bg-bg-primary/30 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-text-primary">Hyperliquid flow feed</div>
              <div className="text-[11px] text-text-muted">
                Source: {provider === 'quicknode' ? 'QuickNode dataset' : 'backend mock provider'}
              </div>
            </div>
            <div className="text-[10px] uppercase tracking-wider text-text-muted flex items-center gap-2">
              {loading && <Loader2 className="w-3 h-3 animate-spin" />}
              {filteredEvents.length} events
            </div>
          </div>

          <div className="px-3 py-2 border-b border-border bg-bg-primary/15 flex gap-1 overflow-x-auto">
            {KIND_FILTERS.map((filter) => (
              <button
                key={filter.value}
                onClick={() => setKindFilter(filter.value)}
                className={`px-3 py-1.5 text-[11px] rounded-lg whitespace-nowrap transition-all duration-200 cursor-pointer font-medium ${
                  kindFilter === filter.value
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
            ) : filteredEvents.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center text-sm text-text-muted px-6">
                No flow events match current filters.
              </div>
            ) : (
              filteredEvents.map((event) => (
                <button
                  key={event.id}
                  onClick={() => setSelectedId(event.id)}
                  className={`w-full text-left rounded-2xl border p-4 transition-all duration-200 cursor-pointer ${
                    selectedEvent?.id === event.id
                      ? 'border-accent/40 bg-accent/10 shadow-glow-sm'
                      : 'border-border bg-bg-primary/30 hover:border-border-light hover:bg-bg-primary/45'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <FlowKindBadge event={event} />
                        <FlowStatusBadge status={event.status} />
                        <span className="text-[11px] text-text-muted">{event.timestampLabel}</span>
                      </div>
                      <div className="text-sm font-bold text-text-primary">
                        {event.side === 'transfer'
                          ? `${formatFlowUsd(event.usdValue)} moved in ${event.token}`
                          : `${formatFlowUsd(event.usdValue)} ${event.side === 'buy' ? 'buying' : 'selling'} ${event.token}`}
                      </div>
                      <div className="text-[11px] text-text-muted leading-relaxed">
                        {event.kind.includes('transfer') && event.fromAddress && event.toAddress ? (
                          <span className="inline-flex items-center gap-1.5 flex-wrap">
                            <span>{shortenAddress(event.fromAddress)}</span>
                            <ArrowRight className="w-3 h-3" />
                            <span>{shortenAddress(event.toAddress)}</span>
                          </span>
                        ) : (
                          <span>{shortenAddress(event.wallet)}</span>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold font-mono text-text-primary">{formatFlowAmount(event.amount)}</div>
                      <div className="text-[11px] text-text-muted">{event.token}</div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="glass-card overflow-hidden min-h-0 flex flex-col">
          {selectedEvent ? (
            <>
              <div className="px-5 py-4 border-b border-border bg-bg-primary/30 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <FlowKindBadge event={selectedEvent} />
                    <FlowStatusBadge status={selectedEvent.status} />
                  </div>
                  <h2 className="mt-3 text-2xl font-bold text-text-primary">
                    {selectedEvent.side === 'transfer'
                      ? `${formatFlowUsd(selectedEvent.usdValue)} ${selectedEvent.token} transfer`
                      : `${formatFlowUsd(selectedEvent.usdValue)} ${selectedEvent.token} ${selectedEvent.side}`}
                  </h2>
                  <p className="mt-2 text-sm text-text-secondary max-w-3xl leading-relaxed">
                    {selectedEvent.note}
                  </p>
                </div>

                <button className="ghost-btn !py-2 !px-3 !text-xs !rounded-xl flex items-center gap-1.5 shrink-0">
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open source
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                  <DetailMetric label="Wallet" value={shortenAddress(selectedEvent.wallet)} />
                  <DetailMetric label="Token" value={selectedEvent.tokenPair ?? selectedEvent.token} />
                  <DetailMetric label="Amount" value={`${formatFlowAmount(selectedEvent.amount)} ${selectedEvent.token}`} />
                  <DetailMetric label="Notional" value={formatFlowUsd(selectedEvent.usdValue)} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-border bg-bg-primary/30 p-4">
                    <div className="text-xs uppercase tracking-wider text-text-muted mb-3">Flow detail</div>
                    <div className="space-y-3 text-sm">
                      <KeyValue label="Observed at" value={selectedEvent.timestampLabel} />
                      <KeyValue label="Trust tag" value={selectedEvent.trustLabel} />
                      {selectedEvent.frequencyLabel && <KeyValue label="Frequency" value={selectedEvent.frequencyLabel} />}
                      {selectedEvent.etaLabel && <KeyValue label="ETA" value={selectedEvent.etaLabel} />}
                      {selectedEvent.periodLabel && <KeyValue label="Period" value={selectedEvent.periodLabel} />}
                      {selectedEvent.priceLabel && <KeyValue label="Price" value={selectedEvent.priceLabel} />}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border bg-bg-primary/30 p-4">
                    <div className="text-xs uppercase tracking-wider text-text-muted mb-3">Context</div>
                    <div className="space-y-3 text-sm">
                      {selectedEvent.marketCapLabel && <KeyValue label="Market cap" value={selectedEvent.marketCapLabel} />}
                      {selectedEvent.volume24hLabel && <KeyValue label="24h volume" value={selectedEvent.volume24hLabel} />}
                      {selectedEvent.fromAddress && <KeyValue label="From" value={shortenAddress(selectedEvent.fromAddress)} mono />}
                      {selectedEvent.toAddress && <KeyValue label="To" value={shortenAddress(selectedEvent.toAddress)} mono />}
                      {!selectedEvent.fromAddress && !selectedEvent.toAddress && (
                        <KeyValue label="Source wallet" value={shortenAddress(selectedEvent.wallet)} mono />
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-bg-primary/30 p-4">
                  <div className="text-xs uppercase tracking-wider text-text-muted mb-3">How this should feel in production</div>
                  <ul className="space-y-2 text-sm text-text-secondary">
                    <li>Show only strong public events, not every micro movement.</li>
                    <li>Keep the feed focused on size, timing, wallet and asset.</li>
                    <li>Use our own tags and summaries instead of third-party labels.</li>
                    <li>Frontend now reads backend data, so only the global provider is still external.</li>
                  </ul>
                </div>
              </div>
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-text-muted">
              No selected event
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card px-4 py-4"
    >
      <div className="text-[11px] uppercase tracking-wider text-text-muted">{label}</div>
      <div className="mt-2 text-2xl font-bold text-text-primary">{value}</div>
      <div className="mt-1 text-xs text-text-secondary">{helper}</div>
    </motion.div>
  );
}

function FlowKindBadge({ event }: { event: HyperliquidFlowEvent }) {
  const labelMap: Record<HyperliquidFlowKind, string> = {
    'twap-started': 'TWAP started',
    'twap-completed': 'TWAP completed',
    'twap-cancelled': 'TWAP cancelled',
    'core-transfer': 'Core transfer',
    'spot-transfer': 'Spot transfer',
  };

  const colorMap: Record<HyperliquidFlowKind, string> = {
    'twap-started': 'bg-emerald-500/10 text-emerald-300 border-emerald-400/20',
    'twap-completed': 'bg-sky-500/10 text-sky-300 border-sky-400/20',
    'twap-cancelled': 'bg-rose-500/10 text-rose-300 border-rose-400/20',
    'core-transfer': 'bg-amber-500/10 text-amber-300 border-amber-400/20',
    'spot-transfer': 'bg-violet-500/10 text-violet-300 border-violet-400/20',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${colorMap[event.kind]}`}>
      <span>{labelMap[event.kind]}</span>
    </span>
  );
}

function FlowStatusBadge({ status }: { status: HyperliquidFlowEvent['status'] }) {
  const content = status === 'active'
    ? { icon: Clock3, label: 'Active', className: 'text-accent-light bg-accent/10 border-accent/20' }
    : status === 'forming'
      ? { icon: Zap, label: 'Forming', className: 'text-amber-300 bg-amber-500/10 border-amber-400/20' }
      : { icon: CheckCircle2, label: 'Finished', className: 'text-text-secondary bg-bg-primary/40 border-border' };
  const Icon = content.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${content.className}`}>
      <Icon className="w-3 h-3" />
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

function KeyValue({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-text-muted">{label}</span>
      <span className={`text-right text-text-primary ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}
