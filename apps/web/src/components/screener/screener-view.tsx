'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  SCREENER_DEFAULT_EXCHANGES,
  SCREENER_REFRESH_INTERVAL_MS,
  type ExchangeId,
  type ScreenerFilters,
  type ScreenerMarketType,
  type ScreenerMetricKey,
  type ScreenerMetricRange,
  type ScreenerSnapshotRow,
} from '@crypto-screener/shared';
import { Radar } from 'lucide-react';
import { useMarketStore, useUIStore } from '../../stores';
import { buildDisplayRows, type ScreenerSnapshotViewModel } from './screener-view-model';
import { deserializeScreenerPreset, serializeScreenerPreset } from './screener-presets';
import { diffNewScreenerMatches, playScreenerBeep } from './screener-sound';
import { getScreenerSnapshot } from './screener-api';
import type { LocalScreenerPreset } from './screener-types';
import { ScreenerFilterGrid } from './screener-filter-grid';
import { ScreenerResultsTable } from './screener-results-table';
import { ScreenerStatusBar } from './screener-status-bar';
import { ScreenerToolbar } from './screener-toolbar';

const PRESET_STORAGE_KEY = 'crypto-screener:screener-presets:v1';

const DEFAULT_FILTERS: ScreenerFilters = {
  exchanges: [...SCREENER_DEFAULT_EXCHANGES],
  metrics: {},
};

export function ScreenerView() {
  const setSelectedSymbol = useMarketStore(state => state.setSelectedSymbol);
  const setSelectedExchange = useMarketStore(state => state.setSelectedExchange);
  const setSelectedCoin = useUIStore(state => state.setSelectedCoin);
  const setCoinChartModalOpen = useUIStore(state => state.setCoinChartModalOpen);

  const [marketType, setMarketType] = useState<ScreenerMarketType>('spot');
  const [filters, setFilters] = useState<ScreenerFilters>(DEFAULT_FILTERS);
  const [snapshot, setSnapshot] = useState<ScreenerSnapshotViewModel>({
    marketType: 'spot',
    updatedAt: 0,
    rows: [],
  });
  const [presets, setPresets] = useState<LocalScreenerPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [presetName, setPresetName] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastMatchKeysRef = useRef<string[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const stored = window.localStorage.getItem(PRESET_STORAGE_KEY);
    if (!stored) return;

    try {
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return;

      const normalized = parsed
        .map(item => deserializeScreenerPreset(JSON.stringify(item)))
        .filter((item): item is LocalScreenerPreset => item !== null);

      setPresets(normalized);
    } catch {
      setPresets([]);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets.map(preset => JSON.parse(serializeScreenerPreset(preset)))));
  }, [presets]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (typeof document !== 'undefined' && document.hidden) {
        return;
      }

      setIsLoading(true);
      try {
        const response = await getScreenerSnapshot(marketType);
        if (cancelled) return;
        setSnapshot(response.data);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load screener snapshot');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void run();
    const intervalId = window.setInterval(() => {
      void run();
    }, SCREENER_REFRESH_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void run();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [marketType]);

  const visibleRows = useMemo(
    () => buildDisplayRows({ snapshot, filters }),
    [snapshot, filters],
  );

  useEffect(() => {
    const nextKeys = visibleRows.map(row => `${row.exchange}|${row.marketType}|${row.symbol}`);
    const added = diffNewScreenerMatches(lastMatchKeysRef.current, nextKeys);

    if (soundEnabled && added.length > 0) {
      playScreenerBeep();
    }

    lastMatchKeysRef.current = nextKeys;
  }, [soundEnabled, visibleRows]);

  const activePresetName =
    presets.find(preset => preset.id === selectedPresetId)?.name ??
    presetName;
  const activeFilterEntries = useMemo(
    () => Object.entries(filters.metrics).filter(([, range]) => range),
    [filters.metrics],
  );
  const activeFilterCount = activeFilterEntries.length;
  const activeFilterSummary = activeFilterEntries
    .slice(0, 4)
    .map(([metric, range]) => formatFilterSummary(metric, range))
    .filter((value): value is string => Boolean(value));

  const handleMetricChange = (metric: ScreenerMetricKey, next: ScreenerMetricRange | null) => {
    setFilters(current => {
      const metrics = { ...current.metrics };
      if (next) metrics[metric] = next;
      else delete metrics[metric];
      return { ...current, metrics };
    });
    setSelectedPresetId(null);
  };

  const handleExchangeToggle = (exchange: ExchangeId) => {
    setFilters(current => {
      const active = current.exchanges.includes(exchange);
      const exchanges = active
        ? current.exchanges.filter(item => item !== exchange)
        : [...current.exchanges, exchange];
      return { ...current, exchanges };
    });
    setSelectedPresetId(null);
  };

  const handlePresetSelect = (id: string | null) => {
    setSelectedPresetId(id);
    lastMatchKeysRef.current = [];

    if (!id) {
      setPresetName('');
      return;
    }

    const preset = presets.find(item => item.id === id);
    if (!preset) return;

    setPresetName(preset.name);
    setMarketType(preset.marketType);
    setFilters(preset.filters);
    setSoundEnabled(preset.soundEnabled);
  };

  const handleSavePreset = () => {
    const name = presetName.trim();
    if (!name) return;

    const now = Date.now();
    const nextPreset: LocalScreenerPreset = {
      id: selectedPresetId ?? `preset-${now}`,
      name,
      marketType,
      soundEnabled,
      filters,
      createdAt: presets.find(item => item.id === selectedPresetId)?.createdAt ?? now,
      updatedAt: now,
    };

    setPresets(current => {
      const existing = current.find(item => item.id === nextPreset.id);
      if (!existing) return [nextPreset, ...current];
      return current.map(item => (item.id === nextPreset.id ? nextPreset : item));
    });
    setSelectedPresetId(nextPreset.id);
    setFiltersExpanded(false);
  };

  const handleResetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setPresetName('');
    setSelectedPresetId(null);
    lastMatchKeysRef.current = [];
    setFiltersExpanded(false);
  };

  const handleRowClick = (row: ScreenerSnapshotRow) => {
    setSelectedExchange(row.exchange);
    setSelectedSymbol(row.symbol);
    setSelectedCoin(row.symbol);
    setCoinChartModalOpen(true);
  };

  return (
    <div className="flex h-full w-full flex-col gap-3 overflow-hidden p-3">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-aurora shadow-glow-sm">
          <Radar className="h-4.5 w-4.5 text-white" />
        </div>
        <div>
          <h1 className="gradient-text text-lg font-bold">Market Screener</h1>
          <p className="text-xs text-text-muted">Shared live scanner with local presets and sound notifications.</p>
        </div>
      </div>

      <ScreenerToolbar
        marketType={marketType}
        onMarketTypeChange={next => {
          setMarketType(next);
          setSelectedPresetId(null);
          lastMatchKeysRef.current = [];
        }}
        exchanges={filters.exchanges}
        onExchangeToggle={handleExchangeToggle}
        filterCount={activeFilterCount}
        filtersExpanded={filtersExpanded}
        onToggleFilters={() => setFiltersExpanded(current => !current)}
        presetName={presetName}
        onPresetNameChange={setPresetName}
        presets={presets.map(preset => ({ id: preset.id, name: preset.name }))}
        selectedPresetId={selectedPresetId}
        onPresetSelect={handlePresetSelect}
        onSavePreset={handleSavePreset}
        onResetFilters={handleResetFilters}
        soundEnabled={soundEnabled}
        onSoundToggle={() => setSoundEnabled(current => !current)}
      />
      <div className="glass-card flex flex-wrap items-center gap-2 px-3 py-2 text-[11px] text-text-muted">
        <span className="font-semibold text-text-secondary">Filters</span>
        {activeFilterSummary.length === 0 ? (
          <span>No active metric filters</span>
        ) : (
          activeFilterSummary.map(item => (
            <span key={item} className="rounded-lg border border-border bg-bg-primary/20 px-2 py-1">
              {item}
            </span>
          ))
        )}
        {activeFilterCount > activeFilterSummary.length ? (
          <span className="rounded-lg border border-border bg-bg-primary/20 px-2 py-1">
            +{activeFilterCount - activeFilterSummary.length} more
          </span>
        ) : null}
      </div>
      {filtersExpanded ? (
        <>
          <div className="hidden md:block">
            <ScreenerFilterGrid filters={filters} onMetricChange={handleMetricChange} />
          </div>
          <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setFiltersExpanded(false)}>
            <div
              className="absolute inset-x-0 bottom-0 max-h-[78vh] overflow-auto rounded-t-3xl border border-border bg-bg-primary p-3"
              onClick={event => event.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-text-primary">Screener Filters</div>
                  <div className="text-[11px] text-text-muted">Adjust filters without hiding the signals list.</div>
                </div>
                <button
                  type="button"
                  onClick={() => setFiltersExpanded(false)}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary"
                >
                  Close
                </button>
              </div>
              <ScreenerFilterGrid filters={filters} onMetricChange={handleMetricChange} />
            </div>
          </div>
        </>
      ) : null}
      <ScreenerStatusBar
        marketType={marketType}
        matchCount={visibleRows.length}
        updatedAt={snapshot.updatedAt}
        presetName={activePresetName}
        soundEnabled={soundEnabled}
      />
      {error ? (
        <div className="glass-card rounded-xl border border-negative/30 px-4 py-3 text-sm text-negative">
          {error}
        </div>
      ) : null}
      {isLoading && snapshot.rows.length === 0 ? (
        <div className="glass-card rounded-xl px-4 py-3 text-sm text-text-muted">Loading screener snapshot...</div>
      ) : null}
      <ScreenerResultsTable rows={visibleRows} onRowClick={handleRowClick} />
    </div>
  );
}

function formatFilterSummary(metric: string, range: ScreenerMetricRange | undefined): string | null {
  if (!range) return null;

  const parts = [
    typeof range.min === 'number' ? `>= ${range.min}` : null,
    typeof range.max === 'number' ? `<= ${range.max}` : null,
  ].filter((value): value is string => Boolean(value));

  if (parts.length === 0) return null;

  const label = metric.replace(/Pct$/, ' %');
  return range.timeframe ? `${label} ${range.timeframe} ${parts.join(' ')}` : `${label} ${parts.join(' ')}`;
}
