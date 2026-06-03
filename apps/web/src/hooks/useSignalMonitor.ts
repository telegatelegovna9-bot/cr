'use client';

import { useEffect, useRef } from 'react';
import { useMarketStore, useDrawingStore, useUIStore, useAlertStore } from '@/stores';
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

export function mapSignalToTriggeredAlert(input: {
  id: string;
  symbol: string;
  price: number;
  current: number;
}) {
  return {
    id: `triggered-${input.id}-${Date.now()}`,
    alertId: input.id,
    symbol: input.symbol,
    alert: {
      type: 'price_cross',
      condition: input.current >= input.price ? 'above' : 'below',
      value: input.price,
    },
    currentPrice: input.current,
    triggeredAt: Date.now(),
  };
}

export function useSignalMonitor() {
  const lastPricesRef = useRef<Record<string, number>>({});
  const { byId, upsertDrawing } = useDrawingStore();
  const { addAlert } = useUIStore();
  const { addAlert: addConfiguredAlert, addTriggeredAlert, alerts, removeAlert: removeConfiguredAlert } = useAlertStore();
  const tickers = useMarketStore(state => state.tickers);

  useEffect(() => {
    const signalLevels = Object.values(byId).filter(
      (d): d is SignalLevelDrawing => d.kind === 'signal_level'
    );

    for (const signal of signalLevels) {
      const exists = alerts.some(alert => alert.id === signal.id);
      if (exists) continue;

      addConfiguredAlert({
        id: signal.id,
        symbol: signal.symbol,
        type: 'price_cross',
        condition: 'cross',
        value: signal.price,
        enabled: signal.armed,
        createdAt: signal.createdAt,
      });
    }

    for (const alert of alerts) {
      if (alert.type !== 'price_cross') continue;
      const stillExists = signalLevels.some(signal => signal.id === alert.id);
      if (!stillExists) {
        removeConfiguredAlert(alert.id);
      }
    }
  }, [alerts, addConfiguredAlert, byId, removeConfiguredAlert]);

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
          addTriggeredAlert(mapSignalToTriggeredAlert({
            id: signal.id,
            symbol: signal.symbol,
            price: signal.price,
            current: currentPrice,
          }));
          
          console.log(`[Signal] Triggered for ${signal.symbol} at ${signal.price}`);
        }
      }

      lastPricesRef.current[tickerKey] = currentPrice;
    }
  }, [tickers, byId, upsertDrawing, addAlert, addTriggeredAlert]);
}
