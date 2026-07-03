'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Timeframe, Trade } from '@crypto-screener/shared';
import { useMarketStore, useOrderbookStore, useTradeStore } from '@/stores';
import { useWebSocket } from '@/hooks/useWebSocket';
import { findPreferredOrderbook, getOrderbookMapKey } from '@/lib/orderbook-identity';
import {
  DEFAULT_DOM_TAPE_SETTINGS,
  type DomTapeSettings,
} from '@/lib/dom-tape';
import { ChartCard } from './chart-card';
import { DomTapePanel } from './dom-tape-panel';

interface ChartTerminalShellProps {
  symbol: string;
  exchange?: string;
  index: number;
  onExpand?: () => void;
  isModal?: boolean;
  initialData?: any[];
  initialTimeframe?: string;
  initialMarketType?: 'spot' | 'futures';
  onTimeframeChange?: (timeframe: Timeframe) => void;
  onDataLoaded?: (symbol: string, data: any[], timeframe: string) => void;
  showHeaderPrice?: boolean;
  headerActions?: ReactNode;
  isViewActive?: boolean;
  historySessionToken?: number;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
const DOM_TAPE_SETTINGS_STORAGE_KEY = 'chart-dom-tape-settings-v1';
const EMPTY_TRADES: Trade[] = [];

function loadDomTapeSettings(): DomTapeSettings {
  if (typeof window === 'undefined') return DEFAULT_DOM_TAPE_SETTINGS;

  try {
    const raw = window.localStorage.getItem(DOM_TAPE_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_DOM_TAPE_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<DomTapeSettings>;
    return {
      compressionPct: typeof parsed.compressionPct === 'number' ? Math.max(0.0025, parsed.compressionPct) : DEFAULT_DOM_TAPE_SETTINGS.compressionPct,
      autoCenter: typeof parsed.autoCenter === 'boolean' ? parsed.autoCenter : DEFAULT_DOM_TAPE_SETTINGS.autoCenter,
      tapeSizeMode: parsed.tapeSizeMode === 'coin' ? 'coin' : DEFAULT_DOM_TAPE_SETTINGS.tapeSizeMode,
      minTapeSizeUsd: typeof parsed.minTapeSizeUsd === 'number' ? Math.max(0, parsed.minTapeSizeUsd) : DEFAULT_DOM_TAPE_SETTINGS.minTapeSizeUsd,
    };
  } catch {
    return DEFAULT_DOM_TAPE_SETTINGS;
  }
}

export function ChartTerminalShell({
  symbol,
  exchange: exchangeProp,
  index,
  onExpand,
  isModal = false,
  initialData,
  initialTimeframe,
  initialMarketType,
  onTimeframeChange,
  onDataLoaded,
  showHeaderPrice = true,
  headerActions,
  isViewActive = true,
  historySessionToken = 0,
}: ChartTerminalShellProps) {
  const selectedExchange = useMarketStore(state => state.selectedExchange);
  const exchange = exchangeProp || selectedExchange;
  const updateOrderbook = useOrderbookStore(state => state.updateOrderbook);
  const { subscribe, unsubscribe } = useWebSocket();

  const [marketType, setMarketType] = useState<'spot' | 'futures'>(
    initialMarketType ?? (symbol.includes(':USDT') ? 'futures' : 'spot'),
  );
  const [activeDomMarketType, setActiveDomMarketType] = useState<'spot' | 'futures'>(marketType);
  const [domTapeSettings, setDomTapeSettings] = useState<DomTapeSettings>(loadDomTapeSettings);
  const lastFetchedOrderbookKeyRef = useRef<string | null>(null);

  const effectiveSymbol = useMemo(() => {
    if (marketType === 'futures' && !symbol.includes(':')) return `${symbol}:USDT`;
    if (marketType === 'spot' && symbol.includes(':USDT')) return symbol.replace(':USDT', '');
    return symbol;
  }, [marketType, symbol]);
  const pairedMarketCandidate = useMemo(() => {
    if (marketType === 'futures') {
      return {
        marketType: 'spot' as const,
        symbol: effectiveSymbol.replace(/:USDT$/, ''),
      };
    }

    return {
      marketType: 'futures' as const,
      symbol: effectiveSymbol.includes(':USDT') ? effectiveSymbol : `${effectiveSymbol}:USDT`,
    };
  }, [effectiveSymbol, marketType]);
  const pairedTicker = useMarketStore(state =>
    state.getTicker(pairedMarketCandidate.symbol, exchange, pairedMarketCandidate.marketType),
  );
  const pairedMarket = pairedTicker
    ? { marketType: pairedMarketCandidate.marketType, symbol: pairedMarketCandidate.symbol }
    : null;

  const availableDomMarkets = useMemo(() => {
    const primary = { marketType, symbol: effectiveSymbol };
    if (!pairedMarket) return [primary];
    return [primary, pairedMarket];
  }, [effectiveSymbol, marketType, pairedMarket]);

  const activeDomMarket = useMemo(
    () => availableDomMarkets.find(entry => entry.marketType === activeDomMarketType) ?? availableDomMarkets[0],
    [activeDomMarketType, availableDomMarkets],
  );
  const activeDomSymbol = activeDomMarket?.symbol ?? null;
  const activeDomResolvedMarketType = activeDomMarket?.marketType ?? null;

  const activeDomSymbolCandidates = useMemo(() => {
    const activeDomSymbol = activeDomMarket?.symbol ?? effectiveSymbol;
    const candidates = new Set<string>([activeDomSymbol]);
    if (activeDomMarketType === 'futures') {
      if (activeDomSymbol.endsWith(':USDT')) candidates.add(activeDomSymbol.replace(':USDT', ''));
      if (!activeDomSymbol.includes(':')) candidates.add(`${activeDomSymbol}:USDT`);
    } else if (activeDomSymbol.endsWith(':USDT')) {
      candidates.add(activeDomSymbol.replace(':USDT', ''));
    }
    return Array.from(candidates);
  }, [activeDomMarket, activeDomMarketType, effectiveSymbol]);

  const domOrderbook = useOrderbookStore(state => {
    if (!activeDomMarket) return undefined;
    for (const candidate of activeDomSymbolCandidates) {
      const exact = state.books.get(getOrderbookMapKey(exchange, activeDomMarket.marketType, candidate));
      if (exact) return exact;
    }
    return findPreferredOrderbook(state.books, exchange, activeDomMarket.marketType, activeDomSymbolCandidates);
  });

  const domTrades = useTradeStore(state => {
    if (!activeDomMarket) return EMPTY_TRADES;
    return state.trades.get(`${exchange}:${activeDomMarket.marketType}:${activeDomMarket.symbol}`) ?? EMPTY_TRADES;
  });

  useEffect(() => {
    setActiveDomMarketType(marketType);
  }, [marketType, effectiveSymbol, exchange]);

  useEffect(() => {
    if (!availableDomMarkets.some(entry => entry.marketType === activeDomMarketType)) {
      setActiveDomMarketType(availableDomMarkets[0]?.marketType ?? marketType);
    }
  }, [activeDomMarketType, availableDomMarkets, marketType]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(DOM_TAPE_SETTINGS_STORAGE_KEY, JSON.stringify(domTapeSettings));
  }, [domTapeSettings]);

  useEffect(() => {
    if (!isViewActive || !activeDomSymbol || !activeDomResolvedMarketType) return;

    const fetchKey = `${exchange}:${activeDomResolvedMarketType}:${activeDomSymbol}`;
    if (lastFetchedOrderbookKeyRef.current === fetchKey) return;
    lastFetchedOrderbookKeyRef.current = fetchKey;

    const controller = new AbortController();
    const searchParams = new URLSearchParams({
      exchange,
      marketType: activeDomResolvedMarketType,
    });

    fetch(`${API_BASE}/api/market/orderbook/${encodeURIComponent(activeDomSymbol)}?${searchParams.toString()}`, {
      signal: controller.signal,
    })
      .then(resp => resp.ok ? resp.json() : null)
      .then(payload => {
        if (!payload?.data) return;
        updateOrderbook(payload.data);
      })
      .catch(() => {});

    return () => controller.abort();
  }, [activeDomResolvedMarketType, activeDomSymbol, exchange, isViewActive, updateOrderbook]);

  useEffect(() => {
    if (!isViewActive || !activeDomSymbol || !activeDomResolvedMarketType) return;

    subscribe(exchange, activeDomResolvedMarketType, activeDomSymbol, undefined, 'orderbook');
    subscribe(exchange, activeDomResolvedMarketType, activeDomSymbol, undefined, 'trade');

    return () => {
      unsubscribe(exchange, activeDomResolvedMarketType, activeDomSymbol, undefined, 'orderbook');
      unsubscribe(exchange, activeDomResolvedMarketType, activeDomSymbol, undefined, 'trade');
    };
  }, [activeDomResolvedMarketType, activeDomSymbol, exchange, isViewActive, subscribe, unsubscribe]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 lg:flex-row">
      <div className="min-w-0 flex-1">
        <ChartCard
          symbol={symbol}
          exchange={exchange}
          index={index}
          onExpand={onExpand}
          isModal={isModal}
          initialData={initialData}
          initialTimeframe={initialTimeframe}
          initialMarketType={marketType}
          onTimeframeChange={onTimeframeChange}
          onMarketTypeChange={setMarketType}
          onDataLoaded={onDataLoaded}
          showHeaderPrice={showHeaderPrice}
          headerActions={headerActions}
          isViewActive={isViewActive}
          historySessionToken={historySessionToken}
        />
      </div>

      <div className="glass-card min-h-[20rem] w-full shrink-0 overflow-hidden lg:min-h-0 lg:w-[19rem] xl:w-[20.5rem]">
        <DomTapePanel
          marketLabel={activeDomMarket?.marketType ?? marketType}
          orderbook={domOrderbook}
          trades={domTrades}
          isActive={isViewActive}
          settings={domTapeSettings}
          onSettingsChange={patch => setDomTapeSettings(current => ({ ...current, ...patch }))}
          availableMarkets={availableDomMarkets.map(entry => entry.marketType)}
          activeMarket={activeDomMarket?.marketType ?? marketType}
          onActiveMarketChange={setActiveDomMarketType}
        />
      </div>
    </div>
  );
}
