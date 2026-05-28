'use client';

import { useState, useMemo } from 'react';
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

export function ChartGrid() {
  const { chartGridSize, setChartGridSize } = useUIStore();
  const selectedExchange = useMarketStore(state => state.selectedExchange);
  const getTicker = useMarketStore(state => state.getTicker);
  const [sortMode, setSortMode] = useState<SortMode>('default');
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);

  const sortedSymbols = useMemo(() => {
    if (sortMode === 'default') return ALL_SYMBOLS.slice(0, chartGridSize);

    return [...ALL_SYMBOLS]
      .sort((a, b) => {
        const ta = getTicker(a, selectedExchange);
        const tb = getTicker(b, selectedExchange);
        switch (sortMode) {
          case 'gainers': return (tb?.priceChangePercent24h ?? 0) - (ta?.priceChangePercent24h ?? 0);
          case 'losers':  return (ta?.priceChangePercent24h ?? 0) - (tb?.priceChangePercent24h ?? 0);
          case 'volume':  return (tb?.quoteVolume24h ?? 0) - (ta?.quoteVolume24h ?? 0);
          case 'trades':  return (tb?.trades24h ?? 0) - (ta?.trades24h ?? 0);
          default: return 0;
        }
      })
      .slice(0, chartGridSize);
  }, [sortMode, chartGridSize, getTicker, selectedExchange]);

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
      </div>

      {/* Chart grid */}
      <div className={`flex-1 grid ${gridClass} gap-3 min-h-0`}>
        {sortedSymbols.map((symbol, index) => (
          <ChartCard
            key={symbol}
            symbol={symbol}
            index={index}
            onExpand={() => setExpandedSymbol(symbol)}
            paused={expandedSymbol === symbol}
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
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setExpandedSymbol(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-5xl h-[80vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <ChartCard
                symbol={expandedSymbol}
                index={0}
                onExpand={() => setExpandedSymbol(null)}
                isModal
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
