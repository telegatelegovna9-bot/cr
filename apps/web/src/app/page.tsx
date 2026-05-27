'use client';

import { useEffect, useState, useCallback } from 'react';
import { Header } from '@/components/terminal/header';
import { TerminalView } from '@/components/terminal/terminal-view';
import { CoinList } from '@/components/coin-list/coin-list';
import { ChartGrid } from '@/components/charts/chart-grid';
import { ScreenerView } from '@/components/screener/screener-view';
import { SettingsView } from '@/components/terminal/settings-view';
import { AlertToast, AlertModal } from '@/components/alerts/alert-toast';
import { useUIStore, useMarketStore, useWSStore, useAlertStore } from '@/stores';
import type { PatternScanResult } from '@crypto-screener/shared';

export default function TerminalPage() {
  const { viewMode } = useUIStore();
  const { setTickers } = useMarketStore();
  const { setConnected, setReconnecting, setError } = useWSStore();
  const { addTriggeredAlert, config: alertConfig } = useAlertStore();
  const [patterns, setPatterns] = useState<PatternScanResult[]>([]);
  const [patternsLoading, setPatternsLoading] = useState(false);
  const [wsReady, setWsReady] = useState(false);

  // ─── WebSocket Connection ────────────────────────────────
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 10;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[WS] Connected');
        setConnected(true);
        setReconnecting(false);
        setError(null);
        reconnectAttempts = 0;
        setWsReady(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'tickers') {
            setTickers(data.data);
          } else if (data.type === 'alert') {
            addTriggeredAlert(data.data);
          }
        } catch (e) {
          console.error('[WS] Parse error:', e);
        }
      };

      ws.onclose = (event) => {
        console.log('[WS] Disconnected:', event.code, event.reason);
        setConnected(false);
        setWsReady(false);

        if (reconnectAttempts < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
          console.log(`[WS] Reconnecting in ${delay}ms (attempt ${reconnectAttempts + 1}/${maxReconnectAttempts})`);
          setReconnecting(true);
          reconnectTimeout = setTimeout(connect, delay);
          reconnectAttempts++;
        } else {
          console.error('[WS] Max reconnect attempts reached');
          setError('Connection lost. Please refresh the page.');
        }
      };

      ws.onerror = (error) => {
        console.error('[WS] Error:', error);
        setError('WebSocket connection error');
      };
    };

    connect();

    return () => {
      if (ws) ws.close();
      clearTimeout(reconnectTimeout);
    };
  }, [setTickers, setConnected, setReconnecting, setError, addTriggeredAlert]);

  // ─── Pattern Scanning ────────────────────────────────────
  const scanPatterns = useCallback(async () => {
    setPatternsLoading(true);
    try {
      const resp = await fetch('/api/v1/patterns/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exchange: 'binance',
          timeframes: alertConfig.timeframes,
          minStrength: 3,
          limit: 50,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setPatterns(data.patterns || []);
      }
    } catch (e) {
      console.error('[Patterns] Scan failed:', e);
    } finally {
      setPatternsLoading(false);
    }
  }, [alertConfig.timeframes]);

  // Initial pattern scan
  useEffect(() => {
    if (wsReady) {
      scanPatterns();
      const interval = setInterval(scanPatterns, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [wsReady, scanPatterns]);

  // ─── Request Notification Permission ─────────────────────
  useEffect(() => {
    if (alertConfig.browserNotifications && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [alertConfig.browserNotifications]);

  // ─── View Renderer ───────────────────────────────────────
  const renderView = () => {
    switch (viewMode) {
      case 'terminal':
        return <CoinList />;
      case 'screener':
        return <ScreenerView />;
      case 'grid':
        return <ChartGrid />;
      case 'settings':
        return <SettingsView />;
      default:
        return <CoinList />;
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden noise-overlay">
      <Header />

      {/* Main content area */}
      <div className="flex-1 flex pt-[68px] min-h-0 relative">
        <TerminalView>
          {renderView()}
        </TerminalView>
      </div>

      {/* Alert Toast Overlay */}
      <AlertToast />

      {/* Alert Modal */}
      <AlertModal />
    </div>
  );
}
