'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/terminal/header';
import { TerminalView } from '@/components/terminal/terminal-view';
import { CoinList, CoinListToggle } from '@/components/coin-list/coin-list';
import { ChartGrid } from '@/components/charts/chart-grid';
import { ScreenerView } from '@/components/screener/screener-view';
import { SettingsView } from '@/components/terminal/settings-view';
import { AlertToast } from '@/components/alerts/alert-toast';
import { useUIStore, useMarketStore, useWSStore } from '@/stores';
import { useWebSocket } from '@/hooks/useWebSocket';
import { marketApi } from '@/lib/api';

export default function TerminalPage() {
  const { viewMode } = useUIStore();
  const { setTickers, setConnectedExchanges } = useMarketStore();
  const { subscribe } = useWebSocket();
  const [loading, setLoading] = useState(true);

  // ─── Initial Data Load ───────────────────────────────────
  useEffect(() => {
    async function loadInitial() {
      try {
        const [tickersRes, exchangesRes] = await Promise.all([
          marketApi.getTickers(),
          marketApi.getExchanges()
        ]);
        
        if (tickersRes.success) setTickers(tickersRes.data as any);
        if (exchangesRes.success) setConnectedExchanges(exchangesRes.data.connected as any);
      } catch (err) {
        console.error('Failed to load initial data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadInitial();
  }, [setTickers, setConnectedExchanges]);

  // ─── Global Subscriptions ────────────────────────────────
  useEffect(() => {
    // Global ticker stream for the sidebar
    // Note: Our new subscribe takes (exchange, marketType, symbol)
    // To get all tickers, we might need a different approach or just subscribe to active ones
    // For now, let's keep it simple
  }, [subscribe]);

  return (
    <div className="flex flex-col h-screen bg-bg-primary text-text-primary overflow-hidden font-sans selection:bg-accent/30">
      <Header />
      
      <div className="flex-1 flex overflow-hidden relative">
        <CoinListToggle />
        <CoinList />
        
        <main className="flex-1 flex flex-col min-w-0 bg-bg-secondary/30 relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,rgba(99,102,241,0.05),transparent_50%)] pointer-events-none" />
          
          <div className="flex-1 overflow-hidden">
            {viewMode === 'terminal' && <ChartGrid />}
            {viewMode === 'screener' && <ScreenerView />}
            {viewMode === 'settings' && <SettingsView />}
          </div>
        </main>
      </div>

      <AlertToast />
    </div>
  );
}
