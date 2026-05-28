'use client';

import { useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { Header } from '@/components/terminal/header';
import { TerminalView } from '@/components/terminal/terminal-view';
import { CoinList, CoinListToggle } from '@/components/coin-list/coin-list';
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
    const socket = io('/market', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    socket.on('connect', () => {
      console.log('[WS] Connected');
      setConnected(true);
      setReconnecting(false);
      setError(null);
      setWsReady(true);
      socket.emit('get_tickers', {});
    });

    socket.on('tickers', (tickers) => {
      setTickers(tickers);
    });

    socket.on('alert', (alert) => {
      addTriggeredAlert(alert);
    });

    socket.on('disconnect', (reason) => {
      console.log('[WS] Disconnected:', reason);
      setConnected(false);
      setWsReady(false);
    });

    socket.on('reconnect_attempt', (attempt) => {
      console.log(`[WS] Reconnecting (attempt ${attempt}/10)`);
      setReconnecting(true);
    });

    socket.on('reconnect', () => {
      setConnected(true);
      setReconnecting(false);
      socket.emit('get_tickers', {});
    });

    socket.on('connect_error', (error) => {
      console.error('[WS] Error:', error);
      setError('WebSocket connection error');
    });

    return () => {
      socket.disconnect();
    };
  }, [setTickers, setConnected, setReconnecting, setError, addTriggeredAlert]);

  // ─── Pattern Scanning ────────────────────────────────────
  const scanPatterns = useCallback(async () => {
    setPatternsLoading(true);
    try {
      const resp = await fetch('/api/patterns/scan', {
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
        return (
          <div className="flex h-full overflow-hidden">
            <CoinList />
            <CoinListToggle />
            <div className="flex-1 min-w-0 h-full overflow-hidden">
              <ChartGrid />
            </div>
          </div>
        );
      case 'screener':
        return <ScreenerView />;
      case 'grid':
        return <ChartGrid />;
      case 'settings':
        return <SettingsView />;
      default:
        return (
          <div className="flex h-full overflow-hidden">
            <CoinList />
            <CoinListToggle />
            <div className="flex-1 min-w-0 h-full overflow-hidden">
              <ChartGrid />
            </div>
          </div>
        );
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
