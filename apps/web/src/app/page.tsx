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
import { isTerminalChartGridActive } from '@/components/charts/chart-activity';

export default function TerminalPage() {
  const viewMode = useUIStore(state => state.viewMode);
  const coinChartModalOpen = useUIStore(state => state.coinChartModalOpen);
  const setTickers = useMarketStore(state => state.setTickers);
  const setConnectedExchanges = useMarketStore(state => state.setConnectedExchanges);
  useWebSocket();
  const [loading, setLoading] = useState(true);
  const isTerminalGridActive = isTerminalChartGridActive({ viewMode, coinChartModalOpen });

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
          <div className="relative h-full w-full">
            <div
              className={`absolute inset-0 ${viewMode === 'terminal' ? 'visible z-10' : 'invisible pointer-events-none z-0'}`}
              aria-hidden={viewMode !== 'terminal'}
            >
              <ChartGrid isViewActive={isTerminalGridActive} />
            </div>

            {viewMode === 'screener' && (
              <div className="absolute inset-0 z-10">
                <ScreenerView />
              </div>
            )}
            {viewMode === 'patterns' && (
              <div className="absolute inset-0 z-10">
                <PatternsView />
              </div>
            )}
            {viewMode === 'grid' && (
              <div className="absolute inset-0 z-10">
                <PersonalGridView />
              </div>
            )}
            {viewMode === 'heatmap' && (
              <div className="absolute inset-0 z-10">
                <HeatmapView />
              </div>
            )}
            {viewMode === 'settings' && (
              <div className="absolute inset-0 z-10">
                <SettingsView />
              </div>
            )}
          </div>
        </TerminalView>
      </div>

      <AlertToast />
      <AlertModal />
    </div>
  );
}
