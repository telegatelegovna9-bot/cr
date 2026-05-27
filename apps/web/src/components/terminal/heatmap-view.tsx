'use client';

import { useState, useMemo } from 'react';
import { useMarketStore } from '@/stores';
import type { ExchangeId } from '@crypto-screener/shared';
import { motion } from 'framer-motion';
import { Flame, TrendingUp, TrendingDown, ZoomIn, ZoomOut } from 'lucide-react';

const HEATMAP_SYMBOLS = [
  'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT',
  'DOGE/USDT', 'ADA/USDT', 'AVAX/USDT', 'DOT/USDT', 'LINK/USDT',
  'MATIC/USDT', 'UNI/USDT', 'SHIB/USDT', 'LTC/USDT', 'BCH/USDT',
  'ATOM/USDT', 'NEAR/USDT', 'APT/USDT', 'OP/USDT', 'ARB/USDT',
  'FIL/USDT', 'AAVE/USDT', 'MKR/USDT', 'GRT/USDT', 'INJ/USDT',
  'TIA/USDT', 'SUI/USDT', 'SEI/USDT', 'JUP/USDT', 'WIF/USDT',
];

const MARKET_CAP: Record<string, number> = {
  'BTC/USDT': 1.3e12, 'ETH/USDT': 400e9, 'SOL/USDT': 80e9, 'BNB/USDT': 90e9,
  'XRP/USDT': 60e9, 'DOGE/USDT': 25e9, 'ADA/USDT': 18e9, 'AVAX/USDT': 15e9,
  'DOT/USDT': 12e9, 'LINK/USDT': 11e9, 'MATIC/USDT': 10e9, 'UNI/USDT': 8e9,
  'SHIB/USDT': 8e9, 'LTC/USDT': 7e9, 'BCH/USDT': 6e9, 'ATOM/USDT': 4e9,
  'NEAR/USDT': 5e9, 'APT/USDT': 4e9, 'OP/USDT': 3e9, 'ARB/USDT': 3e9,
  'FIL/USDT': 3e9, 'AAVE/USDT': 2e9, 'MKR/USDT': 2e9, 'GRT/USDT': 2e9,
  'INJ/USDT': 3e9, 'TIA/USDT': 2e9, 'SUI/USDT': 2e9, 'SEI/USDT': 1e9,
  'JUP/USDT': 1e9, 'WIF/USDT': 1e9,
};

const EXCHANGES: ExchangeId[] = ['binance', 'bybit', 'okx', 'bitget', 'bingx', 'mexc'];

type HeatmapMode = 'price' | 'volume' | 'trades';
type ExchangeFilter = ExchangeId | 'all';

function getColor(change: number, maxChange: number): string {
  const intensity = Math.min(Math.abs(change) / Math.max(maxChange, 1), 1);
  if (change > 0) {
    const r = Math.round(20 + (34 - 20) * intensity);
    const g = Math.round(40 + (197 - 40) * intensity);
    const b = Math.round(30 + (94 - 30) * intensity);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    const r = Math.round(40 + (239 - 40) * intensity);
    const g = Math.round(20 + (68 - 20) * intensity);
    const b = Math.round(20 + (68 - 20) * intensity);
    return `rgb(${r}, ${g}, ${b})`;
  }
}

function getTextColor(change: number, maxChange: number): string {
  const intensity = Math.min(Math.abs(change) / Math.max(maxChange, 1), 1);
  return intensity > 0.3 ? '#ffffff' : '#9898B8';
}

export function HeatmapView() {
  const { getTicker } = useMarketStore();
  const [exchange, setExchange] = useState<ExchangeFilter>('all');
  const [mode, setMode] = useState<HeatmapMode>('price');
  const [zoom, setZoom] = useState(1);
  const [hoveredCoin, setHoveredCoin] = useState<string | null>(null);

  const { data, maxAbsChange } = useMemo(() => {
    const exchangesToCheck: ExchangeId[] = exchange === 'all' ? EXCHANGES : [exchange];
    const d = HEATMAP_SYMBOLS.map((symbol) => {
      let bestTicker: any = null;
      let bestExchange: ExchangeId = 'binance';
      for (const ex of exchangesToCheck) {
        const t = getTicker(symbol, ex);
        if (t && (!bestTicker || t.quoteVolume24h > bestTicker.quoteVolume24h)) {
          bestTicker = t;
          bestExchange = ex;
        }
      }
      let change: number;
      let value: number;
      if (mode === 'price') {
        change = bestTicker?.priceChangePercent24h ?? 0;
        value = bestTicker?.price ?? 0;
      } else if (mode === 'volume') {
        change = bestTicker ? (bestTicker.quoteVolume24h / 1e6) : 0;
        value = change;
      } else {
        change = bestTicker?.trades24h ?? 0;
        value = change;
      }
      const base = symbol.split('/')[0];
      return {
        symbol, base, change, value,
        marketCap: MARKET_CAP[symbol] ?? 1e9,
        price: bestTicker?.price ?? 0,
        priceChange: bestTicker?.priceChangePercent24h ?? 0,
        volume: bestTicker?.quoteVolume24h ?? 0,
        trades: bestTicker?.trades24h ?? 0,
        exchange: bestExchange,
        ticker: bestTicker,
      };
    });
    const maxAC = Math.max(...d.map((i) => Math.abs(i.change)), 1);
    return { data: d, maxAbsChange: maxAC };
  }, [exchange, mode, getTicker]);

  const totalMarketCap = data.reduce((s, c) => s + c.marketCap, 0);

  const treemapItems = useMemo(() => {
    const sorted = [...data].sort((a, b) => b.marketCap - a.marketCap);
    return sorted.map((item) => ({
      ...item,
      weight: item.marketCap / totalMarketCap,
    }));
  }, [data, totalMarketCap]);

  return (
    <div className="h-full flex flex-col p-3 gap-3">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-warning/15 flex items-center justify-center">
            <Flame className="w-5 h-5 text-warning" />
          </div>
          <div>
            <h1 className="text-lg font-bold gradient-text">Heatmap</h1>
            <p className="text-xs text-text-muted">{data.length} coins · Market visualization</p>
          </div>
        </div>

        <div className="flex-1" />

        {/* Mode selector */}
        <div className="flex items-center gap-1 bg-bg-primary/40 rounded-xl p-1 border border-border">
          {[
            { id: 'price' as const, label: 'Price %' },
            { id: 'volume' as const, label: 'Volume' },
            { id: 'trades' as const, label: 'Trades' },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-all duration-200 cursor-pointer font-medium
                ${mode === id
                  ? 'bg-accent/15 text-accent-light shadow-glow-sm'
                  : 'text-text-muted hover:text-text-secondary'
                }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Exchange filter */}
        <select
          value={exchange}
          onChange={(e) => setExchange(e.target.value as ExchangeFilter)}
          className="select-premium !py-2 !text-xs !rounded-xl"
        >
          <option value="all" className="bg-bg-secondary">All Exchanges</option>
          {EXCHANGES.map((ex) => (
            <option key={ex} value={ex} className="bg-bg-secondary">{ex.toUpperCase()}</option>
          ))}
        </select>

        {/* Zoom */}
        <div className="flex items-center gap-1 bg-bg-primary/40 rounded-xl p-1 border border-border">
          <button onClick={() => setZoom(Math.max(0.5, zoom - 0.1))} className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors cursor-pointer">
            <ZoomOut className="w-4 h-4 text-text-muted" />
          </button>
          <span className="text-xs text-text-secondary w-12 text-center font-mono">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(Math.min(2, zoom + 0.1))} className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors cursor-pointer">
            <ZoomIn className="w-4 h-4 text-text-muted" />
          </button>
        </div>
      </div>

      {/* Heatmap grid */}
      <div className="flex-1 glass-card overflow-auto p-2 min-h-0">
        <div
          className="grid gap-1 h-full"
          style={{
            gridTemplateColumns: `repeat(auto-fill, minmax(${Math.round(120 * zoom)}px, 1fr))`,
            gridAutoRows: `${Math.round(80 * zoom)}px`,
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
          }}
        >
          {treemapItems.map((item) => {
            const isPositive = item.priceChange >= 0;
            const bgColor = mode === 'price' ? getColor(item.priceChange, maxAbsChange) : getColor(item.change - (maxAbsChange / 2), maxAbsChange / 2);
            const textColor = mode === 'price' ? getTextColor(item.priceChange, maxAbsChange) : '#ffffff';
            const isHovered = hoveredCoin === item.symbol;

            return (
              <motion.div
                key={item.symbol}
                onMouseEnter={() => setHoveredCoin(item.symbol)}
                onMouseLeave={() => setHoveredCoin(null)}
                whileHover={{ scale: 1.02, zIndex: 10 }}
                className="relative rounded-xl cursor-pointer overflow-hidden border border-transparent hover:border-accent/30 transition-all duration-200"
                style={{
                  backgroundColor: bgColor,
                  gridColumn: item.weight > 0.1 ? 'span 2' : 'span 1',
                  gridRow: item.weight > 0.1 ? 'span 2' : 'span 1',
                }}
              >
                <div className="absolute inset-0 flex flex-col justify-between p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-bold" style={{ color: textColor }}>{item.base}</div>
                      <div className="text-[10px] opacity-60" style={{ color: textColor }}>{item.exchange.toUpperCase()}</div>
                    </div>
                    {mode === 'price' && (
                      <div className={`flex items-center gap-0.5 text-xs font-bold ${isPositive ? 'text-green-300' : 'text-red-300'}`}>
                        {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {isPositive ? '+' : ''}{item.priceChange.toFixed(2)}%
                      </div>
                    )}
                  </div>

                  <div className="flex items-end justify-between">
                    <div className="text-xs font-mono font-bold" style={{ color: textColor }}>
                      ${item.price >= 1000 ? item.price.toLocaleString('en-US', { maximumFractionDigits: 0 }) : item.price.toFixed(4)}
                    </div>
                    <div className="text-[10px] opacity-50" style={{ color: textColor }}>
                      Vol ${(item.volume / 1e6).toFixed(0)}M
                    </div>
                  </div>
                </div>

                {/* Hover glow overlay */}
                {isHovered && (
                  <div className="absolute inset-0 bg-white/5 pointer-events-none" />
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {[-5, -3, -1, 0, 1, 3, 5].map((v) => (
              <div
                key={v}
                className="w-6 h-4 rounded-sm"
                style={{ backgroundColor: getColor(v, 5) }}
              />
            ))}
          </div>
          <span className="text-[10px] text-text-muted">-5% → +5%</span>
        </div>
      </div>
    </div>
  );
}
