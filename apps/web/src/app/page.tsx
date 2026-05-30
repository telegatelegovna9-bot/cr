'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/terminal/header';
import { TerminalView } from '@/components/terminal/terminal-view';
import { CoinList, CoinListToggle } from '@/components/coin-list/coin-list';
import { ChartGrid } from '@/components/charts/chart-grid';
import { ScreenerView } from '@/components/screener/screener-view';
import { SettingsView } from '@/components/terminal/settings-view';
import { AlertToast } from '@/components/alerts/alert-toast';
import { useUIStore, useMarketStore } from '@/stores';
import { useWebSocket } from '@/hooks/useWebSocket';
import { marketApi } from '@/lib/api';

export default function TerminalPage() {
  const { viewMode } = useUIStore();
  const { setTickers, setConnectedExchanges } = useMarketStore();
  const { subscribe } = useWebSocket(); // This hook now uses relative URLs
  const [loading, setLoading] = useState(true);

  // ─── Initial Data Load ───────────────────────────────────
  useEffect(() => {
    async function loadInitial() {
      try {
        console.log('[Terminal] Loading initial data...');
        const [tickersRes, exchangesRes] = await Promise.all([
          marketApi.getTickers(),
          marketApi.getExchanges()
        ]);
        
        if (tickersRes.success) {
          const futures = tickersRes.data.filter((t: any) => t.marketType === 'futures');
          const spot = tickersRes.data.filter((t: any) => t.marketType === 'spot');
          console.log(`[Terminal] Loaded ${tickersRes.data.length} tickers: ${spot.length} spot, ${futures.length} futures`);
          if (futures.length > 0) console.log('[Terminal] Sample futures:', futures.slice(0, 3).map((t: any) => `${t.exchange}:${t.symbol}`));
          setTickers(tickersRes.data as any);
        }
        if (exchangesRes.success) {
          setConnectedExchanges(exchangesRes.data.connected as any);
        }
      } catch (err) {
        console.error('[Terminal] Failed to load initial data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadInitial();
  }, [setTickers, setConnectedExchanges]);

  return (
    <div className="flex flex-col h-screen bg-bg-primary text-text-primary overflow-hidden font-sans selection:bg-accent/30">
      <Header />
      
      <div className="flex-1 flex overflow-hidden relative pt-20">
        <CoinListToggle />
        <CoinList />
        
        <TerminalView>
          {viewMode === 'terminal' && <ChartGrid />}
          {viewMode === 'screener' && <ScreenerView />}
          {viewMode === 'settings' && <SettingsView />}
        </TerminalView>
      </div>

      <AlertToast />
    </div>
  );
}
