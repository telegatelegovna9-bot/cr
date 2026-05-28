'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useMarketStore, useUIStore } from '@/stores';
import type { ExchangeId } from '@crypto-screener/shared';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
  ChevronDown,
  X,
  Star,
  ExternalLink,
  BarChart3,
  Activity,
} from 'lucide-react';

// ─── Data & Helpers ───────────────────────────────────────────

interface CoinInfo {
  symbol: string;
  name: string;
  color: string;
  icon: string;
}

const COINS: Record<string, CoinInfo> = {
  'BTC/USDT':  { symbol: 'BTC',  name: 'Bitcoin',       color: '#F7931A', icon: '₿' },
  'ETH/USDT':  { symbol: 'ETH',  name: 'Ethereum',      color: '#627EEA', icon: 'Ξ' },
  'SOL/USDT':  { symbol: 'SOL',  name: 'Solana',        color: '#9945FF', icon: '◎' },
  'BNB/USDT':  { symbol: 'BNB',  name: 'BNB',           color: '#F3BA2F', icon: '◆' },
  'XRP/USDT':  { symbol: 'XRP',  name: 'Ripple',        color: '#23292F', icon: '✕' },
  'DOGE/USDT': { symbol: 'DOGE', name: 'Dogecoin',      color: '#C2A633', icon: 'Ð' },
  'ADA/USDT':  { symbol: 'ADA',  name: 'Cardano',       color: '#0033AD', icon: '₳' },
  'AVAX/USDT': { symbol: 'AVAX', name: 'Avalanche',     color: '#E84142', icon: '▲' },
  'DOT/USDT':  { symbol: 'DOT',  name: 'Polkadot',      color: '#E6007A', icon: '●' },
  'LINK/USDT': { symbol: 'LINK', name: 'Chainlink',     color: '#2A5ADA', icon: '⬡' },
  'MATIC/USDT':{ symbol: 'MATIC',name: 'Polygon',       color: '#8247E5', icon: '◇' },
  'UNI/USDT':  { symbol: 'UNI',  name: 'Uniswap',      color: '#FF007A', icon: '🦄' },
  'SHIB/USDT': { symbol: 'SHIB', name: 'Shiba Inu',     color: '#FFA409', icon: '🐕' },
  'LTC/USDT':  { symbol: 'LTC',  name: 'Litecoin',      color: '#BFBBBB', icon: 'Ł' },
  'BCH/USDT':  { symbol: 'BCH',  name: 'Bitcoin Cash',  color: '#8DC351', icon: 'Ƀ' },
  'ATOM/USDT': { symbol: 'ATOM', name: 'Cosmos',        color: '#2E3148', icon: '⚛' },
  'NEAR/USDT': { symbol: 'NEAR', name: 'NEAR Protocol', color: '#00C08B', icon: 'Ⓝ' },
  'APT/USDT':  { symbol: 'APT',  name: 'Aptos',         color: '#2DD8A3', icon: 'Ⓐ' },
  'OP/USDT':   { symbol: 'OP',   name: 'Optimism',      color: '#FF0420', icon: 'Ⓞ' },
  'ARB/USDT':  { symbol: 'ARB',  name: 'Arbitrum',      color: '#28A0F0', icon: '◈' },
};

const SYMBOLS = Object.keys(COINS);

type SortKey = 'symbol' | 'price' | 'change' | 'volume' | 'trades';

// ─── Utility functions ──────────────────────────────────────

function formatPrice(price: number): string {
  if (price >= 10000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 100)   return price.toFixed(2);
  if (price >= 1)     return price.toFixed(3);
  if (price >= 0.01)  return price.toFixed(4);
  return price.toFixed(6);
}

function formatVolume(vol: number): string {
  if (vol >= 1e9)  return (vol / 1e9).toFixed(2) + 'B';
  if (vol >= 1e6)  return (vol / 1e6).toFixed(2) + 'M';
  if (vol >= 1e3)  return (vol / 1e3).toFixed(1) + 'K';
  return vol.toFixed(0);
}

// ─── Sub-components ─────────────────────────────────────────

function CoinAvatar({ coin, size = 36 }: { coin: CoinInfo; size?: number }) {
  return (
    <div
      className="rounded-xl flex items-center justify-center shrink-0 font-bold text-white shadow-glow-sm"
      style={{
        width: size, height: size,
        background: `linear-gradient(135deg, ${coin.color}33, ${coin.color}11)`,
        border: `1px solid ${coin.color}22`,
        fontSize: size * 0.4,
        color: coin.color,
      }}
    >
      {coin.icon}
    </div>
  );
}

function SortButton({ label, sortKey, currentSort, onSort }: {
  label: string;
  sortKey: SortKey;
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
        <ChevronDown
          className={`w-3 h-3 transition-transform duration-200 ${currentSort.direction === 'asc' ? 'rotate-180' : ''}`}
        />
      )}
    </button>
  );
}

// ─── Detail Modal ───────────────────────────────────────────

function CoinDetailModal({
  symbol, exchange, ticker, coin, onClose,
}: {
  symbol: string; exchange: ExchangeId; ticker: any; coin: CoinInfo; onClose: () => void;
}) {
  const isPositive = (ticker?.priceChangePercent24h ?? 0) >= 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="glass-card relative z-10 w-full max-w-md p-6 shadow-glass-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <CoinAvatar coin={coin} size={44} />
            <div>
              <h2 className="text-lg font-bold text-text-primary">{coin.name}</h2>
              <span className="text-xs text-text-muted font-medium">{symbol} · {exchange.toUpperCase()}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-surface-hover transition-colors cursor-pointer">
            <X className="w-5 h-5 text-text-muted" />
          </button>
        </div>

        {/* Price */}
        <div className="mb-6">
          <div className="text-3xl font-bold text-text-primary font-mono tracking-tight">
            ${ticker ? formatPrice(ticker.price) : '—'}
          </div>
          {ticker && (
            <div className={`flex items-center gap-1.5 mt-1 ${isPositive ? 'text-positive' : 'text-negative'}`}>
              {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span className="text-sm font-semibold">{isPositive ? '+' : ''}{ticker.priceChangePercent24h?.toFixed(2)}%</span>
              <span className="text-xs text-text-muted ml-1">24h</span>
            </div>
          )}
        </div>

        {/* Stats grid */}
        {ticker && (
          <div className="grid grid-cols-2 gap-3 mb-6">
            {[
              { label: '24h High', value: `$${formatPrice(ticker.high24h)}`, color: 'text-positive' },
              { label: '24h Low', value: `$${formatPrice(ticker.low24h)}`, color: 'text-negative' },
              { label: '24h Volume', value: `$${formatVolume(ticker.quoteVolume24h)}`, color: 'text-text-primary' },
              { label: 'Trades', value: ticker.trades24h?.toLocaleString(), color: 'text-text-primary' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-bg-primary/40 rounded-xl p-3 border border-border">
                <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1">{label}</div>
                <div className={`text-sm font-bold font-mono ${color}`}>{value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <a
            href={`https://www.tradingview.com/chart/?symbol=${exchange.toUpperCase()}:${symbol.replace('/', '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 glow-btn flex items-center justify-center gap-2 !text-xs"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            TradingView
          </a>
          <button
            onClick={onClose}
            className="flex-1 ghost-btn text-text-secondary !text-xs"
          >
            Close
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Main Coin List ─────────────────────────────────────────

export function CoinList() {
  const { selectedExchange, getTicker, setSelectedSymbol } = useMarketStore();
  const { coinListOpen, toggleCoinList, selectedCoin, setSelectedCoin } = useUIStore();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'volume', direction: 'desc' });
  const [prevPrices, setPrevPrices] = useState<Map<string, number>>(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleSort = useCallback((key: SortKey) => {
    setSort((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  }, []);

  // Track price changes for flash animation
  useEffect(() => {
    const interval = setInterval(() => {
      const newPrev = new Map<string, number>();
      SYMBOLS.forEach((symbol) => {
        const ticker = getTicker(symbol, selectedExchange);
        if (ticker) newPrev.set(symbol, ticker.price);
      });
      setPrevPrices(newPrev);
    }, 1000);
    return () => clearInterval(interval);
  }, [selectedExchange, getTicker]);

  // Sorted & filtered list
  const sortedSymbols = useMemo(() => {
    let filtered = SYMBOLS.filter((s) => {
      if (!search) return true;
      const q = search.toLowerCase();
      const coin = COINS[s];
      return s.toLowerCase().includes(q) || coin?.name.toLowerCase().includes(q) || coin?.symbol.toLowerCase().includes(q);
    });

    filtered.sort((a, b) => {
      const tickerA = getTicker(a, selectedExchange);
      const tickerB = getTicker(b, selectedExchange);
      const getVal = (sym: string, ticker: any) => {
        switch (sort.key) {
          case 'symbol':  return COINS[sym]?.symbol || sym;
          case 'price':   return ticker?.price ?? 0;
          case 'change':  return ticker?.priceChangePercent24h ?? 0;
          case 'volume':  return ticker?.quoteVolume24h ?? 0;
          case 'trades':  return ticker?.trades24h ?? 0;
          default:        return 0;
        }
      };
      const valA = getVal(a, tickerA);
      const valB = getVal(b, tickerB);

      if (typeof valA === 'string') {
        return sort.direction === 'asc' ? valA.localeCompare(valB as string) : (valB as string).localeCompare(valA);
      }
      return sort.direction === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    });

    return filtered;
  }, [search, sort, selectedExchange, getTicker]);

  const handleCoinClick = useCallback((symbol: string) => {
    setSelectedSymbol(symbol);
    setSelectedCoin(symbol);
  }, [setSelectedSymbol, setSelectedCoin]);

  const selectedTicker = selectedCoin ? getTicker(selectedCoin, selectedExchange) : undefined;
  const selectedCoinInfo = selectedCoin ? COINS[selectedCoin] : undefined;

  if (!coinListOpen) return null;

  return (
    <>
      <motion.aside
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        className="w-80 h-full flex flex-col glass-card border-r border-border overflow-hidden shrink-0"
      >
        {/* Header */}
        <div className="p-4 pb-3 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-aurora flex items-center justify-center">
                <Activity className="w-3.5 h-3.5 text-white" />
              </div>
              <h2 className="text-sm font-bold text-text-primary">Markets</h2>
              <span className="text-[10px] text-text-muted bg-bg-primary/50 px-2 py-0.5 rounded-full font-medium">
                {SYMBOLS.length}
              </span>
            </div>
            <button
              onClick={toggleCoinList}
              className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors cursor-pointer"
            >
              <X className="w-4 h-4 text-text-muted" />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              placeholder="Search markets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-premium !py-2 !pl-9 !text-xs !rounded-xl"
            />
          </div>
        </div>

        {/* Sort bar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-bg-primary/20">
          <div className="w-[120px]">
            <SortButton label="Pair" sortKey="symbol" currentSort={sort} onSort={handleSort} />
          </div>
          <div className="flex-1 text-right">
            <SortButton label="Price" sortKey="price" currentSort={sort} onSort={handleSort} />
          </div>
          <div className="w-[70px] text-right">
            <SortButton label="24h" sortKey="change" currentSort={sort} onSort={handleSort} />
          </div>
          <div className="w-[70px] text-right">
            <SortButton label="Vol" sortKey="volume" currentSort={sort} onSort={handleSort} />
          </div>
        </div>

        {/* Coin list */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {sortedSymbols.map((symbol) => {
            const ticker = getTicker(symbol, selectedExchange);
            const coin = COINS[symbol];
            if (!coin) return null;
            const isPositive = ticker ? (ticker.priceChangePercent24h ?? 0) >= 0 : true;
            const prevPrice = prevPrices.get(symbol);
            const priceChanged = ticker && prevPrice && ticker.price !== prevPrice;
            const priceDir = ticker && prevPrice ? (ticker.price > prevPrice ? 'up' : 'down') : null;

            return (
              <div
                key={symbol}
                onClick={() => handleCoinClick(symbol)}
                className={`flex items-center gap-3 px-4 py-3 table-row-premium
                  ${selectedCoin === symbol ? 'bg-accent/8 border-l-2 border-l-accent' : 'border-l-2 border-l-transparent'}`}
              >
                {/* Coin icon */}
                <CoinAvatar coin={coin} size={34} />

                {/* Symbol & name */}
                <div className="w-[80px] min-w-0">
                  <div className="text-xs font-bold text-text-primary truncate">{coin.symbol}</div>
                  <div className="text-[10px] text-text-muted truncate">{coin.name}</div>
                </div>

                {/* Price */}
                <div className="flex-1 text-right">
                  <div
                    className={`text-xs font-bold font-mono text-text-primary transition-colors duration-300
                      ${priceChanged ? (priceDir === 'up' ? 'price-flash-up' : 'price-flash-down') : ''}`}
                  >
                    {ticker ? `$${formatPrice(ticker.price)}` : '—'}
                  </div>
                </div>

                {/* 24h change */}
                <div className="w-[65px] text-right">
                  {ticker ? (
                    <span className={`text-xs font-bold font-mono ${isPositive ? 'text-positive' : 'text-negative'}`}>
                      {isPositive ? '+' : ''}{(ticker.priceChangePercent24h ?? 0).toFixed(2)}%
                    </span>
                  ) : (
                    <span className="text-xs text-text-muted">—</span>
                  )}
                </div>

                {/* Volume */}
                <div className="w-[60px] text-right">
                  <span className="text-[10px] text-text-muted font-mono">
                    {ticker ? `$${formatVolume(ticker.quoteVolume24h)}` : '—'}
                  </span>
                </div>
              </div>
            );
          })}

          {sortedSymbols.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 text-text-muted">
              <Search className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-xs">No results found</p>
            </div>
          )}
        </div>

        {/* Footer stats */}
        <div className="px-4 py-3 border-t border-border bg-bg-primary/30">
          <div className="flex items-center justify-between text-[10px] text-text-muted">
            <span>{sortedSymbols.length} pairs</span>
            <span className="uppercase tracking-wider font-medium">{selectedExchange}</span>
          </div>
        </div>
      </motion.aside>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedCoin && selectedCoinInfo && (
          <CoinDetailModal
            symbol={selectedCoin}
            exchange={selectedExchange}
            ticker={selectedTicker}
            coin={selectedCoinInfo}
            onClose={() => setSelectedCoin(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
