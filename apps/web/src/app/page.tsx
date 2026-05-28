'use client';

import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { Header } from '@/components/terminal/header';
import { TerminalView } from '@/components/terminal/terminal-view';
import { CoinList, CoinListToggle } from '@/components/coin-list/coin-list';
import { ChartGrid } from '@/components/charts/chart-grid';
import { ScreenerView } from '@/components/screener/screener-view';
import { SettingsView } from '@/components/terminal/settings-view';
import { AlertToast, AlertModal } from '@/components/alerts/alert-toast';
import { useUIStore, useMarketStore, useWSStore, useAlertStore } from '@/stores';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL
  || (typeof window !== 'undefined' && window.location.port === '3000' ? 'http://localhost:3001' : '');
const API_BASE = process.env.NEXT_PUBLIC_API_URL
  || (typeof window !== 'undefined' && window.location.port === '3000' ? 'http://localhost:3001' : '');

export default function TerminalPage() {
  const { viewMode } = useUIStore();
  const { setTickers, updateTicker, setConnectedExchanges } = useMarketStore();
  const { setConnected, setReconnecting, setError } = useWSStore();
  const { addTriggeredAlert, config: alertConfig } = useAlertStore();
  const [wsReady, setWsReady] = useState(false);

  // ─── WebSocket Connection ────────────────────────────────
  useEffect(() => {
    const socket = io(`${WS_URL}/market`, {
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
      socket.emit('subscribe', { channel: 'ticker' });
    });

    socket.on('tickers', (tickers) => {
      setTickers(tickers);
    });

    socket.on('ticker', (ticker) => {
      updateTicker(ticker);
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
      socket.emit('subscribe', { channel: 'ticker' });
    });

    socket.on('connect_error', (error) => {
      console.error('[WS] Error:', error);
      setError('WebSocket connection error');
    });

    return () => {
      socket.disconnect();
    };
  }, [setTickers, updateTicker, setConnected, setReconnecting, setError, addTriggeredAlert]);

  useEffect(() => {
    let cancelled = false;

    const refreshExchanges = async () => {
      try {
        const resp = await fetch(`${API_BASE}/api/market/exchanges`);
        if (!resp.ok || cancelled) return;
        const data = await resp.json();
        setConnectedExchanges(data.data?.connected ?? []);
      } catch {
        if (!cancelled) setConnectedExchanges([]);
      }
    };

    refreshExchanges();
    const interval = setInterval(refreshExchanges, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [setConnectedExchanges]);

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
