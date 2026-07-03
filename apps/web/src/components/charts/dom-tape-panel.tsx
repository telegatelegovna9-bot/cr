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

const ROW_H = 18;

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const deferredOb = useDeferredValue(orderbook);

  const model = useMemo(
    () => deferredOb
      ? buildDomViewModel({ orderbook: deferredOb, levelsPerSide: settings.levelsPerSide })
      : null,
    [deferredOb, settings.levelsPerSide],
  );

  // Auto-center: keep spread row in the middle of the viewport
  useEffect(() => {
    if (!settings.autoCenter || !scrollRef.current || !model) return;
    const el = scrollRef.current;
    // Asks are reversed (lowest near spread), so spread row is at index = asks.length
    const spreadOffset = model.asks.length * ROW_H;
    const viewH = el.clientHeight;
    el.scrollTop = Math.max(0, spreadOffset - viewH / 2 + ROW_H);
  }, [model?.midPrice, settings.autoCenter, model?.asks.length]);

  return (
    <div className="relative flex min-h-0 flex-col" style={{ background: '#0b0e14' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex items-center gap-2">
          {availableMarkets && availableMarkets.length > 1 && activeMarket && onActiveMarketChange ? (
            <div className="flex items-center gap-0.5">
              {availableMarkets.map(market => (
                <button
                  key={market}
                  type="button"
                  onClick={() => onActiveMarketChange(market)}
                  className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider transition-colors"
                  style={{
                    color: market === activeMarket ? '#e0e0e0' : '#4a4a5a',
                    background: market === activeMarket ? 'rgba(255,255,255,0.05)' : 'transparent',
                    borderRadius: '3px',
                  }}
                >
                  {market}
                </button>
              ))}
            </div>
          ) : (
            <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#4a4a5a' }}>
              {marketLabel}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(open => !open)}
          className="flex h-4 w-4 items-center justify-center"
          style={{ color: settingsOpen ? '#888' : '#444' }}
        >
          <Settings className="h-3 w-3" />
        </button>
      </div>

      {/* Settings */}
      {settingsOpen && (
        <div
          className="absolute left-1 right-1 top-7 z-20 rounded p-2 text-[10px]"
          style={{ background: 'rgba(12,14,20,0.97)', border: '1px solid rgba(255,255,255,0.08)', color: '#aaa' }}
        >
          <label className="flex items-center justify-between py-0.5">
            <span>Auto-center</span>
            <input type="checkbox" checked={settings.autoCenter} onChange={e => onSettingsChange({ autoCenter: e.target.checked })} />
          </label>
          <label className="flex items-center justify-between py-0.5">
            <span>Levels</span>
            <input
              type="number" min={5} max={50} step={5}
              value={settings.levelsPerSide}
              onChange={e => onSettingsChange({ levelsPerSide: Math.max(5, Math.min(50, Number(e.target.value || 20))) })}
              style={{ width: 40, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#ccc', borderRadius: 3, padding: '1px 4px', fontSize: 10 }}
            />
          </label>
        </div>
      )}

      {/* Column headers */}
      <div
        className="grid items-center px-1.5"
        style={{
          gridTemplateColumns: '1fr auto 1fr',
          height: 16,
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          fontSize: 8,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: '#3a3a4a',
        }}
      >
        <span className="text-right pr-1">qty</span>
        <span className="px-1.5 text-center">price</span>
        <span className="pl-1">qty</span>
      </div>

      {/* Ladder body */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{ background: '#0b0e14' }}
      >
        {!model ? (
          <div className="px-2 py-6 text-center text-[10px]" style={{ color: '#3a3a4a' }}>
            {isActive ? 'loading...' : 'no data'}
          </div>
        ) : (
          <div>
            {/* Asks — reversed so lowest ask is at bottom (near spread) */}
            {[...model.asks].reverse().map(level => (
              <LadderRow key={`a-${level.price}`} level={level} side="ask" maxUsd={model.maxDepthUsd} />
            ))}

            {/* Spread bar */}
            <div
              className="flex items-center justify-between px-1.5"
              style={{
                height: 20,
                background: 'rgba(255,255,255,0.02)',
                borderTop: '1px solid rgba(255,255,255,0.06)',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <span style={{ fontSize: 9, color: '#555' }}>
                {formatPrice(model.spreadAbs)} <span style={{ color: '#444' }}>{model.spreadPct.toFixed(3)}%</span>
              </span>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#ddd', fontFamily: 'monospace' }}>
                {formatPrice(model.midPrice)}
              </span>
            </div>

            {/* Bids — highest bid at top (near spread) */}
            {model.bids.map(level => (
              <LadderRow key={`b-${level.price}`} level={level} side="bid" maxUsd={model.maxDepthUsd} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LadderRow({
  level,
  side,
  maxUsd,
}: {
  level: DomLevelRow;
  side: 'ask' | 'bid';
  maxUsd: number;
}) {
  const isAsk = side === 'ask';
  const barPct = maxUsd > 0 ? Math.min(100, (level.sizeUsd / maxUsd) * 100) : 0;
  const isLarge = level.isAnomalous;

  // Very subtle depth bar
  const barAlpha = isLarge ? 0.18 : 0.07;
  const barColor = isAsk
    ? `rgba(220,50,50,${barAlpha})`
    : `rgba(50,200,80,${barAlpha})`;

  const qtyColor = isAsk
    ? (isLarge ? '#e05050' : '#7a4040')
    : (isLarge ? '#50c870' : '#3a6a4a');

  const priceColor = isAsk ? '#c04040' : '#40a060';

  return (
    <div
      className="relative grid items-center"
      style={{
        height: ROW_H,
        gridTemplateColumns: '1fr auto 1fr',
        borderBottom: '1px solid rgba(255,255,255,0.015)',
      }}
    >
      {/* Depth bar — anchored to the qty side */}
      {barPct > 1 && (
        <div
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{
            width: `${barPct}%`,
            background: barColor,
            ...(isAsk ? { right: 0 } : { left: 0 }),
          }}
        />
      )}

      {/* Bid qty (left) */}
      {!isAsk ? (
        <div className="relative z-[1] flex items-center justify-end pr-1.5" style={{ fontFamily: 'monospace', fontSize: 10 }}>
          <span style={{ color: qtyColor, fontWeight: isLarge ? 700 : 400 }}>
            {fmtCoin(level.sizeCoin)}
          </span>
          <span style={{ color: '#333', fontSize: 8, marginLeft: 3 }}>
            {fmtUsd(level.sizeUsd)}
          </span>
        </div>
      ) : <div />}

      {/* Price (center) */}
      <div className="relative z-[1] px-1.5 text-center" style={{ fontFamily: 'monospace', fontSize: 10 }}>
        <span style={{ color: priceColor, fontWeight: isLarge ? 700 : 400 }}>
          {formatPrice(level.price)}
        </span>
      </div>

      {/* Ask qty (right) */}
      {isAsk ? (
        <div className="relative z-[1] flex items-center pl-1.5" style={{ fontFamily: 'monospace', fontSize: 10 }}>
          <span style={{ color: qtyColor, fontWeight: isLarge ? 700 : 400 }}>
            {fmtCoin(level.sizeCoin)}
          </span>
          <span style={{ color: '#333', fontSize: 8, marginLeft: 3 }}>
            {fmtUsd(level.sizeUsd)}
          </span>
        </div>
      ) : <div />}
    </div>
  );
}

function fmtUsd(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toFixed(0);
}

function fmtCoin(v: number): string {
  if (v >= 1000) return v.toFixed(0);
  if (v >= 1) return v.toFixed(3);
  if (v >= 0.01) return v.toFixed(4);
  return v.toFixed(6);
}
