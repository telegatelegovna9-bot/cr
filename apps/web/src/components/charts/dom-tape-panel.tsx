'use client';

import { Settings } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { OrderBook, Trade } from '@crypto-screener/shared';
import { formatPrice } from '@/lib/format';
import {
  buildDomViewModel,
  buildTapeRows,
  type DomLevelRow,
  type DomTapeSettings,
  type TapeRow,
} from '@/lib/dom-tape';

interface DomTapePanelProps {
  marketLabel: 'spot' | 'futures';
  orderbook: OrderBook | null | undefined;
  trades: Trade[];
  settings: DomTapeSettings;
  onSettingsChange: (patch: Partial<DomTapeSettings>) => void;
  availableMarkets?: Array<'spot' | 'futures'>;
  activeMarket?: 'spot' | 'futures';
  onActiveMarketChange?: (market: 'spot' | 'futures') => void;
  compact?: boolean;
}

export function DomTapePanel({
  marketLabel,
  orderbook,
  trades,
  settings,
  onSettingsChange,
  availableMarkets,
  activeMarket,
  onActiveMarketChange,
  compact = false,
}: DomTapePanelProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [manualAnchorPrice, setManualAnchorPrice] = useState<number | null>(null);
  const domScrollRef = useRef<HTMLDivElement>(null);
  const rowsPerSide = compact ? 12 : 18;

  useEffect(() => {
    if (settings.autoCenter) {
      setManualAnchorPrice(null);
    }
  }, [settings.autoCenter, marketLabel, orderbook?.symbol, orderbook?.timestamp]);

  const model = useMemo(
    () => orderbook
      ? buildDomViewModel({
          orderbook,
          compressionPct: settings.compressionPct,
          anchorPrice: settings.autoCenter ? undefined : manualAnchorPrice,
          rowsPerSide,
        })
      : null,
    [manualAnchorPrice, orderbook, rowsPerSide, settings.autoCenter, settings.compressionPct],
  );
  const tapeRows = useMemo(
    () =>
      buildTapeRows({
        trades,
        minSizeUsd: settings.minTapeSizeUsd,
      }).slice(0, compact ? 28 : 42),
    [compact, settings.minTapeSizeUsd, trades],
  );

  useEffect(() => {
    if (!model || !settings.autoCenter) return;
    const node = domScrollRef.current;
    if (!node) return;
    node.scrollTop = Math.max(0, (node.scrollHeight - node.clientHeight) / 2);
  }, [model, settings.autoCenter]);

  const handleDomWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!model || settings.autoCenter) return;
    event.preventDefault();
    const direction = event.deltaY > 0 ? 1 : -1;
    const step = Math.max(model.step, model.midPrice * 0.0001);
    setManualAnchorPrice(current => {
      const start = current ?? model.midPrice;
      return Math.max(step, start + direction * step * 2);
    });
  };

  return (
    <div className="flex min-h-0 flex-col border-t border-border lg:border-l lg:border-t-0">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
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
                    className={`rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] transition-colors ${
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
            <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-text-muted">
              {marketLabel}
            </span>
          )}
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-text-secondary">
            {Math.round(settings.compressionPct * 10000) / 100}%
          </span>
          {!settings.autoCenter && model ? (
            <button
              type="button"
              onClick={() => setManualAnchorPrice(model.midPrice)}
              className="rounded-full border border-border px-2 py-0.5 text-[10px] text-text-muted transition-colors hover:text-text-secondary"
            >
              Recenter
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(open => !open)}
          className={`flex h-6 w-6 items-center justify-center rounded-md border transition-colors ${
            settingsOpen
              ? 'border-accent/50 bg-accent/15 text-accent-light'
              : 'border-border/60 bg-bg-primary/50 text-text-muted hover:text-text-secondary'
          }`}
        >
          <Settings className="h-3 w-3" />
        </button>
      </div>

      {settingsOpen ? (
        <div className="grid grid-cols-2 gap-2 border-b border-border px-3 py-2 text-[11px] text-text-secondary">
          <label className="col-span-2 flex items-center justify-between gap-3">
            <span>Compression %</span>
            <input
              type="number"
              min={0.25}
              step={0.25}
              value={(settings.compressionPct * 100).toFixed(2)}
              onChange={event => onSettingsChange({ compressionPct: Math.max(0.0025, Number(event.target.value || 2) / 100) })}
              className="input-premium w-24 !py-1 !text-[11px]"
            />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>Auto-center</span>
            <input
              type="checkbox"
              checked={settings.autoCenter}
              onChange={event => onSettingsChange({ autoCenter: event.target.checked })}
            />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>Tape format</span>
            <select
              value={settings.tapeSizeMode}
              onChange={event => onSettingsChange({ tapeSizeMode: event.target.value as 'usd' | 'coin' })}
              className="input-premium w-24 !py-1 !text-[11px]"
            >
              <option value="usd">USD</option>
              <option value="coin">Coin</option>
            </select>
          </label>
          <label className="col-span-2 flex items-center justify-between gap-3">
            <span>Min tape size USD</span>
            <input
              type="number"
              min={0}
              step={1000}
              value={settings.minTapeSizeUsd}
              onChange={event => onSettingsChange({ minTapeSizeUsd: Math.max(0, Number(event.target.value || 0)) })}
              className="input-premium w-28 !py-1 !text-[11px]"
            />
          </label>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="min-h-0 flex-1 border-b border-border lg:border-b-0 lg:border-r lg:border-border">
          <div className="grid grid-cols-[1fr_auto] gap-x-3 border-b border-border/70 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-text-muted">
            <span>Price</span>
            <span>Size</span>
          </div>
          <div
            ref={domScrollRef}
            className="min-h-0 overflow-auto"
            onWheel={handleDomWheel}
          >
            {!model ? (
              <div className="px-3 py-6 text-center text-xs text-text-muted">Waiting for order book...</div>
            ) : (
              <>
                {model.asks.map(level => (
                  <DomRow key={`ask-${level.price}`} level={level} side="sell" />
                ))}
                <div className="sticky top-0 z-10 grid grid-cols-[1fr_auto] gap-x-3 border-y border-border bg-bg-primary/95 px-3 py-1.5 text-[11px] font-semibold text-text-primary backdrop-blur">
                  <span>{formatPrice(model.midPrice)}</span>
                  <span className="text-text-secondary">{formatSpread(model.spreadAbs, model.spreadPct)}</span>
                </div>
                {model.bids.map(level => (
                  <DomRow key={`bid-${level.price}`} level={level} side="buy" />
                ))}
              </>
            )}
          </div>
        </div>

        <div className="flex min-h-0 w-full flex-col lg:w-[11rem]">
          <div className="grid grid-cols-[auto_1fr_auto] gap-x-2 border-b border-border/70 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-text-muted">
            <span>Side</span>
            <span>Price</span>
            <span>Print</span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {tapeRows.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-text-muted">Waiting for tape...</div>
            ) : (
              tapeRows.map(row => (
                <TapeTradeRow key={`${row.id}-${row.timestamp}`} row={row} sizeMode={settings.tapeSizeMode} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DomRow({ level, side }: { level: DomLevelRow; side: 'buy' | 'sell' }) {
  const fillWidth = `${Math.max(6, Math.round(level.depthRatio * 100))}%`;
  const baseFill = side === 'buy' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)';
  const strongFill = side === 'buy' ? 'rgba(34,197,94,0.22)' : 'rgba(239,68,68,0.22)';

  return (
    <div className="relative grid grid-cols-[1fr_auto] gap-x-3 px-3 py-1.5 font-mono text-[11px]">
      <div
        className="absolute inset-y-0 right-0 rounded-sm"
        style={{
          width: fillWidth,
          background: level.isAnomalous ? strongFill : baseFill,
        }}
      />
      <span className={`relative z-[1] ${side === 'buy' ? 'text-positive' : 'text-negative'}`}>
        {formatPrice(level.price)}
      </span>
      <span className={`relative z-[1] text-right ${level.isAnomalous ? 'font-bold text-text-primary' : 'text-text-secondary'}`}>
        {formatCompactUsd(level.sizeUsd)}
      </span>
    </div>
  );
}

function TapeTradeRow({ row, sizeMode }: { row: TapeRow; sizeMode: 'usd' | 'coin' }) {
  const fill = row.side === 'buy'
    ? `rgba(34,197,94,${0.08 + row.intensity * 0.2})`
    : `rgba(239,68,68,${0.08 + row.intensity * 0.2})`;

  return (
    <div className="relative grid grid-cols-[auto_1fr_auto] gap-x-2 px-3 py-1.5 font-mono text-[11px]">
      <div className="absolute inset-0" style={{ background: fill }} />
      <span className={`relative z-[1] ${row.side === 'buy' ? 'text-positive' : 'text-negative'}`}>
        {row.side === 'buy' ? 'B' : 'S'}
      </span>
      <span className="relative z-[1] text-text-secondary">{formatPrice(row.price)}</span>
      <span className={`relative z-[1] text-right ${row.isLargePrint ? 'font-bold text-text-primary' : 'text-text-secondary'}`}>
        {sizeMode === 'usd' ? formatCompactUsd(row.sizeUsd) : formatCompactCoin(row.sizeCoin)}
      </span>
    </div>
  );
}

function formatCompactUsd(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return value.toFixed(0);
}

function formatCompactCoin(value: number): string {
  if (value >= 1000) return value.toFixed(0);
  if (value >= 1) return value.toFixed(2);
  return value.toFixed(4);
}

function formatSpread(abs: number, pct: number): string {
  return `${formatPrice(abs)} / ${pct.toFixed(3)}%`;
}
