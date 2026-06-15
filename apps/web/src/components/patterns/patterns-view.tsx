'use client';

import { useEffect, useMemo, useRef } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { ChartCard } from '@/components/charts/chart-card';
import { useAlertStore, useMarketStore, useUIStore } from '@/stores';
import type { PatternDetail } from '@/lib/patterns/models';
import { PatternDetailsCard } from './pattern-details-card';
import { PatternsSidebar } from './patterns-sidebar';
import { usePatternDetail } from './use-pattern-detail';
import { usePatternsQuery } from './use-patterns-query';

export function PatternsView() {
  const patternsUI = useUIStore(state => state.patternsUI);
  const personalGrid = useUIStore(state => state.personalGrid);
  const setPatternsSearch = useUIStore(state => state.setPatternsSearch);
  const setPatternsFilters = useUIStore(state => state.setPatternsFilters);
  const setSelectedPatternId = useUIStore(state => state.setSelectedPatternId);
  const setViewMode = useUIStore(state => state.setViewMode);
  const setPersonalGridSlot = useUIStore(state => state.setPersonalGridSlot);
  const addAlert = useUIStore(state => state.addAlert);
  const selectedTimeframe = useMarketStore(state => state.selectedTimeframe);
  const addTriggeredAlert = useAlertStore(state => state.addTriggeredAlert);
  const query = usePatternsQuery(patternsUI.search, patternsUI.filters);
  const confirmedSeededRef = useRef(false);
  const seenConfirmedIdsRef = useRef<Set<string>>(new Set());

  const selectedItem = useMemo(
    () => {
      if (patternsUI.selectedPatternId) {
        return query.items.find(item => item.id === patternsUI.selectedPatternId) ?? null;
      }

      return query.items[0] ?? null;
    },
    [patternsUI.selectedPatternId, query.items],
  );
  const resolvedPatternId = patternsUI.selectedPatternId ?? selectedItem?.id ?? null;
  const detail = usePatternDetail(resolvedPatternId, query.refreshKey);
  const selectedPatternDetail = useMemo<PatternDetail | null>(() => {
    if (detail.item && detail.item.id === resolvedPatternId) return detail.item;
    if (!selectedItem?.geometry) return null;

    return {
      id: selectedItem.id,
      symbol: selectedItem.symbol,
      timeframe: selectedItem.timeframe,
      kind: selectedItem.kind,
      status: selectedItem.status,
      quality: selectedItem.quality,
      updatedAt: selectedItem.updatedAt,
      exchange: selectedItem.exchange ?? 'binance',
      marketType: selectedItem.marketType ?? 'futures',
      geometry: selectedItem.geometry,
      detectedAt: selectedItem.detectedAt ?? selectedItem.updatedAt,
      finishedAt: selectedItem.finishedAt ?? null,
      expiresAt: selectedItem.expiresAt ?? null,
    };
  }, [detail.item, resolvedPatternId, selectedItem]);

  const activePattern = selectedPatternDetail ?? selectedItem;

  useEffect(() => {
    if (!patternsUI.selectedPatternId && query.items[0]) {
      setSelectedPatternId(query.items[0].id);
    }
  }, [patternsUI.selectedPatternId, query.items, setSelectedPatternId]);

  useEffect(() => {
    if (query.loading) return;

    const currentConfirmed = query.items.filter(item => item.status === 'confirmed');

    if (!confirmedSeededRef.current) {
      seenConfirmedIdsRef.current = new Set(currentConfirmed.map(item => item.id));
      confirmedSeededRef.current = true;
      return;
    }

    for (const item of currentConfirmed) {
      if (seenConfirmedIdsRef.current.has(item.id)) continue;

      seenConfirmedIdsRef.current.add(item.id);
      addAlert({
        id: `pattern-history-${item.id}`,
        type: 'pattern_detected',
        priority: 'medium',
        symbol: item.symbol,
        exchange: 'binance',
        title: `${item.kind} confirmed`,
        message: `${item.timeframe.toUpperCase()} · Quality ${item.quality}`,
        data: {
          patternId: item.id,
          kind: item.kind,
          timeframe: item.timeframe,
          quality: item.quality,
        },
        read: false,
        createdAt: Date.now(),
      });
      addTriggeredAlert({
        id: `pattern-toast-${item.id}-${item.updatedAt}`,
        alertId: item.id,
        symbol: item.symbol,
        alert: {
          type: 'pattern_detected',
          condition: item.kind,
          value: item.quality,
        },
        currentPrice: item.quality,
        triggeredAt: Date.now(),
      });
    }
  }, [addAlert, addTriggeredAlert, query.items, query.loading]);

  const handleOpenInTerminal = () => {
    if (!activePattern) return;

    const targetSlot =
      personalGrid.slots.find(slot => !slot.symbol)?.id ??
      personalGrid.slots[0]?.id;

    if (!targetSlot) return;

    setPersonalGridSlot(targetSlot, {
      symbol: activePattern.symbol,
      exchange: 'binance',
      marketType: 'futures',
      timeframe: activePattern.timeframe ?? selectedTimeframe,
    });
    setViewMode('grid');
  };

  return (
    <div className="h-full grid grid-cols-[360px_minmax(0,1fr)] gap-3 p-3 min-h-0">
      <PatternsSidebar
        search={patternsUI.search}
        filters={patternsUI.filters}
        items={query.items}
        selectedPatternId={patternsUI.selectedPatternId}
        hasMore={query.hasMore}
        onSearchChange={setPatternsSearch}
        onFiltersChange={setPatternsFilters}
        onSelect={setSelectedPatternId}
        onLoadMore={query.loadMore}
        onRefresh={query.refresh}
      />

      <div className="min-h-0 flex flex-col gap-3">
        <PatternDetailsCard
          item={activePattern}
          loading={detail.loading && !selectedPatternDetail}
          onOpenInTerminal={activePattern ? handleOpenInTerminal : undefined}
        />
        <div className="flex-1 min-h-0">
          {activePattern ? (
            <ChartCard
              symbol={activePattern.symbol}
              exchange="binance"
              index={0}
              initialTimeframe={activePattern.timeframe}
              initialMarketType="futures"
              patternOverlay={selectedPatternDetail}
              headerActions={
                <button
                  onClick={handleOpenInTerminal}
                  className="px-2.5 py-1 text-[10px] rounded-lg border border-border text-text-muted hover:text-text-secondary flex items-center gap-1.5"
                >
                  <ArrowUpRight className="w-3 h-3" />
                  Open
                </button>
              }
            />
          ) : (
            <div className="h-full glass-card border border-border rounded-2xl flex items-center justify-center text-sm text-text-muted">
              Select a pattern to inspect its live chart.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
