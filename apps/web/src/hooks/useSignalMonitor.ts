'use client';

import { useEffect, useRef } from 'react';
import { useMarketStore, useDrawingStore, useUIStore } from '@/stores';
import { SignalLevelDrawing } from '@/lib/drawings/models';

export function shouldTriggerSignal(args: {
  last: number;
  current: number;
  level: number;
  armed: boolean;
  triggered: boolean;
}): boolean {
  if (!args.armed || args.triggered) return false;
  const up = args.last <= args.level && args.current >= args.level;
  const down = args.last >= args.level && args.current <= args.level;
  return up || down;
}

export function mapSignalToAlert(input: {
  id: string;
  symbol: string;
  exchange: string;
  price: number;
  current: number;
}) {
  return {
    id: `signal-${input.id}-${Date.now()}`,
    symbol: input.symbol,
    type: 'price_cross',
    condition: 'crossed',
    value: input.price,
    currentPrice: input.current,
    read: false,
    createdAt: Date.now(),
  };
}

export function useSignalMonitor() {
  const lastPricesRef = useRef<Record<string, number>>({});
  const { byId, upsertDrawing } = useDrawingStore();
  const { addAlert } = useUIStore();
  const tickers = useMarketStore(state => state.tickers);

  useEffect(() => {
    // Collect all armed signal levels
    const armedSignals = Object.values(byId).filter(
      (d): d is SignalLevelDrawing => d.kind === 'signal_level' && d.armed && !d.triggered
    );

    if (armedSignals.length === 0) return;

    for (const signal of armedSignals) {
      const tickerKey = `${signal.exchange}:${signal.symbol}`;
      const ticker = tickers.get(tickerKey);
      if (!ticker) continue;

      const currentPrice = ticker.lastPrice;
      const lastPrice = lastPricesRef.current[tickerKey];

      if (lastPrice !== undefined && lastPrice !== currentPrice) {
        if (shouldTriggerSignal({
          last: lastPrice,
          current: currentPrice,
          level: signal.price,
          armed: signal.armed,
          triggered: signal.triggered
        })) {
          // Trigger!
          const now = Date.now();
          upsertDrawing({
            ...signal,
            triggered: true,
            triggeredAt: now,
            armed: false,
            updatedAt: now
          });

          addAlert(mapSignalToAlert({
            id: signal.id,
            symbol: signal.symbol,
            exchange: signal.exchange,
            price: signal.price,
            current: currentPrice
          }) as any);
          
          console.log(`[Signal] Triggered for ${signal.symbol} at ${signal.price}`);
        }
      }

      lastPricesRef.current[tickerKey] = currentPrice;
    }
  }, [tickers, byId, upsertDrawing, addAlert]);
}
