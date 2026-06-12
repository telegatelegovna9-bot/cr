'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useUIStore, useMarketStore } from '@/stores';
import { ChartCard } from './chart-card';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Square,
  Grid2x2,
  Grid3x3,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Activity,
  Zap,
  BarChart2,
  Layers,
} from 'lucide-react';

const GRID_OPTIONS = [
  { size: 1 as const, label: '1', icon: Square },
  { size: 4 as const, label: '4', icon: Grid2x2 },
  { size: 6 as const, label: '6', icon: Grid3x3 },
];

const ALL_SYMBOLS = [
  'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'DOGE/USDT',
  'ADA/USDT', 'AVAX/USDT', 'DOT/USDT', 'LINK/USDT', 'MATIC/USDT', 'UNI/USDT',
  'SHIB/USDT', 'LTC/USDT', 'BCH/USDT', 'ATOM/USDT', 'NEAR/USDT', 'APT/USDT',
  'OP/USDT', 'ARB/USDT', 'INJ/USDT', 'SUI/USDT', 'TIA/USDT', 'JUP/USDT',
];

type SortMode = 'default' | 'gainers' | 'losers' | 'volume' | 'trades';

const SORT_OPTIONS: { id: SortMode; label: string; icon: typeof TrendingUp }[] = [
  { id: 'default', label: 'Default', icon: Activity },
  { id: 'gainers', label: 'Gainers', icon: TrendingUp },
  { id: 'losers',  label: 'Losers',  icon: TrendingDown },
  { id: 'volume',  label: 'Volume',  icon: BarChart3 },
  { id: 'trades',  label: 'Trades',  icon: Zap },
];

export function ChartGrid({ isViewActive = true }: { isViewActive?: boolean }) {
  const [sortMode, setSortMode] = useState<SortMode>('default');
  const [marketType, setMarketType] = useState<'spot' | 'futures'>('spot');
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);
  const chartGridSize = useUIStore(state => state.chartGridSize);
  const setChartGridSize = useUIStore(state => state.setChartGridSize);
  const selectedExchange = useMarketStore(state => state.selectedExchange);
  const tickers = useMarketStore(state => (sortMode === 'default' ? null : state.tickersList));
  const chartDataCache = useRef<Map<string, { data: any[]; timeframe: string }>>(new Map());

  // Clear cache when exchange or market type changes so modal gets fresh data
  useEffect(() => {
    chartDataCache.current.clear();
  }, [selectedExchange, marketType]);

  const handleDataLoaded = useCallback((symbol: string, data: any[], timeframe: string) => {
    chartDataCache.current.set(symbol, { data, timeframe });
  }, []);

  const sortedSymbols = useMemo(() => {
    if (sortMode === 'default') {
      const base = ALL_SYMBOLS.slice(0, chartGridSize);
      return marketType === 'futures'
        ? base.map(s => `${s}:USDT`)
        : base;
    }

    const filtered = (tickers ?? []).filter(
      t => t.exchange === selectedExchange && t.marketType === marketType
    );

    const source = filtered.length > 0 ? filtered : null;
    if (!source) return ALL_SYMBOLS.slice(0, chartGridSize);

    return source
      .sort((a, b) => {
        switch (sortMode) {
          case 'gainers': return (b.priceChangePercent24h ?? 0) - (a.priceChangePercent24h ?? 0);
          case 'losers':  return (a.priceChangePercent24h ?? 0) - (b.priceChangePercent24h ?? 0);
          case 'volume':  return b.volume24h - a.volume24h;
          case 'trades':  return (b.trades24h ?? 0) - (a.trades24h ?? 0);
          default: return 0;
        }
      })
      .slice(0, chartGridSize)
      .map(t => t.symbol);
  }, [sortMode, chartGridSize, tickers, selectedExchange, marketType]);

  // Stabilise the symbol list — only update keys when the actual set of symbols changes.
  // Without this, every ticker update (100ms) would produce a new sortedSymbols reference,
  // potentially remounting ChartCard components and losing heatmap state.
  const stableSymbolsRef = useRef<string[]>([]);
  const displaySymbols = useMemo(() => {
    const prev = stableSymbolsRef.current;
    const same =
      prev.length === sortedSymbols.length &&
      sortedSymbols.every((s, i) => prev[i] === s);
    if (!same) stableSymbolsRef.current = sortedSymbols;
    return stableSymbolsRef.current;
  }, [sortedSymbols]);

  const gridClass = chartGridSize === 1
    ? 'grid-cols-1 grid-rows-1'
    : chartGridSize === 4
      ? 'grid-cols-2 grid-rows-2'
      : 'grid-cols-2 grid-rows-3 xl:grid-cols-3 xl:grid-rows-2';

  const getSortButtonClass = (id: SortMode) => {
    if (sortMode !== id) return 'text-text-muted hover:text-text-secondary';
    if (id === 'gainers') return 'bg-positive/15 text-positive';
    if (id === 'losers')  return 'bg-negative/15 text-negative';
    return 'bg-accent/15 text-accent-light shadow-glow-sm';
  };

  return (
    <div className="h-full flex flex-col p-3 gap-3">
      {/* Controls bar */}
      <div className="flex items-center gap-2 shrink-0 flex-wrap">
        {/* Grid size */}
        <div className="flex items-center gap-1 bg-bg-primary/40 rounded-xl p-1 border border-border">
          {GRID_OPTIONS.map(({ size, label, icon: Icon }) => (
            <button
              key={size}
              onClick={() => setChartGridSize(size)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-all duration-200 cursor-pointer font-medium
                ${chartGridSize === size
                  ? 'bg-accent/15 text-accent-light shadow-glow-sm'
                  : 'text-text-muted hover:text-text-secondary'
                }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="w-px h-6 bg-border-light shrink-0" />

        {/* Sort options */}
        <div className="flex items-center gap-1 bg-bg-primary/40 rounded-xl p-1 border border-border">
          {SORT_OPTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setSortMode(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-all duration-200 cursor-pointer font-medium ${getSortButtonClass(id)}`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="w-px h-6 bg-border-light shrink-0" />

        {/* Spot / Futures toggle */}
        <div className="flex items-center gap-1 bg-bg-primary/40 rounded-xl p-1 border border-border">
          <button
            onClick={() => setMarketType('spot')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-all duration-200 cursor-pointer font-medium
              ${marketType === 'spot' ? 'bg-accent/15 text-accent-light shadow-glow-sm' : 'text-text-muted hover:text-text-secondary'}`}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            <span>Spot</span>
          </button>
          <button
            onClick={() => setMarketType('futures')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-all duration-200 cursor-pointer font-medium
              ${marketType === 'futures' ? 'bg-accent/15 text-accent-light shadow-glow-sm' : 'text-text-muted hover:text-text-secondary'}`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Futures</span>
          </button>
        </div>
      </div>

      {/* Chart grid */}
      <div className={`flex-1 grid ${gridClass} gap-3 min-h-0`}>
        {displaySymbols.map((symbol, index) => (
          <ChartCard
            key={symbol}
            symbol={symbol}
            index={index}
            onExpand={() => setExpandedSymbol(symbol)}
            paused={expandedSymbol === symbol}
            onDataLoaded={handleDataLoaded}
            initialMarketType={marketType}
            isViewActive={isViewActive}
          />
        ))}
      </div>

      {/* Expanded chart modal */}
      <AnimatePresence>
        {expandedSymbol && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-x-0 top-20 bottom-0 z-[70] bg-black/80 flex items-start justify-center p-4"
            onClick={() => setExpandedSymbol(null)}
          >
            <motion.div
              initial={{ scale: 0.98, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.98, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="w-full max-w-6xl h-[calc(100vh-7.5rem)] min-h-[560px] max-h-[920px]"
              onClick={(e) => e.stopPropagation()}
            >
              <ChartCard
                symbol={expandedSymbol}
                index={0}
                onExpand={() => setExpandedSymbol(null)}
                isModal
                initialData={chartDataCache.current.get(expandedSymbol)?.data}
                initialTimeframe={chartDataCache.current.get(expandedSymbol)?.timeframe}
                initialMarketType={marketType}
                isViewActive={isViewActive}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
