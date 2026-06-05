'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BarChart2, Layers, Search, X } from 'lucide-react';
import { useMarketStore } from '@/stores';

const PICKER_EXCHANGES = ['binance', 'bybit', 'okx', 'kucoin', 'bitget', 'gate', 'mexc', 'hyperliquid', 'coinbase'] as const;

interface ChartPickerModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (selection: {
    symbol: string;
    exchange: string;
    marketType: 'spot' | 'futures';
  }) => void;
  initialSelection?: {
    symbol: string | null;
    exchange: string | null;
    marketType: 'spot' | 'futures' | null;
  };
}

export function ChartPickerModal({
  open,
  onClose,
  onConfirm,
  initialSelection,
}: ChartPickerModalProps) {
  const tickers = useMarketStore(state => state.getTickersArray());
  const selectedExchange = useMarketStore(state => state.selectedExchange);
  const [query, setQuery] = useState('');
  const [exchange, setExchange] = useState(initialSelection?.exchange ?? selectedExchange);
  const [marketType, setMarketType] = useState<'spot' | 'futures'>(initialSelection?.marketType ?? 'spot');
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(initialSelection?.symbol ?? null);

  useEffect(() => {
    if (!open) return;
    setExchange(initialSelection?.exchange ?? selectedExchange);
    setMarketType(initialSelection?.marketType ?? 'spot');
    setSelectedSymbol(initialSelection?.symbol ?? null);
    setQuery('');
  }, [open, initialSelection, selectedExchange]);

  const symbols = useMemo(() => {
    const items = tickers
      .filter(ticker => ticker.exchange === exchange && ticker.marketType === marketType)
      .map(ticker => ticker.symbol);

    return Array.from(new Set(items))
      .filter(symbol => symbol.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 40);
  }, [tickers, exchange, marketType, query]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 8 }}
            transition={{ duration: 0.18 }}
            className="w-full max-w-xl glass-card border border-border overflow-hidden"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div>
                <div className="text-sm font-semibold text-text-primary">Add Chart</div>
                <div className="text-xs text-text-muted">Choose a symbol, exchange, and market type.</div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-surface-hover transition-colors cursor-pointer"
              >
                <X className="w-4 h-4 text-text-muted" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2 bg-bg-primary/40 rounded-xl border border-border px-3 py-2">
                <Search className="w-4 h-4 text-text-muted" />
                <input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="Search symbol"
                  className="bg-transparent outline-none w-full text-sm text-text-primary placeholder:text-text-muted"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={exchange}
                  onChange={event => setExchange(event.target.value)}
                  className="bg-bg-primary/40 border border-border rounded-xl px-3 py-2 text-sm text-text-primary"
                >
                  {PICKER_EXCHANGES.map(id => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-1 bg-bg-primary/40 rounded-xl p-1 border border-border">
                  <button
                    onClick={() => setMarketType('spot')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-all ${
                      marketType === 'spot'
                        ? 'bg-accent/15 text-accent-light'
                        : 'text-text-muted hover:text-text-secondary'
                    }`}
                  >
                    <BarChart2 className="w-3.5 h-3.5" />
                    <span>Spot</span>
                  </button>
                  <button
                    onClick={() => setMarketType('futures')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-all ${
                      marketType === 'futures'
                        ? 'bg-accent/15 text-accent-light'
                        : 'text-text-muted hover:text-text-secondary'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Futures</span>
                  </button>
                </div>
              </div>

              <div className="max-h-80 overflow-auto space-y-2 pr-1">
                {symbols.length > 0 ? (
                  symbols.map(symbol => (
                    <button
                      key={symbol}
                      onClick={() => setSelectedSymbol(symbol)}
                      className={`w-full text-left px-3 py-2 rounded-xl border transition-all ${
                        selectedSymbol === symbol
                          ? 'border-accent/40 bg-accent/10 text-text-primary'
                          : 'border-border bg-bg-primary/30 text-text-secondary hover:bg-surface-hover'
                      }`}
                    >
                      <div className="text-sm font-medium">{symbol}</div>
                      <div className="text-[11px] text-text-muted uppercase tracking-wide">
                        {exchange} · {marketType}
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="rounded-xl border border-border bg-bg-primary/20 px-3 py-6 text-center text-sm text-text-muted">
                    No symbols found for this exchange and market type.
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
              <button
                onClick={onClose}
                className="px-3 py-2 text-sm rounded-xl text-text-muted hover:text-text-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => selectedSymbol && onConfirm({ symbol: selectedSymbol, exchange, marketType })}
                disabled={!selectedSymbol}
                className="px-4 py-2 text-sm rounded-xl bg-accent/15 text-accent-light disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save Chart
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
