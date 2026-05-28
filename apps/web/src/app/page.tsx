'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/terminal/header';
import { TerminalView } from '@/components/terminal/terminal-view';
import { CoinList, CoinListToggle } from '@/components/coin-list/coin-list';
import { ChartGrid } from '@/components/charts/chart-grid';
import { ScreenerView } from '@/components/screener/screener-view';
import { SettingsView } from '@/components/terminal/settings-view';
import { AlertToast, AlertModal } from '@/components/alerts/alert-toast';
import { useUIStore, useMarketStore, useWSStore, useAlertStore } from '@/stores';
import { getMarketSocket, subscribeMarket, unsubscribeMarket } from '@/lib/market-socket';

export default function TerminalPage() {
  const { viewMode } = useUIStore();
  const { setTickers, updateTicker } = useMarketStore();
  const { setConnected, setReconnecting, setError } = useWSStore();
  const { addTriggeredAlert, config: alertConfig } = useAlertStore();
  const [wsReady, setWsReady] = useState(false);

  // ─── WebSocket Connection ────────────────────────────────
  useEffect(() => {
    const socket = getMarketSocket();

    const handleConnect = () => {
      console.log('[WS] Connected');
      setConnected(true);
      setReconnecting(false);
      setError(null);
      setWsReady(true);
      socket.emit('get_tickers', {});
    };

    const handleTickers = (tickers: any[]) => {
      setTickers(tickers);
    };

    const handleTicker = (ticker: any) => {
      updateTicker(ticker);
    };

    const handleAlert = (alert: any) => {
      addTriggeredAlert(alert);
    };

    const handleDisconnect = (reason: string) => {
      console.log('[WS] Disconnected:', reason);
      setConnected(false);
      setWsReady(false);
    };

    const handleReconnectAttempt = (attempt: number) => {
      console.log(`[WS] Reconnecting (attempt ${attempt}/10)`);
      setReconnecting(true);
    };

    const handleReconnect = () => {
      setConnected(true);
      setReconnecting(false);
      socket.emit('get_tickers', {});
    };

    const handleConnectError = (error: Error) => {
      console.error('[WS] Error:', error);
      setError('WebSocket connection error');
    };

    socket.on('connect', handleConnect);
    socket.on('tickers', handleTickers);
    socket.on('ticker', handleTicker);
    socket.on('alert', handleAlert);
    socket.on('disconnect', handleDisconnect);
    socket.on('reconnect_attempt', handleReconnectAttempt);
    socket.on('reconnect', handleReconnect);
    socket.on('connect_error', handleConnectError);
    subscribeMarket({ channel: 'ticker' });
    if (socket.connected) handleConnect();

    return () => {
      socket.off('connect', handleConnect);
      socket.off('tickers', handleTickers);
      socket.off('ticker', handleTicker);
      socket.off('alert', handleAlert);
      socket.off('disconnect', handleDisconnect);
      socket.off('reconnect_attempt', handleReconnectAttempt);
      socket.off('reconnect', handleReconnect);
      socket.off('connect_error', handleConnectError);
      unsubscribeMarket({ channel: 'ticker' });
    };
  }, [setTickers, updateTicker, setConnected, setReconnecting, setError, addTriggeredAlert]);

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
