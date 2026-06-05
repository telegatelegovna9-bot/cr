'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/terminal/header';
import { TerminalView } from '@/components/terminal/terminal-view';
import { CoinList, CoinListToggle } from '@/components/coin-list/coin-list';
import { ChartGrid } from '@/components/charts/chart-grid';
import { PersonalGridView } from '@/components/grid/personal-grid-view';
import { ScreenerView } from '@/components/screener/screener-view';
import { HeatmapView } from '@/components/terminal/heatmap-view';
import { SettingsView } from '@/components/terminal/settings-view';
import { PatternsView } from '@/components/patterns/patterns-view';
import { AlertToast, AlertModal } from '@/components/alerts/alert-toast';
import { useUIStore, useMarketStore } from '@/stores';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useSignalMonitor } from '@/hooks/useSignalMonitor';
import { marketApi } from '@/lib/api';

export default function TerminalPage() {
  const { viewMode } = useUIStore();
  const { setTickers, setConnectedExchanges } = useMarketStore();
  const { subscribe } = useWebSocket(); // This hook now uses relative URLs
  const [loading, setLoading] = useState(true);

  useSignalMonitor();

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
          {viewMode === 'patterns' && <PatternsView />}
          {viewMode === 'grid' && <PersonalGridView />}
          {viewMode === 'heatmap' && <HeatmapView />}
          {viewMode === 'settings' && <SettingsView />}
        </TerminalView>
      </div>

      <AlertToast />
      <AlertModal />
    </div>
  );
}
