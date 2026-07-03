'use client';

import { Settings } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { OrderBook, Trade } from '@crypto-screener/shared';
import { formatPrice } from '@/lib/format';
import {
  buildDomViewModel,
  type DomLevelRow,
  type DomTapeSettings,
} from '@/lib/dom-tape';

interface DomTapePanelProps {
  marketLabel: 'spot' | 'futures';
  orderbook: OrderBook | null | undefined;
  trades: Trade[];
  isActive?: boolean;
  settings: DomTapeSettings;
  onSettingsChange: (patch: Partial<DomTapeSettings>) => void;
  availableMarkets?: Array<'spot' | 'futures'>;
  activeMarket?: 'spot' | 'futures';
  onActiveMarketChange?: (market: 'spot' | 'futures') => void;
  compact?: boolean;
}

const ROW_HEIGHT_PX = 22;
const SPREAD_ROW_HEIGHT_PX = 32;

export function DomTapePanel({
  marketLabel,
  orderbook,
  trades: _trades,
  isActive = true,
  settings,
  onSettingsChange,
  availableMarkets,
  activeMarket,
  onActiveMarketChange,
  compact: _compact = false,
}: DomTapePanelProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const domScrollRef = useRef<HTMLDivElement>(null);
  const midRef = useRef<HTMLDivElement>(null);
  const deferredOrderbook = useDeferredValue(orderbook);
  const prevPricesRef = useRef<Set<string>>(new Set());

  const model = useMemo(
    () => deferredOrderbook
      ? buildDomViewModel({
          orderbook: deferredOrderbook,
          levelsPerSide: settings.levelsPerSide,
        })
      : null,
    [deferredOrderbook, settings.levelsPerSide],
  );

  // Track changed prices for flash effect
  const changedPrices = useMemo(() => {
    if (!model) return new Set<string>();
    const current = new Set<string>();
    for (const row of model.asks) current.add(row.price.toFixed(8));
    for (const row of model.bids) current.add(row.price.toFixed(8));

    const changed = new Set<string>();
    for (const key of current) {
      if (!prevPricesRef.current.has(key)) changed.add(key);
    }
    // Also flash if qty changed at same price
    prevPricesRef.current = current;
    return changed;
  }, [model]);

  // Auto-center scroll
  useEffect(() => {
    if (!settings.autoCenter || !midRef.current) return;
    midRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [model?.midPrice, settings.autoCenter]);

  // Reset on symbol/market change
  useEffect(() => {
    prevPricesRef.current = new Set();
  }, [orderbook?.symbol, activeMarket]);

  return (
    <div className="relative flex min-h-0 flex-col bg-[#0a0d14]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-2">
          {availableMarkets && availableMarkets.length > 1 && activeMarket && onActiveMarketChange ? (
            <div className="flex items-center rounded-md border border-border/70 bg-bg-primary/60 p-0.5">
              {availableMarkets.map(market => {
                const active = market === activeMarket;
                return (
                  <button
                    key={market}
                    type="button"
                    onClick={() => onActiveMarketChange(market)}
                    className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] transition-colors ${
                      active
                        ? 'bg-accent/15 text-accent-light'
                        : 'text-text-muted hover:text-text-secondary'
                    }`}
                  >
                    {market}
                  </button>
                );
              })}
            </div>
          ) : (
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted">
              {marketLabel}
            </span>
          )}
          <span className="text-[10px] text-text-muted">{settings.levelsPerSide}L</span>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(open => !open)}
          className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
            settingsOpen
              ? 'border-accent/50 bg-accent/15 text-accent-light'
              : 'border-border/60 bg-bg-primary/50 text-text-muted hover:text-text-secondary'
          }`}
        >
          <Settings className="h-3 w-3" />
        </button>
      </div>

      {/* Settings dropdown */}
      {settingsOpen && (
        <div
          className="absolute left-2 right-2 top-9 z-20 rounded-lg border border-border/80 px-3 py-2 text-[11px] text-text-secondary shadow-2xl"
          style={{ background: 'rgba(8, 10, 18, 0.96)', backdropFilter: 'blur(14px)' }}
        >
          <label className="flex items-center justify-between gap-3 py-1">
            <span>Auto-center</span>
            <input
              type="checkbox"
              checked={settings.autoCenter}
              onChange={event => onSettingsChange({ autoCenter: event.target.checked })}
            />
          </label>
          <label className="flex items-center justify-between gap-3 py-1">
            <span>Levels per side</span>
            <input
              type="number"
              min={5}
              max={50}
              step={5}
              value={settings.levelsPerSide}
              onChange={event => onSettingsChange({ levelsPerSide: Math.max(5, Math.min(50, Number(event.target.value || 20))) })}
              className="input-premium w-16 !py-0.5 !text-[11px]"
            />
          </label>
          <label className="flex items-center justify-between gap-3 py-1">
            <span>Min size USD</span>
            <input
              type="number"
              min={0}
              step={1000}
              value={settings.minTapeSizeUsd}
              onChange={event => onSettingsChange({ minTapeSizeUsd: Math.max(0, Number(event.target.value || 0)) })}
              className="input-premium w-20 !py-0.5 !text-[11px]"
            />
          </label>
        </div>
      )}

      {/* Column headers */}
      <div
        className="grid items-center border-b border-border/50 px-2 py-1 text-[9px] uppercase tracking-[0.2em] text-text-muted"
        style={{ gridTemplateColumns: '1fr auto 1fr' }}
      >
        <span className="text-right pr-2">Bid Qty</span>
        <span className="px-2 text-center">Price</span>
        <span className="pl-2">Ask Qty</span>
      </div>

      {/* Order book body */}
      <div
        ref={domScrollRef}
        className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
        style={{ background: 'linear-gradient(180deg, #0c1018 0%, #090c12 100%)' }}
      >
        {!model ? (
          <div className="px-3 py-8 text-center text-xs text-text-muted">
            {isActive ? 'Waiting for order book...' : 'No data'}
          </div>
        ) : (
          <div>
            {/* Asks (reversed: lowest ask at bottom, closest to spread) */}
            {[...model.asks].reverse().map(level => (
              <PriceLadderRow
                key={`ask-${level.price}`}
                level={level}
                side="ask"
                maxDepthUsd={model.maxDepthUsd}
                isFlashing={changedPrices.has(level.price.toFixed(8))}
                rowHeight={ROW_HEIGHT_PX}
              />
            ))}

            {/* Spread divider */}
            <div
              ref={midRef}
              className="relative z-10 flex items-center justify-between border-y border-border/60 px-2"
              style={{
                height: `${SPREAD_ROW_HEIGHT_PX}px`,
                background: 'linear-gradient(90deg, rgba(16,21,34,0.95) 0%, rgba(20,27,42,0.98) 50%, rgba(16,21,34,0.95) 100%)',
              }}
            >
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-text-muted">Spread</span>
                <span className="font-mono text-text-secondary">
                  {formatPrice(model.spreadAbs)}
                </span>
                <span className="text-text-muted">
                  {model.spreadPct.toFixed(3)}%
                </span>
              </div>
              <span className="font-mono text-[12px] font-semibold text-text-primary">
                {formatPrice(model.midPrice)}
              </span>
            </div>

            {/* Bids (highest bid at top, closest to spread) */}
            {model.bids.map(level => (
              <PriceLadderRow
                key={`bid-${level.price}`}
                level={level}
                side="bid"
                maxDepthUsd={model.maxDepthUsd}
                isFlashing={changedPrices.has(level.price.toFixed(8))}
                rowHeight={ROW_HEIGHT_PX}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PriceLadderRow({
  level,
  side,
  maxDepthUsd,
  isFlashing,
  rowHeight,
}: {
  level: DomLevelRow;
  side: 'ask' | 'bid';
  maxDepthUsd: number;
  isFlashing: boolean;
  rowHeight: number;
}) {
  const isAsk = side === 'ask';
  const barPct = maxDepthUsd > 0 ? Math.max(2, (level.sizeUsd / maxDepthUsd) * 100) : 0;
  const isLarge = level.isAnomalous;

  const barColor = isAsk
    ? isLarge ? 'rgba(239,68,68,0.35)' : 'rgba(239,68,68,0.18)'
    : isLarge ? 'rgba(34,197,94,0.35)' : 'rgba(34,197,94,0.18)';

  const flashColor = isAsk
    ? 'rgba(239,68,68,0.12)'
    : 'rgba(34,197,94,0.12)';

  return (
    <div
      className={`relative grid items-center px-2 font-mono text-[11px] transition-colors ${
        isFlashing ? 'dom-flash' : ''
      }`}
      style={{
        height: `${rowHeight}px`,
        gridTemplateColumns: '1fr auto 1fr',
        animation: isFlashing ? undefined : undefined,
      }}
    >
      {/* Flash background */}
      {isFlashing && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: flashColor }}
        />
      )}

      {/* Depth bar */}
      <div
        className="absolute top-[2px] bottom-[2px] pointer-events-none"
        style={{
          width: `${barPct}%`,
          background: barColor,
          borderRadius: '2px',
          ...(isAsk
            ? { right: '2px' }
            : { left: '2px' }
          ),
        }}
      />

      {/* Bid qty column (left) */}
      {!isAsk ? (
        <div className="relative z-[1] flex items-center justify-end pr-2">
          <span className={`tabular-nums ${isLarge ? 'font-bold text-positive' : 'text-positive/80'}`}>
            {formatCompactCoin(level.sizeCoin)}
          </span>
          <span className="ml-1.5 text-[9px] text-text-muted tabular-nums">
            {formatCompactUsd(level.sizeUsd)}
          </span>
        </div>
      ) : (
        <div />
      )}

      {/* Price column (center) */}
      <div className="relative z-[1] px-2 text-center">
        <span className={`tabular-nums ${isAsk ? 'text-negative' : 'text-positive'} ${isLarge ? 'font-bold' : ''}`}>
          {formatPrice(level.price)}
        </span>
      </div>

      {/* Ask qty column (right) */}
      {isAsk ? (
        <div className="relative z-[1] flex items-center pl-2">
          <span className={`tabular-nums ${isLarge ? 'font-bold text-negative' : 'text-negative/80'}`}>
            {formatCompactCoin(level.sizeCoin)}
          </span>
          <span className="ml-1.5 text-[9px] text-text-muted tabular-nums">
            {formatCompactUsd(level.sizeUsd)}
          </span>
        </div>
      ) : (
        <div />
      )}
    </div>
  );
}

function formatCompactUsd(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

function formatCompactCoin(value: number): string {
  if (value >= 1000) return value.toFixed(0);
  if (value >= 1) return value.toFixed(3);
  if (value >= 0.01) return value.toFixed(4);
  return value.toFixed(6);
}
