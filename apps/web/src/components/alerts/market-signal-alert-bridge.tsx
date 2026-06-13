'use client';

import { useEffect, useRef } from 'react';
import { fetchSignalAlerts } from '@/lib/signals/api';
import { useAlertStore, useUIStore } from '@/stores';

export function MarketSignalAlertBridge() {
  const addTriggeredAlert = useAlertStore(state => state.addTriggeredAlert);
  const alertConfig = useAlertStore(state => state.config);
  const addAlertHistory = useUIStore(state => state.addAlert);
  const seenSignalAlertIds = useRef<Set<string>>(new Set());
  const initializedSignalAlerts = useRef(false);

  useEffect(() => {
    if (!alertConfig.marketSignalsEnabled) {
      initializedSignalAlerts.current = false;
      seenSignalAlertIds.current.clear();
      return;
    }

    let cancelled = false;

    const loadAlerts = async (seedOnly = false) => {
      try {
        const response = await fetchSignalAlerts();
        if (cancelled) return;

        if (!initializedSignalAlerts.current || seedOnly) {
          seenSignalAlertIds.current = new Set(response.items.map(alert => alert.id));
          initializedSignalAlerts.current = true;
          return;
        }

        for (const alert of response.items) {
          if (seenSignalAlertIds.current.has(alert.id)) continue;
          seenSignalAlertIds.current.add(alert.id);

          addAlertHistory({
            id: `signal-history-${alert.id}`,
            type: 'market_signal',
            priority: alert.minUsdThreshold >= 500_000 ? 'high' : 'medium',
            symbol: 'MARKET',
            exchange: 'binance',
            title: alert.title,
            message: alert.body,
            data: {
              signalId: alert.signalId,
              minUsdThreshold: alert.minUsdThreshold,
            },
            read: false,
            createdAt: alert.timestamp,
          });

          addTriggeredAlert({
            id: `signal-toast-${alert.id}`,
            alertId: alert.signalId,
            symbol: 'MARKET',
            alert: {
              type: 'market_signal',
              condition: alert.title,
              value: alert.minUsdThreshold,
            },
            currentPrice: 0,
            triggeredAt: alert.timestamp,
          });
        }
      } catch {
        // Keep the background bridge silent; screener view has its own visible health/errors.
      }
    };

    void loadAlerts(true);
    const interval = window.setInterval(() => {
      void loadAlerts(false);
    }, 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [alertConfig.marketSignalsEnabled, addAlertHistory, addTriggeredAlert]);

  return null;
}
