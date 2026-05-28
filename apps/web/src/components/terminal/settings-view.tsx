'use client';

import { useUIStore, useAlertStore, useMarketStore } from '@/stores';
import type { ExchangeId, Timeframe } from '@crypto-screener/shared';
import { useState } from 'react';
import {
  Settings2,
  Save,
  Bell,
  Palette,
  Zap,
  Globe,
} from 'lucide-react';

const EXCHANGES: ExchangeId[] = ['binance', 'bybit', 'okx', 'bitget', 'mexc'];
const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

// ─── Premium Toggle Component ────────────────────────────────

function Toggle({ label, description, enabled, onChange }: {
  label: string; description?: string; enabled: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <div className="text-sm font-medium text-text-primary">{label}</div>
        {description && <div className="text-xs text-text-muted mt-0.5">{description}</div>}
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className={`toggle-premium ${enabled ? 'active' : ''}`}
      />
    </div>
  );
}

// ─── Settings View ───────────────────────────────────────────

export function SettingsView() {
  const { settingsOpen, toggleSettings } = useUIStore();
  const { config: alertConfig, updateConfig: updateAlertConfig } = useAlertStore();
  const { selectedExchange, setSelectedExchange } = useMarketStore();
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="h-full flex flex-col p-3 gap-3">
      {/* Header */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center">
          <Settings2 className="w-5 h-5 text-accent-light" />
        </div>
        <div>
          <h1 className="text-lg font-bold gradient-text">Settings</h1>
          <p className="text-xs text-text-muted">Configure your terminal experience</p>
        </div>
        <div className="flex-1" />
        <button onClick={handleSave} className="glow-btn flex items-center gap-2 !text-xs">
          <Save className="w-3.5 h-3.5" />
          {saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>

      {/* Settings grid */}
      <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-2 gap-3 min-h-0">

        {/* Exchange & Data */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="w-4 h-4 text-accent-light" />
            <h3 className="text-sm font-bold text-text-primary">Exchange & Data</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-2 block">Default Exchange</label>
              <select
                value={selectedExchange}
                onChange={(e) => setSelectedExchange(e.target.value as ExchangeId)}
                className="select-premium w-full !rounded-xl"
              >
                {EXCHANGES.map((ex) => (
                  <option key={ex} value={ex} className="bg-bg-secondary">{ex.toUpperCase()}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-2 block">Default Timeframe</label>
              <div className="flex flex-wrap gap-2">
                {TIMEFRAMES.map((tf) => (
                  <button
                    key={tf}
                    className={`px-4 py-2 text-xs rounded-xl transition-all duration-200 cursor-pointer font-medium
                      ${alertConfig.timeframes.includes(tf)
                        ? 'bg-accent/15 text-accent-light border border-accent/20'
                        : 'bg-bg-primary/40 text-text-muted border border-border hover:bg-surface-hover'
                      }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Alert Settings */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Bell className="w-4 h-4 text-accent-light" />
            <h3 className="text-sm font-bold text-text-primary">Alert Settings</h3>
          </div>

          <div className="space-y-1 divide-y divide-border">
            <Toggle
              label="Sound Alerts"
              description="Play sound when alerts trigger"
              enabled={alertConfig.soundEnabled}
              onChange={(v) => updateAlertConfig({ soundEnabled: v })}
            />
            <Toggle
              label="Browser Notifications"
              description="Show desktop notifications"
              enabled={alertConfig.browserNotifications}
              onChange={(v) => updateAlertConfig({ browserNotifications: v })}
            />
            <Toggle
              label="Visual Flash"
              description="Flash screen on alert"
              enabled={alertConfig.visualFlash}
              onChange={(v) => updateAlertConfig({ visualFlash: v })}
            />
            <Toggle
              label="Auto Dismiss"
              description={`Auto dismiss after ${alertConfig.autoDismissSeconds}s`}
              enabled={alertConfig.autoDismiss}
              onChange={(v) => updateAlertConfig({ autoDismiss: v })}
            />
          </div>
        </div>

        {/* Display */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Palette className="w-4 h-4 text-accent-light" />
            <h3 className="text-sm font-bold text-text-primary">Display</h3>
          </div>

          <div className="space-y-1 divide-y divide-border">
            <Toggle
              label="Coin List Sidebar"
              description="Show market list on the left"
              enabled={settingsOpen}
              onChange={toggleSettings}
            />
            <Toggle
              label="Compact Mode"
              description="Reduce spacing for more data"
              enabled={false}
              onChange={() => {}}
            />
            <Toggle
              label="Show Volume Bars"
              description="Display volume in charts"
              enabled={true}
              onChange={() => {}}
            />
          </div>
        </div>

        {/* Performance */}
        <div className="glass-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-4 h-4 text-accent-light" />
            <h3 className="text-sm font-bold text-text-primary">Performance</h3>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-2 block">Max Tickers</label>
              <select className="select-premium w-full !rounded-xl">
                <option value="50" className="bg-bg-secondary">50 pairs</option>
                <option value="100" className="bg-bg-secondary">100 pairs</option>
                <option value="200" className="bg-bg-secondary" selected>200 pairs</option>
              </select>
            </div>
            <Toggle
              label="WebSocket Compression"
              description="Reduce bandwidth usage"
              enabled={true}
              onChange={() => {}}
            />
            <Toggle
              label="Background Updates"
              description="Keep data fresh when tab is hidden"
              enabled={true}
              onChange={() => {}}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
