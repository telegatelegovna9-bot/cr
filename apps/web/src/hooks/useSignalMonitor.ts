'use client';

import { useEffect, useRef } from 'react';
import { useDrawingStore } from '@/stores';
import { SignalLevelDrawing } from '@/lib/drawings/models';
import { alertsApi } from '@/lib/api';

export function useSignalMonitor() {
  const { byId } = useDrawingStore();
  const registeredSignalsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const signalLevels = Object.values(byId).filter(
      (d): d is SignalLevelDrawing => d.kind === 'signal_level'
    );

    const currentIds = new Set(signalLevels.map(s => s.id));

    // Register new signals
    for (const signal of signalLevels) {
      if (!registeredSignalsRef.current.has(signal.id) && signal.armed) {
        console.log(`[Signal] Registering on backend: ${signal.symbol} at ${signal.price}`);
        alertsApi.registerSignal({
          id: signal.id,
          symbol: signal.symbol,
          exchange: signal.exchange,
          price: signal.price,
          direction: 'cross',
          armed: signal.armed,
        }).catch(err => console.error('Failed to register signal:', err));
        registeredSignalsRef.current.add(signal.id);
      }
    }

    // Unregister deleted signals
    for (const id of registeredSignalsRef.current) {
      if (!currentIds.has(id)) {
        console.log(`[Signal] Unregistering from backend: ${id}`);
        alertsApi.unregisterSignal(id).catch(err => console.error('Failed to unregister signal:', err));
        registeredSignalsRef.current.delete(id);
      }
    }
  }, [byId]);
}
