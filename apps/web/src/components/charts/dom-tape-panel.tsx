'use client';

import { Settings } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { OrderBook, Trade } from '@crypto-screener/shared';
import { formatPrice } from '@/lib/format';
import {
  buildBubbleTapeItems,
  buildDomViewModel,
  type BubbleTapeItem,
  type DomLevelRow,
  type DomTapeSettings,
  trimBubbleTapeItems,
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

const SMALL_PRINT_BATCH_MS = 70;
const BUBBLE_TTL_MS = 3200;
const IMMEDIATE_PRINT_USD = 12_500;
const DOM_ROW_HEIGHT_PX = 24;
const DOM_MID_BAND_HEIGHT_PX = 28;
const DOM_BUBBLE_LANE_WIDTH_PX = 92;

export function DomTapePanel({
  marketLabel,
  orderbook,
  trades,
  isActive = true,
  settings,
  onSettingsChange,
  availableMarkets,
  activeMarket,
  onActiveMarketChange,
  compact = false,
}: DomTapePanelProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [manualAnchorPrice, setManualAnchorPrice] = useState<number | null>(null);
  const [autoAnchorPrice, setAutoAnchorPrice] = useState<number | null>(null);
  const [bubbleItems, setBubbleItems] = useState<BubbleTapeItem[]>([]);
  const domScrollRef = useRef<HTMLDivElement>(null);
  const smallTradeQueueRef = useRef<Trade[]>([]);
  const smallTradeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenTradeKeysRef = useRef<Set<string>>(new Set());
  const rowsPerSide = compact ? 18 : 28;
  const maxBubbleItems = compact ? 10 : 18;
  const deferredOrderbook = useDeferredValue(orderbook);
  const deferredTrades = useDeferredValue(trades);

  useEffect(() => {
    if (settings.autoCenter) {
      setManualAnchorPrice(null);
    }
  }, [settings.autoCenter, marketLabel, orderbook?.symbol, orderbook?.timestamp]);

  const model = useMemo(
    () => deferredOrderbook
      ? buildDomViewModel({
          orderbook: deferredOrderbook,
          compressionPct: settings.compressionPct,
          anchorPrice: settings.autoCenter ? autoAnchorPrice : manualAnchorPrice,
          rowsPerSide,
        })
      : null,
    [autoAnchorPrice, deferredOrderbook, manualAnchorPrice, rowsPerSide, settings.autoCenter, settings.compressionPct],
  );

  useEffect(() => {
    if (!model || !settings.autoCenter) return;
    const node = domScrollRef.current;
    if (!node) return;
    node.scrollTop = Math.max(0, (node.scrollHeight - node.clientHeight) / 2);
  }, [autoAnchorPrice, settings.autoCenter]);

  useEffect(() => {
    if (!deferredOrderbook) return;
    if (!settings.autoCenter) {
      setAutoAnchorPrice(null);
      return;
    }

    const nextMid = getOrderbookMidPrice(deferredOrderbook);
    if (nextMid <= 0) return;

    setAutoAnchorPrice(current => {
      if (current == null) return nextMid;
      const threshold = Math.max(current * settings.compressionPct * 0.55, model?.step ?? 0);
      if (Math.abs(nextMid - current) >= threshold) return nextMid;
      return current;
    });
  }, [deferredOrderbook, model?.step, settings.autoCenter, settings.compressionPct]);

  useEffect(() => {
    seenTradeKeysRef.current = new Set();
    smallTradeQueueRef.current = [];
    if (smallTradeTimerRef.current) {
      clearTimeout(smallTradeTimerRef.current);
      smallTradeTimerRef.current = null;
    }
    setAutoAnchorPrice(null);
    setBubbleItems([]);
  }, [activeMarket, isActive, marketLabel, orderbook?.symbol]);

  useEffect(() => {
    if (isActive) return;
    if (smallTradeTimerRef.current) {
      clearTimeout(smallTradeTimerRef.current);
      smallTradeTimerRef.current = null;
    }
    smallTradeQueueRef.current = [];
    setBubbleItems([]);
  }, [isActive]);

  useEffect(() => {
    setBubbleItems(current => current.filter(item => item.sizeUsd >= settings.minTapeSizeUsd));
  }, [settings.minTapeSizeUsd]);

  useEffect(() => {
    if (!isActive) return;

    const flushSmallTrades = () => {
      const queued = smallTradeQueueRef.current;
      smallTradeQueueRef.current = [];
      smallTradeTimerRef.current = null;
      if (queued.length === 0) return;

      const now = Date.now();
      const nextItems = buildBubbleTapeItems({
        trades: queued,
        minLargePrintUsd: IMMEDIATE_PRINT_USD,
        now,
      });
      setBubbleItems(current =>
        trimBubbleTapeItems({
          items: [...current, ...nextItems],
          now,
          maxItems: maxBubbleItems,
          ttlMs: BUBBLE_TTL_MS,
        }),
      );
    };

    const incomingTrades: Trade[] = [];
    for (const trade of deferredTrades) {
      const key = `${trade.id}:${trade.timestamp}`;
      if (seenTradeKeysRef.current.has(key)) continue;
      seenTradeKeysRef.current.add(key);
      if (trade.price * trade.quantity < settings.minTapeSizeUsd) continue;
      incomingTrades.push(trade);
    }

    if (incomingTrades.length === 0) return;

    const currentTradeKeys = new Set(deferredTrades.map(trade => `${trade.id}:${trade.timestamp}`));
    if (seenTradeKeysRef.current.size > currentTradeKeys.size + 32) {
      seenTradeKeysRef.current = currentTradeKeys;
    }

    const immediateTrades: Trade[] = [];
    for (const trade of incomingTrades) {
      const sizeUsd = trade.price * trade.quantity;
      if (sizeUsd >= IMMEDIATE_PRINT_USD) {
        immediateTrades.push(trade);
      } else {
        smallTradeQueueRef.current.push(trade);
      }
    }

    if (immediateTrades.length > 0) {
      const now = Date.now();
      const nextItems = buildBubbleTapeItems({
        trades: immediateTrades,
        minLargePrintUsd: IMMEDIATE_PRINT_USD,
        now,
      });
      setBubbleItems(current =>
        trimBubbleTapeItems({
          items: [...current, ...nextItems],
          now,
          maxItems: maxBubbleItems,
          ttlMs: BUBBLE_TTL_MS,
        }),
      );
    }

    if (smallTradeQueueRef.current.length > 0 && !smallTradeTimerRef.current) {
      smallTradeTimerRef.current = setTimeout(flushSmallTrades, SMALL_PRINT_BATCH_MS);
    }

    return () => {};
  }, [deferredTrades, isActive, maxBubbleItems, settings.minTapeSizeUsd]);

  useEffect(() => {
    if (!isActive || bubbleItems.length === 0) return;

    const nearestExpiryMs = Math.max(
      0,
      Math.min(...bubbleItems.map(item => item.createdAt + BUBBLE_TTL_MS - Date.now())),
    );
    const timer = setTimeout(() => {
      const now = Date.now();
      setBubbleItems(current =>
        trimBubbleTapeItems({
          items: current,
          now,
          maxItems: maxBubbleItems,
          ttlMs: BUBBLE_TTL_MS,
        }),
      );
    }, nearestExpiryMs + 16);

    return () => clearTimeout(timer);
  }, [bubbleItems, isActive, maxBubbleItems]);

  useEffect(() => () => {
    if (smallTradeTimerRef.current) {
      clearTimeout(smallTradeTimerRef.current);
      smallTradeTimerRef.current = null;
    }
  }, []);

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

  const bubbleSlots = useMemo(
    () => bubbleItems.map((item, index) => ({
      item,
      leftPx: 10 + index * (compact ? 18 : 22),
      topPx: getBubbleTopPx(item, model),
      sizePx: Math.round((compact ? 20 : 24) + item.intensity * (compact ? 16 : 24) + (item.isLargePrint ? 6 : 0)),
    })),
    [bubbleItems, compact, model],
  );

  return (
    <div className="relative flex min-h-0 flex-col bg-[#0a0d14]">
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
        <div
          className="absolute left-2 right-2 top-11 z-20 grid grid-cols-2 gap-2 rounded-xl border border-border/80 px-3 py-3 text-[11px] text-text-secondary shadow-2xl"
          style={{ background: 'rgba(8, 10, 18, 0.96)', backdropFilter: 'blur(14px)' }}
        >
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
            <span>Bubble label</span>
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

      <div className={`relative min-h-0 flex-1 ${settingsOpen ? 'pt-[8.75rem]' : ''}`}>
        <div
          className="grid items-center gap-x-3 border-b border-border/70 px-3 py-1 text-[9px] uppercase tracking-[0.24em] text-text-muted"
          style={{ gridTemplateColumns: `${DOM_BUBBLE_LANE_WIDTH_PX}px minmax(0, 1fr) auto` }}
        >
          <span className="pl-1">Tape</span>
          <span>Qty</span>
          <span className="text-right">Price</span>
        </div>

        <div
          ref={domScrollRef}
          className="relative min-h-0 h-full overflow-auto bg-[radial-gradient(circle_at_top,rgba(22,29,43,0.55),transparent_32%),linear-gradient(180deg,#0c1018_0%,#090c12_100%)]"
          onWheel={handleDomWheel}
        >
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(20,28,42,0.12)_0%,transparent_16%,transparent_84%,rgba(20,28,42,0.12)_100%)]" />
          {!model ? (
            <div className="px-3 py-6 text-center text-xs text-text-muted">Waiting for order book...</div>
          ) : (
            <>
              <div className="relative">
                {model.asks.map(level => (
                  <DomRow key={`ask-${level.price}`} level={level} side="sell" />
                ))}
                <div
                  className="relative z-20 border-y border-border/80 bg-[#101522]/96 px-3 py-1.5"
                  style={{ minHeight: `${DOM_MID_BAND_HEIGHT_PX}px` }}
                >
                  <div
                    className="grid items-center gap-3"
                    style={{ gridTemplateColumns: `${DOM_BUBBLE_LANE_WIDTH_PX}px minmax(0, 1fr) auto` }}
                  >
                    <span className="pl-1 text-[10px] uppercase tracking-[0.24em] text-text-muted">Tape</span>
                    <div className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-left">
                      <div className="font-mono text-[12px] font-semibold text-text-primary">
                        {formatPrice(model.midPrice)}
                      </div>
                      <div className="text-[10px] text-text-secondary">
                        {formatSpread(model.spreadAbs, model.spreadPct)}
                      </div>
                    </div>
                    <span className="text-right text-[10px] tracking-[0.1em] text-text-muted">
                      {bubbleItems.length} live
                    </span>
                  </div>
                </div>
                {model.bids.map(level => (
                  <DomRow key={`bid-${level.price}`} level={level} side="buy" />
                ))}

                <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
                  <div
                    className="absolute left-0 top-0 bottom-0 border-r border-white/[0.04]"
                    style={{ width: `${DOM_BUBBLE_LANE_WIDTH_PX}px` }}
                  />
                  {bubbleSlots.map(({ item, leftPx, topPx, sizePx }) => (
                    <div
                      key={`${item.id}-${item.timestamp}`}
                      className="absolute dom-bubble-tape-item"
                      style={{
                        left: `${leftPx}px`,
                        top: `${topPx}px`,
                        animationDuration: `${item.isLargePrint ? BUBBLE_TTL_MS + 700 : BUBBLE_TTL_MS}ms`,
                      }}
                    >
                      <BubbleTrade
                        item={item}
                        sizePx={sizePx}
                        label={settings.tapeSizeMode === 'usd' ? formatCompactUsd(item.sizeUsd) : formatCompactCoin(item.sizeCoin)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DomRow({ level, side }: { level: DomLevelRow; side: 'buy' | 'sell' }) {
  const fillWidth = `${Math.max(4, Math.round(level.depthRatio * 100))}%`;
  const isBuy = side === 'buy';
  const flowFill = isBuy ? 'rgba(34,197,94,0.16)' : 'rgba(239,68,68,0.16)';
  const anomalyFill = isBuy ? 'rgba(34,197,94,0.28)' : 'rgba(239,68,68,0.28)';

  return (
    <div
      className="relative grid h-6 items-center gap-x-3 border-b border-white/[0.03] px-3 font-mono text-[11px]"
      style={{ gridTemplateColumns: `${DOM_BUBBLE_LANE_WIDTH_PX}px minmax(0, 1fr) auto` }}
    >
      <div
        className="absolute inset-y-[2px] rounded-sm"
        style={{
          width: fillWidth,
          background: level.isAnomalous ? anomalyFill : flowFill,
          left: isBuy ? `${DOM_BUBBLE_LANE_WIDTH_PX + 4}px` : undefined,
          right: isBuy ? undefined : '0.25rem',
        }}
      />
      <span />
      <span className={`relative z-[1] ${level.isAnomalous ? 'font-bold text-text-primary' : 'text-text-secondary'}`}>
        {formatCompactCoin(level.sizeCoin)}
      </span>
      <span className={`relative z-[1] text-right ${isBuy ? 'text-positive' : 'text-negative'}`}>
        {formatPrice(level.price)}
      </span>
    </div>
  );
}

function BubbleTrade({
  item,
  sizePx,
  label,
}: {
  item: BubbleTapeItem;
  sizePx: number;
  label: string;
}) {
  const isBuy = item.side === 'buy';
  const fill = isBuy
    ? 'radial-gradient(circle at 30% 30%, rgba(147,255,193,0.98), rgba(38,190,101,0.92) 52%, rgba(14,94,49,0.92) 100%)'
    : 'radial-gradient(circle at 30% 30%, rgba(255,184,184,0.98), rgba(225,78,78,0.92) 52%, rgba(108,24,24,0.92) 100%)';
  const shadow = isBuy
    ? '0 0 28px rgba(34,197,94,0.22)'
    : '0 0 28px rgba(239,68,68,0.22)';

  return (
    <div
      className="flex items-center justify-center rounded-full border font-mono"
      style={{
        width: `${sizePx}px`,
        height: `${sizePx}px`,
        background: fill,
        borderColor: isBuy ? 'rgba(187,247,208,0.45)' : 'rgba(254,202,202,0.45)',
        boxShadow: shadow,
      }}
    >
      <span
        className="px-1 text-center text-[10px] font-semibold leading-none text-[#06110b]"
        style={{ color: isBuy ? '#04140b' : '#1b0606' }}
      >
        {label}
      </span>
    </div>
  );
}

function getBubbleTopPx(item: BubbleTapeItem, model: ReturnType<typeof buildDomViewModel>): number {
  if (!model) return DOM_MID_BAND_HEIGHT_PX / 2;

  const askTop = model.asks[0]?.price ?? model.midPrice;
  const askNear = model.asks[model.asks.length - 1]?.price ?? model.midPrice;
  const bidNear = model.bids[0]?.price ?? model.midPrice;
  const bidBottom = model.bids[model.bids.length - 1]?.price ?? model.midPrice;

  if (item.price >= model.midPrice && askTop > askNear) {
    const clamped = clamp(item.price, askNear, askTop);
    const ratio = (askTop - clamped) / (askTop - askNear);
    return ratio * DOM_ROW_HEIGHT_PX * Math.max(0, model.asks.length - 1) + DOM_ROW_HEIGHT_PX / 2;
  }

  if (item.price < model.midPrice && bidNear > bidBottom) {
    const clamped = clamp(item.price, bidBottom, bidNear);
    const ratio = (bidNear - clamped) / (bidNear - bidBottom);
    return (
      model.asks.length * DOM_ROW_HEIGHT_PX +
      DOM_MID_BAND_HEIGHT_PX +
      ratio * DOM_ROW_HEIGHT_PX * Math.max(0, model.bids.length - 1) +
      DOM_ROW_HEIGHT_PX / 2
    );
  }

  return model.asks.length * DOM_ROW_HEIGHT_PX + DOM_MID_BAND_HEIGHT_PX / 2;
}

function getOrderbookMidPrice(orderbook: OrderBook): number {
  const bestBid = orderbook.bids[0]?.price ?? 0;
  const bestAsk = orderbook.asks[0]?.price ?? 0;
  if (bestBid > 0 && bestAsk > 0) return (bestBid + bestAsk) / 2;
  if (bestAsk > 0) return bestAsk;
  if (bestBid > 0) return bestBid;
  return 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatCompactUsd(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
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
