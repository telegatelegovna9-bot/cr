'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useMarketStore, useUIStore } from '@/stores';
import { ChartCard } from '@/components/charts/chart-card';
import type { ExchangeId } from '@crypto-screener/shared';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronRight,
  X,
  Activity,
  BarChart3,
  Zap,
} from 'lucide-react';

// ─── Coin metadata lookup ─────────────────────────────────────

interface CoinInfo { symbol: string; name: string; color: string; icon: string }

const COIN_META: Record<string, CoinInfo> = {
  BTC:   { symbol: 'BTC',   name: 'Bitcoin',        color: '#F7931A', icon: '₿'  },
  ETH:   { symbol: 'ETH',   name: 'Ethereum',       color: '#627EEA', icon: 'Ξ'  },
  SOL:   { symbol: 'SOL',   name: 'Solana',         color: '#9945FF', icon: '◎'  },
  BNB:   { symbol: 'BNB',   name: 'BNB',            color: '#F3BA2F', icon: '◆'  },
  XRP:   { symbol: 'XRP',   name: 'Ripple',         color: '#346AA9', icon: '✕'  },
  DOGE:  { symbol: 'DOGE',  name: 'Dogecoin',       color: '#C2A633', icon: 'Ð'  },
  ADA:   { symbol: 'ADA',   name: 'Cardano',        color: '#0033AD', icon: '₳'  },
  AVAX:  { symbol: 'AVAX',  name: 'Avalanche',      color: '#E84142', icon: '▲'  },
  DOT:   { symbol: 'DOT',   name: 'Polkadot',       color: '#E6007A', icon: '●'  },
  LINK:  { symbol: 'LINK',  name: 'Chainlink',      color: '#2A5ADA', icon: '⬡'  },
  MATIC: { symbol: 'MATIC', name: 'Polygon',        color: '#8247E5', icon: '◇'  },
  UNI:   { symbol: 'UNI',   name: 'Uniswap',        color: '#FF007A', icon: 'U'  },
  SHIB:  { symbol: 'SHIB',  name: 'Shiba Inu',      color: '#FFA409', icon: 'S'  },
  LTC:   { symbol: 'LTC',   name: 'Litecoin',       color: '#BFBBBB', icon: 'Ł'  },
  BCH:   { symbol: 'BCH',   name: 'Bitcoin Cash',   color: '#8DC351', icon: 'Ƀ'  },
  ATOM:  { symbol: 'ATOM',  name: 'Cosmos',         color: '#6F7390', icon: '⚛'  },
  NEAR:  { symbol: 'NEAR',  name: 'NEAR Protocol',  color: '#00C08B', icon: 'N'  },
  APT:   { symbol: 'APT',   name: 'Aptos',          color: '#2DD8A3', icon: 'A'  },
  OP:    { symbol: 'OP',    name: 'Optimism',       color: '#FF0420', icon: 'O'  },
  ARB:   { symbol: 'ARB',   name: 'Arbitrum',       color: '#28A0F0', icon: '◈'  },
  INJ:   { symbol: 'INJ',   name: 'Injective',      color: '#00A3FF', icon: 'I'  },
  SUI:   { symbol: 'SUI',   name: 'Sui',            color: '#6FBCF0', icon: 'S'  },
  TIA:   { symbol: 'TIA',   name: 'Celestia',       color: '#7B2FBE', icon: 'T'  },
  JUP:   { symbol: 'JUP',   name: 'Jupiter',        color: '#C7A44B', icon: 'J'  },
  WIF:   { symbol: 'WIF',   name: 'dogwifhat',      color: '#9B59B6', icon: 'W'  },
  PEPE:  { symbol: 'PEPE',  name: 'Pepe',           color: '#4CAF50', icon: 'P'  },
  BONK:  { symbol: 'BONK',  name: 'Bonk',           color: '#FF6B35', icon: 'B'  },
  FET:   { symbol: 'FET',   name: 'Fetch.ai',       color: '#1A88C9', icon: 'F'  },
  RNDR:  { symbol: 'RNDR',  name: 'Render',         color: '#E8412A', icon: 'R'  },
  STX:   { symbol: 'STX',   name: 'Stacks',         color: '#5546FF', icon: 'S'  },
};

function getCoinMeta(base: string): CoinInfo {
  return COIN_META[base] ?? { symbol: base, name: base, color: '#6366f1', icon: base.charAt(0) };
}

// ─── Helpers ──────────────────────────────────────────────────

type SortKey = 'symbol' | 'price' | 'change' | 'volume' | 'trades';
type MarketType = 'spot' | 'futures';

function formatPrice(price: number): string {
  if (price >= 10000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 100)   return price.toFixed(2);
  if (price >= 1)     return price.toFixed(3);
  if (price >= 0.01)  return price.toFixed(4);
  return price.toFixed(6);
}

function formatVolume(vol: number): string {
  if (vol >= 1e9) return (vol / 1e9).toFixed(1) + 'B';
  if (vol >= 1e6) return (vol / 1e6).toFixed(1) + 'M';
  if (vol >= 1e3) return (vol / 1e3).toFixed(0) + 'K';
  return vol.toFixed(0);
}

// ─── Sub-components ───────────────────────────────────────────

function CoinAvatar({ base, color, icon, size = 34 }: { base: string; color: string; icon: string; size?: number }) {
  return (
    <div
      className="rounded-xl flex items-center justify-center shrink-0 font-bold"
      style={{
        width: size, height: size,
        background: `linear-gradient(135deg, ${color}33, ${color}11)`,
        border: `1px solid ${color}22`,
        fontSize: size * 0.38,
        color,
      }}
    >
      {icon}
    </div>
  );
}

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

// ─── Chart Modal ──────────────────────────────────────────────

function CoinChartModal({ symbol, onClose }: { symbol: string; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="w-full max-w-5xl h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <ChartCard symbol={symbol} index={0} onExpand={onClose} isModal />
      </motion.div>
    </motion.div>
  );
}

// ─── Toggle button (shown when sidebar is closed) ─────────────

export function CoinListToggle() {
  const { coinListOpen, toggleCoinList } = useUIStore();
  if (coinListOpen) return null;
  return (
    <button
      onClick={toggleCoinList}
      className="shrink-0 w-7 h-full flex items-center justify-center bg-bg-secondary/60 hover:bg-surface-hover border-r border-border transition-colors cursor-pointer group"
      title="Open Markets"
    >
      <ChevronRight className="w-3.5 h-3.5 text-text-muted group-hover:text-text-secondary transition-colors" />
    </button>
  );
}

// ─── Main Coin List ───────────────────────────────────────────

export function CoinList() {
  const { selectedExchange, getTicker, getTickersArray, setSelectedSymbol } = useMarketStore();
  const { coinListOpen, toggleCoinList, setSelectedCoin } = useUIStore();
  const [search, setSearch] = useState('');
  const [marketType, setMarketType] = useState<MarketType>('spot');
  const [sort, setSort] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'volume', direction: 'desc' });
  const [prevPrices, setPrevPrices] = useState<Map<string, number>>(new Map());
  const [chartSymbol, setChartSymbol] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleSort = useCallback((key: SortKey) => {
    setSort((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  }, []);

  // Price flash tracking
  useEffect(() => {
    const interval = setInterval(() => {
      const allTickers = getTickersArray();
      const newPrev = new Map<string, number>();
      allTickers.forEach((t) => {
        if (t.exchange === selectedExchange) newPrev.set(t.symbol, t.price);
      });
      setPrevPrices(newPrev);
    }, 1000);
    return () => clearInterval(interval);
  }, [selectedExchange, getTickersArray]);

  // Build symbol list from live tickers
  const symbols = useMemo(() => {
    const allTickers = getTickersArray();
    const exchangeTickers = allTickers.filter((t) => t.exchange === selectedExchange);

    let filtered: string[];
    if (marketType === 'spot') {
      // Spot: symbol ends with /USDT and no colon (no perpetuals)
      filtered = exchangeTickers
        .filter((t) => t.symbol.endsWith('/USDT') && !t.symbol.includes(':'))
        .map((t) => t.symbol);
    } else {
      // Futures/Perp: symbol contains :USDT
      filtered = exchangeTickers
        .filter((t) => t.symbol.includes(':USDT'))
        .map((t) => t.symbol);
    }

    // Fallback to known symbols if store is empty
    if (filtered.length === 0) {
      filtered = Object.keys(COIN_META).map((base) =>
        marketType === 'futures' ? `${base}/USDT:USDT` : `${base}/USDT`
      );
    }

    return [...new Set(filtered)];
  }, [getTickersArray, selectedExchange, marketType]);

  // Filter + sort
  const sortedSymbols = useMemo(() => {
    const q = search.toLowerCase();
    let filtered = symbols.filter((s) => {
      if (!q) return true;
      const base = s.split('/')[0];
      const meta = getCoinMeta(base);
      return s.toLowerCase().includes(q) || meta.name.toLowerCase().includes(q);
    });

    filtered.sort((a, b) => {
      const ta = getTicker(a, selectedExchange);
      const tb = getTicker(b, selectedExchange);
      const getVal = (sym: string, t: any) => {
        switch (sort.key) {
          case 'symbol':  return sym;
          case 'price':   return t?.price ?? 0;
          case 'change':  return t?.priceChangePercent24h ?? 0;
          case 'volume':  return t?.quoteVolume24h ?? 0;
          case 'trades':  return t?.trades24h ?? 0;
          default:        return 0;
        }
      };
      const va = getVal(a, ta);
      const vb = getVal(b, tb);
      if (typeof va === 'string') {
        return sort.direction === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
      }
      return sort.direction === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });

    return filtered;
  }, [symbols, search, sort, selectedExchange, getTicker]);

  const handleCoinClick = useCallback((symbol: string) => {
    setSelectedSymbol(symbol);
    setSelectedCoin(symbol);
    setChartSymbol(symbol);
  }, [setSelectedSymbol, setSelectedCoin]);

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
        <div className="p-3 pb-2 border-b border-border shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-aurora flex items-center justify-center">
                <Activity className="w-3 h-3 text-white" />
              </div>
              <h2 className="text-xs font-bold text-text-primary">Markets</h2>
              <span className="text-[10px] text-text-muted bg-bg-primary/50 px-1.5 py-0.5 rounded-full font-medium">
                {sortedSymbols.length}
              </span>
            </div>
            <button
              onClick={toggleCoinList}
              className="p-1 rounded-lg hover:bg-surface-hover transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5 text-text-muted" />
            </button>
          </div>

          {/* Spot / Futures tabs */}
          <div className="flex items-center gap-1 bg-bg-primary/40 rounded-lg p-0.5 border border-border mb-2">
            {(['spot', 'futures'] as MarketType[]).map((type) => (
              <button
                key={type}
                onClick={() => setMarketType(type)}
                className={`flex-1 flex items-center justify-center gap-1 py-1 text-[10px] rounded-md transition-all duration-200 cursor-pointer font-semibold uppercase tracking-wider
                  ${marketType === type
                    ? 'bg-accent/15 text-accent-light'
                    : 'text-text-muted hover:text-text-secondary'
                  }`}
              >
                {type === 'spot' ? <BarChart3 className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
                {type}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-premium !py-1.5 !pl-8 !text-xs !rounded-lg w-full"
            />
          </div>
        </div>

        {/* Sort bar */}
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border bg-bg-primary/20 shrink-0">
          <div className="flex-1">
            <SortButton label="Pair" sortKey="symbol" currentSort={sort} onSort={handleSort} />
          </div>
          <div className="w-[72px] text-right">
            <SortButton label="Price" sortKey="price" currentSort={sort} onSort={handleSort} />
          </div>
          <div className="w-[56px] text-right">
            <SortButton label="24h" sortKey="change" currentSort={sort} onSort={handleSort} />
          </div>
          <div className="w-[48px] text-right">
            <SortButton label="Vol" sortKey="volume" currentSort={sort} onSort={handleSort} />
          </div>
        </div>

        {/* Coin list */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {sortedSymbols.map((symbol) => {
            const base = symbol.split('/')[0];
            const meta = getCoinMeta(base);
            const ticker = getTicker(symbol, selectedExchange);
            const isPositive = (ticker?.priceChangePercent24h ?? 0) >= 0;
            const prevPrice = prevPrices.get(symbol);
            const priceChanged = ticker && prevPrice && ticker.price !== prevPrice;
            const priceDir = ticker && prevPrice ? (ticker.price > prevPrice ? 'up' : 'down') : null;
            const isSelected = chartSymbol === symbol;

            return (
              <div
                key={symbol}
                onClick={() => handleCoinClick(symbol)}
                className={`flex items-center gap-2 px-3 py-2 table-row-premium cursor-pointer
                  ${isSelected ? 'bg-accent/8 border-l-2 border-l-accent' : 'border-l-2 border-l-transparent'}`}
              >
                <CoinAvatar base={base} color={meta.color} icon={meta.icon} size={30} />

                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-text-primary truncate">{base}</div>
                  <div className="text-[10px] text-text-muted truncate leading-tight">{meta.name}</div>
                </div>

                <div className="w-[68px] text-right">
                  <div className={`text-xs font-bold font-mono text-text-primary transition-colors duration-300
                    ${priceChanged ? (priceDir === 'up' ? 'price-flash-up' : 'price-flash-down') : ''}`}>
                    {ticker ? `$${formatPrice(ticker.price)}` : '—'}
                  </div>
                </div>

                <div className="w-[52px] text-right">
                  {ticker ? (
                    <span className={`text-[10px] font-bold font-mono ${isPositive ? 'text-positive' : 'text-negative'}`}>
                      {isPositive ? '+' : ''}{(ticker.priceChangePercent24h ?? 0).toFixed(2)}%
                    </span>
                  ) : (
                    <span className="text-[10px] text-text-muted">—</span>
                  )}
                </div>

                <div className="w-[44px] text-right">
                  <span className="text-[10px] text-text-muted font-mono">
                    {ticker ? formatVolume(ticker.quoteVolume24h) : '—'}
                  </span>
                </div>
              </div>
            );
          })}

          {sortedSymbols.length === 0 && (
            <div className="flex flex-col items-center justify-center h-32 text-text-muted">
              <Search className="w-6 h-6 mb-2 opacity-30" />
              <p className="text-xs">No results</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-2 border-t border-border bg-bg-primary/30 shrink-0">
          <div className="flex items-center justify-between text-[10px] text-text-muted">
            <span>{sortedSymbols.length} pairs · {marketType}</span>
            <span className="uppercase tracking-wider font-medium">{selectedExchange}</span>
          </div>
        </div>
      </motion.aside>

      {/* Chart modal on coin click */}
      <AnimatePresence>
        {chartSymbol && (
          <CoinChartModal symbol={chartSymbol} onClose={() => setChartSymbol(null)} />
        )}
      </AnimatePresence>
    </>
  );
}
