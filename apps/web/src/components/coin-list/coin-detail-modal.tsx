// Coin Detail Modal component

'use client';

import { useState, useEffect } from 'react';
import { useMarketStore, useUIStore } from '@/stores';
import { useCandles, useOrderBook } from '@/hooks/useData';
import { Chart } from '@/components/charts/chart';
import { cn } from '@/lib/utils';
import { formatPrice, formatPercent, formatVolume } from '@/lib/format';

export function CoinDetailModal() {
  const { selectedCoin, setSelectedCoin } = useUIStore();
  const { selectedSymbol, selectedExchange, getTicker } = useMarketStore();
  const symbol = selectedCoin || selectedSymbol;
  const ticker = getTicker(symbol, selectedExchange);
  
  const { data: candles } = useCandles(symbol, '1h', selectedExchange);
  const { data: orderBook } = useOrderBook(symbol, selectedExchange);
  const [activeTab, setActiveTab] = useState<'chart' | 'orderbook' | 'info'>('chart');

  if (!selectedCoin) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="terminal-card w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-terminal-border">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold font-mono">{symbol}</h2>
            <span className="text-terminal-muted">{selectedExchange}</span>
            {ticker && (
              <span className={cn(
                'px-2 py-0.5 rounded text-sm font-mono',
                (ticker.priceChangePercent24h ?? 0) >= 0 ? 'bg-price-up/20 price-up' : 'bg-price-down/20 price-down'
              )}>
                {formatPercent(ticker.priceChangePercent24h)}
              </span>
            )}
          </div>
          <button
            onClick={() => setSelectedCoin(null)}
            className="p-2 hover:bg-terminal-hover rounded transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Price info */}
        {ticker && (
          <div className="grid grid-cols-4 gap-4 p-4 border-b border-terminal-border">
            <div>
              <div className="text-xs text-terminal-muted">Price</div>
              <div className="text-xl font-mono font-medium">{formatPrice(ticker.lastPrice)}</div>
            </div>
            <div>
              <div className="text-xs text-terminal-muted">24h High</div>
              <div className="font-mono price-up">{formatPrice(ticker.high24h)}</div>
            </div>
            <div>
              <div className="text-xs text-terminal-muted">24h Low</div>
              <div className="font-mono price-down">{formatPrice(ticker.low24h)}</div>
            </div>
            <div>
              <div className="text-xs text-terminal-muted">24h Volume</div>
              <div className="font-mono">{formatVolume(ticker.volume24h)}</div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-terminal-border">
          {(['chart', 'orderbook', 'info'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-4 py-2 text-sm transition-colors',
                activeTab === tab
                  ? 'text-terminal-accent border-b-2 border-terminal-accent'
                  : 'text-terminal-muted hover:text-terminal-text'
              )}
            >
              {tab === 'chart' && '📈 Chart'}
              {tab === 'orderbook' && '📊 Order Book'}
              {tab === 'info' && 'ℹ️ Info'}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {activeTab === 'chart' && (
            <div className="h-[400px]">
              {candles && candles.length > 0 ? (
                <Chart candles={candles as any} symbol={symbol} height={400} />
              ) : (
                <div className="flex items-center justify-center h-full text-terminal-muted">
                  Loading chart...
                </div>
              )}
            </div>
          )}

          {activeTab === 'orderbook' && !!orderBook && (
            <div className="grid grid-cols-2 gap-4">
              {/* Bids */}
              <div>
                <h3 className="text-sm font-medium mb-2 price-up">Bids (Buy)</h3>
                <div className="space-y-1">
                  {((orderBook as any).bids || []).slice(0, 15).map((bid: any, i: number) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="font-mono">{formatPrice(bid.price)}</span>
                      <span className="font-mono text-terminal-muted">{formatVolume(bid.quantity)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Asks */}
              <div>
                <h3 className="text-sm font-medium mb-2 price-down">Asks (Sell)</h3>
                <div className="space-y-1">
                  {((orderBook as any).asks || []).slice(0, 15).map((ask: any, i: number) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="font-mono">{formatPrice(ask.price)}</span>
                      <span className="font-mono text-terminal-muted">{formatVolume(ask.quantity)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'info' && (
            <div className="space-y-4">
              <div className="terminal-card p-4">
                <h3 className="font-medium mb-2">Trading Statistics</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-terminal-muted">24h Trades:</span>
                    <span className="font-mono">{ticker?.trades24h?.toLocaleString() || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-terminal-muted">Bid:</span>
                    <span className="font-mono">{ticker ? formatPrice(ticker.bid) : '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-terminal-muted">Ask:</span>
                    <span className="font-mono">{ticker ? formatPrice(ticker.ask) : '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-terminal-muted">Spread:</span>
                    <span className="font-mono">{ticker ? formatPrice(ticker.spread) : '-'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
