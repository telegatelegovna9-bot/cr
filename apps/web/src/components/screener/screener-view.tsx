'use client';

import { useState, useMemo, useCallback } from 'react';
import { useMarketStore, useUIStore } from '@/stores';
import type { ExchangeId, Timeframe } from '@crypto-screener/shared';
import { motion } from 'framer-motion';
import {
  Search,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ExternalLink,
  BarChart3,
  Loader2,
} from 'lucide-react';

// ─── Data ────────────────────────────────────────────────────

const SCREENER_SYMBOLS = [
  'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'DOGE/USDT',
  'ADA/USDT', 'AVAX/USDT', 'DOT/USDT', 'LINK/USDT', 'MATIC/USDT', 'UNI/USDT',
  'SHIB/USDT', 'LTC/USDT', 'BCH/USDT', 'ATOM/USDT', 'NEAR/USDT', 'APT/USDT',
  'OP/USDT', 'ARB/USDT', 'FIL/USDT', 'AAVE/USDT', 'MKR/USDT', 'GRT/USDT',
  'INJ/USDT', 'TIA/USDT', 'SUI/USDT', 'SEI/USDT', 'JUP/USDT', 'WIF/USDT',
  'BONK/USDT', 'PEPE/USDT', 'FLOKI/USDT', 'RUNE/USDT', 'FET/USDT', 'RNDR/USDT',
  'STX/USDT', 'IMX/USDT', 'BLUR/USDT', 'PENDLE/USDT',
];

const SCREENER_TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

type SortKey = 'symbol' | 'price' | 'change' | 'volume' | 'trades';

// ─── Helpers ─────────────────────────────────────────────────

function formatPrice(price: number): string {
  if (price >= 10000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 100) return price.toFixed(2);
  if (price >= 1) return price.toFixed(3);
  if (price >= 0.01) return price.toFixed(4);
  return price.toFixed(6);
}

function formatVolume(vol: number): string {
  if (vol >= 1e9) return (vol / 1e9).toFixed(2) + 'B';
  if (vol >= 1e6) return (vol / 1e6).toFixed(2) + 'M';
  if (vol >= 1e3) return (vol / 1e3).toFixed(1) + 'K';
  return vol.toFixed(0);
}

function formatTrades(trades: number): string {
  if (trades >= 1e6) return (trades / 1e6).toFixed(1) + 'M';
  if (trades >= 1e3) return (trades / 1e3).toFixed(1) + 'K';
  return trades.toString();
}

// ─── Screener ────────────────────────────────────────────────

export function ScreenerView() {
  const { selectedExchange, setSelectedSymbol, getTicker } = useMarketStore();
  const { setSelectedCoin } = useUIStore();
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>('1h');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'volume', direction: 'desc' });
  const [loading] = useState(false);

  const handleSort = useCallback((key: SortKey) => {
    setSort((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  }, []);

  const sortedSymbols = useMemo(() => {
    let filtered = SCREENER_SYMBOLS.filter((s) => {
      if (!search) return true;
      return s.toLowerCase().includes(search.toLowerCase());
    });

    filtered.sort((a, b) => {
      const tickerA = getTicker(a, selectedExchange);
      const tickerB = getTicker(b, selectedExchange);
      const getVal = (ticker: any) => {
        switch (sort.key) {
          case 'symbol': return ticker?.symbol || '';
          case 'price': return ticker?.price ?? 0;
          case 'change': return ticker?.priceChangePercent24h ?? 0;
          case 'volume': return ticker?.quoteVolume24h ?? 0;
          case 'trades': return ticker?.trades24h ?? 0;
          default: return 0;
        }
      };
      const valA = getVal(tickerA);
      const valB = getVal(tickerB);

      if (typeof valA === 'string') {
        return sort.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sort.direction === 'asc' ? valA - valB : valB - valA;
    });

    return filtered;
  }, [search, sort, selectedExchange, getTicker]);

  const handleRowClick = (symbol: string) => {
    setSelectedSymbol(symbol);
    setSelectedCoin(symbol);
  };

  return (
    <div className="h-full flex flex-col p-3 gap-3">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-aurora flex items-center justify-center shadow-glow-sm">
            <BarChart3 className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold gradient-text">Screener</h1>
            <p className="text-xs text-text-muted">{selectedExchange.toUpperCase()} · {SCREENER_SYMBOLS.length} pairs</p>
          </div>
        </div>

        <div className="flex-1" />

        {/* Timeframe pills */}
        <div className="flex items-center gap-1 bg-bg-primary/40 rounded-xl p-1 border border-border">
          {SCREENER_TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setSelectedTimeframe(tf)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-all duration-200 cursor-pointer font-medium
                ${selectedTimeframe === tf
                  ? 'bg-accent/15 text-accent-light shadow-glow-sm'
                  : 'text-text-muted hover:text-text-secondary'
                }`}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search pair..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-premium !py-2 !pl-9 !pr-4 !text-xs w-full sm:w-52 !rounded-xl"
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 glass-card overflow-hidden min-h-0">
        {/* Table header */}
        <div className="flex items-center gap-4 px-5 py-3 border-b border-border bg-bg-primary/30 sticky top-0 z-10">
          <div className="w-[140px]">
            <SortButton label="Pair" sortKey="symbol" currentSort={sort} onSort={handleSort} />
          </div>
          <div className="w-[130px] text-right">
            <SortButton label="Price" sortKey="price" currentSort={sort} onSort={handleSort} />
          </div>
          <div className="w-[100px] text-right">
            <SortButton label="24h %" sortKey="change" currentSort={sort} onSort={handleSort} />
          </div>
          <div className="w-[120px] text-right">
            <SortButton label="Volume" sortKey="volume" currentSort={sort} onSort={handleSort} />
          </div>
          <div className="w-[100px] text-right">
            <SortButton label="Trades" sortKey="trades" currentSort={sort} onSort={handleSort} />
          </div>
          <div className="flex-1 text-right">
            <span className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Action</span>
          </div>
        </div>

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg-primary/80 z-20">
            <Loader2 className="w-8 h-8 text-accent animate-spin" />
          </div>
        )}

        {/* Rows */}
        <div className="flex-1 overflow-y-auto">
          {sortedSymbols.map((symbol) => {
            const ticker = getTicker(symbol, selectedExchange);
            const isPositive = ticker ? ticker.priceChangePercent24h >= 0 : true;
            const base = symbol.split('/')[0];

            return (
              <div
                key={symbol}
                onClick={() => handleRowClick(symbol)}
                className="flex items-center gap-4 px-5 py-3 table-row-premium"
              >
                {/* Symbol */}
                <div className="w-[140px] flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold bg-accent/10 text-accent-light">
                    {base.charAt(0)}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-text-primary">{base}</div>
                    <div className="text-[10px] text-text-muted">/USDT</div>
                  </div>
                </div>

                {/* Price */}
                <div className="w-[130px] text-right">
                  <span className="text-xs font-bold font-mono text-text-primary">
                    {ticker ? `$${formatPrice(ticker.price)}` : '—'}
                  </span>
                </div>

                {/* 24h Change */}
                <div className="w-[100px] text-right">
                  {ticker ? (
                    <span className={`inline-flex items-center gap-1 text-xs font-bold font-mono ${isPositive ? 'text-positive' : 'text-negative'}`}>
                      {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {isPositive ? '+' : ''}{ticker.priceChangePercent24h.toFixed(2)}%
                    </span>
                  ) : (
                    <span className="text-xs text-text-muted">—</span>
                  )}
                </div>

                {/* Volume */}
                <div className="w-[120px] text-right">
                  <span className="text-xs font-mono text-text-secondary">
                    {ticker ? `$${formatVolume(ticker.quoteVolume24h)}` : '—'}
                  </span>
                </div>

                {/* Trades */}
                <div className="w-[100px] text-right">
                  <span className="text-xs font-mono text-text-muted">
                    {ticker ? formatTrades(ticker.trades24h) : '—'}
                  </span>
                </div>

                {/* Action */}
                <div className="flex-1 flex justify-end">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRowClick(symbol); }}
                    className="ghost-btn !py-1.5 !px-3 !text-[10px] !rounded-lg flex items-center gap-1"
                  >
                    <ExternalLink className="w-3 h-3" />
                    View
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Sort Button ─────────────────────────────────────────────

function SortButton({ label, sortKey, currentSort, onSort }: {
  label: string; sortKey: SortKey;
  currentSort: { key: SortKey; direction: 'asc' | 'desc' };
  onSort: (key: SortKey) => void;
}) {
  const isActive = currentSort.key === sortKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={`flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold transition-colors cursor-pointer
        ${isActive ? 'text-accent-light' : 'text-text-muted hover:text-text-secondary'}`}
    >
      {label}
      {isActive && (
        <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${currentSort.direction === 'asc' ? 'rotate-180' : ''}`} />
      )}
    </button>
  );
}
