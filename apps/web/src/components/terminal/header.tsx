'use client';

import { useUIStore, useMarketStore, useWSStore } from '@/stores';
import type { ExchangeId, ViewMode } from '@crypto-screener/shared';
import { motion } from 'framer-motion';
import {
  BarChart3,
  LayoutGrid,
  Flame,
  Bell,
  Settings2,
  Zap,
  Activity,
} from 'lucide-react';

const EXCHANGES: ExchangeId[] = ['binance', 'bybit', 'okx', 'bitget', 'mexc'];
const VIEW_MODES: { id: ViewMode; label: string; icon: typeof BarChart3 }[] = [
  { id: 'terminal', label: 'Terminal', icon: Activity },
  { id: 'screener', label: 'Screener', icon: BarChart3 },
  { id: 'heatmap', label: 'Heatmap', icon: Flame },
  { id: 'grid', label: 'Grid', icon: LayoutGrid },
  { id: 'settings', label: 'Settings', icon: Settings2 },
];

export function Header() {
  const {
    viewMode, setViewMode, showHeatmap, toggleHeatmap, toggleAlerts, unreadAlertCount,
  } = useUIStore();
  const { selectedSymbol, selectedTimeframe, setSelectedTimeframe, selectedExchange, setSelectedExchange } = useMarketStore();
  const { connected, reconnecting } = useWSStore();

  const timeframes = ['1m', '5m', '15m', '1h', '4h', '1d'];

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      className="glass-panel fixed top-3 left-3 right-3 z-50 rounded-2xl shadow-glass-lg"
    >
      <div className="flex items-center h-14 px-5 gap-3">

        {/* Logo */}
        <div className="flex items-center gap-3 mr-2 shrink-0">
          <div className="w-8 h-8 rounded-xl bg-aurora flex items-center justify-center shadow-glow-sm">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-bold gradient-text hidden sm:block tracking-tight">
            CryptoScreener
          </span>
        </div>

        {/* Divider */}
        <div className="w-px h-7 bg-border-light shrink-0" />

        {/* Exchange selector */}
        <div className="relative shrink-0">
          <select
            value={selectedExchange}
            onChange={(e) => setSelectedExchange(e.target.value as ExchangeId)}
            className="select-premium !py-1.5 !px-3 !text-xs uppercase tracking-wider font-semibold"
          >
            {EXCHANGES.map((ex) => (
              <option key={ex} value={ex} className="bg-bg-secondary">{ex}</option>
            ))}
          </select>
        </div>

        {/* Symbol & Timeframe */}
        <div className="flex items-center gap-2 ml-1">
          <span className="text-sm font-bold text-text-primary tracking-wide">
            {selectedSymbol}
          </span>

          {/* Timeframes */}
          <div className="hidden md:flex items-center gap-0.5 ml-2">
            {timeframes.map((tf) => (
              <button
                key={tf}
                onClick={() => setSelectedTimeframe(tf as any)}
                className={`px-2.5 py-1 text-xs rounded-lg transition-all duration-200 cursor-pointer font-medium
                  ${selectedTimeframe === tf
                    ? 'bg-accent/15 text-accent-light border border-accent/20'
                    : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover'
                  }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* View mode tabs */}
        <nav className="hidden lg:flex items-center gap-0.5 bg-bg-primary/40 rounded-xl p-1 border border-border">
          {VIEW_MODES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setViewMode(id)}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-all duration-200 cursor-pointer font-medium
                ${viewMode === id
                  ? 'bg-accent/15 text-accent-light shadow-glow-sm'
                  : 'text-text-muted hover:text-text-secondary'
                }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">{label}</span>
            </button>
          ))}
        </nav>

        {/* Divider */}
        <div className="w-px h-7 bg-border-light" />

        {/* Heatmap toggle */}
        <button
          onClick={toggleHeatmap}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl transition-all duration-200 cursor-pointer
            ${showHeatmap
              ? 'bg-warning/15 text-warning border border-warning/20'
              : 'text-text-muted hover:text-text-secondary hover:bg-surface-hover'
            }`}
        >
          <Flame className="w-3.5 h-3.5" />
          <span className="hidden xl:inline">Heatmap</span>
        </button>

        {/* Alerts */}
        <button
          onClick={toggleAlerts}
          className="relative flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl transition-all duration-200 cursor-pointer text-text-muted hover:text-text-secondary hover:bg-surface-hover"
        >
          <Bell className="w-3.5 h-3.5" />
          {unreadAlertCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-negative text-white text-[10px] font-bold flex items-center justify-center px-1 shadow-glow-negative"
            >
              {unreadAlertCount > 99 ? '99+' : unreadAlertCount}
            </motion.span>
          )}
        </button>

        {/* Connection status */}
        <div className="flex items-center gap-2 shrink-0">
          <div className={`connection-dot ${connected ? 'connected' : 'disconnected'}`} />
          <span className="text-[10px] text-text-muted hidden xl:block uppercase tracking-wider font-medium">
            {connected ? 'Live' : reconnecting ? 'Reconnecting...' : 'Offline'}
          </span>
        </div>
      </div>
    </motion.header>
  );
}
