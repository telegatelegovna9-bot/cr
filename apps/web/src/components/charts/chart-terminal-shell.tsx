'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Timeframe } from '@crypto-screener/shared';
import { useMarketStore, useOrderbookStore, useTradeStore } from '@/stores';
import { useWebSocket } from '@/hooks/useWebSocket';
import { findPreferredOrderbook } from '@/lib/orderbook-identity';
import {
  DEFAULT_DOM_TAPE_SETTINGS,
  findPairedMarket,
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
const EMPTY_TRADES: any[] = [];

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
  const tickersList = useMarketStore(state => state.tickersList);
  const orderbookBooks = useOrderbookStore(state => state.books);
  const tradeMap = useTradeStore(state => state.trades);
  const updateOrderbook = useOrderbookStore(state => state.updateOrderbook);
  const { subscribe, unsubscribe } = useWebSocket();

  const [marketType, setMarketType] = useState<'spot' | 'futures'>(
    initialMarketType ?? (symbol.includes(':USDT') ? 'futures' : 'spot'),
  );
  const [activeDomMarketType, setActiveDomMarketType] = useState<'spot' | 'futures'>(marketType);
  const [domTapeSettings, setDomTapeSettings] = useState<DomTapeSettings>(loadDomTapeSettings);

  const effectiveSymbol = useMemo(() => {
    if (marketType === 'futures' && !symbol.includes(':')) return `${symbol}:USDT`;
    if (marketType === 'spot' && symbol.includes(':USDT')) return symbol.replace(':USDT', '');
    return symbol;
  }, [marketType, symbol]);

  const pairedMarket = useMemo(
    () =>
      findPairedMarket({
        symbol: effectiveSymbol,
        marketType,
        hasTicker: (candidate, candidateMarketType) =>
          tickersList.some(
            tickerEntry =>
              tickerEntry.exchange === exchange &&
              tickerEntry.marketType === candidateMarketType &&
              tickerEntry.symbol === candidate,
          ),
      }),
    [effectiveSymbol, exchange, marketType, tickersList],
  );

  const availableDomMarkets = useMemo(() => {
    const primary = { marketType, symbol: effectiveSymbol };
    if (!pairedMarket) return [primary];
    return [primary, pairedMarket];
  }, [effectiveSymbol, marketType, pairedMarket]);

  const activeDomMarket = useMemo(
    () => availableDomMarkets.find(entry => entry.marketType === activeDomMarketType) ?? availableDomMarkets[0],
    [activeDomMarketType, availableDomMarkets],
  );

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

  const domOrderbook = useMemo(() => {
    if (!activeDomMarket) return undefined;
    return findPreferredOrderbook(orderbookBooks, exchange, activeDomMarket.marketType, activeDomSymbolCandidates);
  }, [activeDomMarket, activeDomSymbolCandidates, exchange, orderbookBooks]);

  const domTrades = useMemo(() => {
    if (!activeDomMarket) return EMPTY_TRADES;
    return tradeMap.get(`${exchange}:${activeDomMarket.marketType}:${activeDomMarket.symbol}`) ?? EMPTY_TRADES;
  }, [activeDomMarket, exchange, tradeMap]);

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
    if (!isViewActive || !activeDomMarket) return;

    const controller = new AbortController();
    const searchParams = new URLSearchParams({
      exchange,
      marketType: activeDomMarket.marketType,
    });

    fetch(`${API_BASE}/api/market/orderbook/${encodeURIComponent(activeDomMarket.symbol)}?${searchParams.toString()}`, {
      signal: controller.signal,
    })
      .then(resp => resp.ok ? resp.json() : null)
      .then(payload => {
        if (!payload?.data) return;
        updateOrderbook(payload.data);
      })
      .catch(() => {});

    return () => controller.abort();
  }, [activeDomMarket, exchange, isViewActive, updateOrderbook]);

  useEffect(() => {
    if (!isViewActive || !activeDomMarket) return;

    subscribe(exchange, activeDomMarket.marketType, activeDomMarket.symbol, undefined, 'orderbook');
    subscribe(exchange, activeDomMarket.marketType, activeDomMarket.symbol, undefined, 'trade');

    return () => {
      unsubscribe(exchange, activeDomMarket.marketType, activeDomMarket.symbol, undefined, 'orderbook');
      unsubscribe(exchange, activeDomMarket.marketType, activeDomMarket.symbol, undefined, 'trade');
    };
  }, [activeDomMarket, exchange, isViewActive, subscribe, unsubscribe]);

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
