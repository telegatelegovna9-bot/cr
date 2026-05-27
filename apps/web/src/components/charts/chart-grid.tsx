'use client';

import { useUIStore } from '@/stores';
import { ChartCard } from './chart-card';
import { motion } from 'framer-motion';
import {
  LayoutGrid,
  Square,
  Grid2x2,
  Grid3x3,
} from 'lucide-react';

const GRID_OPTIONS = [
  { size: 1 as const, label: '1', icon: Square },
  { size: 4 as const, label: '4', icon: Grid2x2 },
  { size: 6 as const, label: '6', icon: Grid3x3 },
];

export function ChartGrid() {
  const { chartGridSize, setChartGridSize } = useUIStore();

  // Default symbols to show in grid
  const defaultSymbols = [
    'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT',
    'XRP/USDT', 'ADA/USDT', 'DOGE/USDT', 'AVAX/USDT',
    'DOT/USDT',
  ];

  const symbols = defaultSymbols.slice(0, chartGridSize);

  const gridClass = chartGridSize === 1
    ? 'grid-cols-1'
    : chartGridSize === 4
      ? 'grid-cols-1 md:grid-cols-2'
      : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';

  return (
    <div className="h-full flex flex-col p-3 gap-3">
      {/* Grid size selector */}
      <div className="flex items-center gap-2 shrink-0">
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
        <span className="text-xs text-text-muted ml-2">{chartGridSize}-chart layout</span>
      </div>

      {/* Chart grid */}
      <div className={`flex-1 grid ${gridClass} gap-3 min-h-0`}>
        {symbols.map((symbol, index) => (
          <ChartCard key={symbol} symbol={symbol} index={index} />
        ))}
      </div>
    </div>
  );
}
