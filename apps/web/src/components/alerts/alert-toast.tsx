'use client';

import { useAlertStore, useUIStore } from '@/stores';
import type { Alert } from '@crypto-screener/shared';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Clock,
  Bell,
  BellOff,
  Trash2,
  Check,
} from 'lucide-react';
import { useEffect, useCallback } from 'react';

// ─── Helpers ─────────────────────────────────────────────────

function formatPrice(price: number): string {
  if (price >= 10000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 100) return price.toFixed(2);
  if (price >= 1) return price.toFixed(3);
  return price.toFixed(4);
}

function getAlertColor(type: string) {
  if (type === 'price_above' || type === 'change_up') return { bg: 'bg-positive/10', border: 'border-positive/20', text: 'text-positive', icon: '↗' };
  if (type === 'price_below' || type === 'change_down') return { bg: 'bg-negative/10', border: 'border-negative/20', text: 'text-negative', icon: '↘' };
  return { bg: 'bg-accent/10', border: 'border-accent/20', text: 'text-accent-light', icon: '⚡' };
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// ─── Alert Toast ─────────────────────────────────────────────

export function AlertToast() {
  const { activeAlerts, dismissAlert, config } = useAlertStore();
  const { alertsOpen } = useUIStore();

  // Auto-dismiss
  useEffect(() => {
    if (!config.autoDismiss) return;
    const timers: NodeJS.Timeout[] = [];
    activeAlerts.forEach((alert) => {
      const timer = setTimeout(() => {
        dismissAlert(alert.id);
      }, config.autoDismissSeconds * 1000);
      timers.push(timer);
    });
    return () => timers.forEach(clearTimeout);
  }, [activeAlerts, config.autoDismiss, config.autoDismissSeconds, dismissAlert]);

  // Sound & browser notification
  useEffect(() => {
    activeAlerts.forEach((alert) => {
      // Sound
      if (config.soundEnabled) {
        try {
          const ctx = new AudioContext();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = alert.alert.condition === 'above' ? 880 : 440;
          gain.gain.value = 0.1;
          osc.start();
          osc.stop(ctx.currentTime + 0.15);
        } catch (e) { /* ignore */ }
      }

      // Browser notification
      if (config.browserNotifications && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(`🚨 ${alert.symbol} Alert`, {
          body: `Price: $${formatPrice(alert.currentPrice)} (${alert.alert.condition} $${formatPrice(alert.alert.value)})`,
          icon: '/favicon.ico',
        });
      }
    });
  }, [activeAlerts, config.soundEnabled, config.browserNotifications]);

  if (alertsOpen) return null; // Don't show toasts when alert panel is open

  return (
    <div className="fixed top-20 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {activeAlerts.slice(0, 5).map((alert, index) => {
          const colors = getAlertColor(alert.alert.type);
          return (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, x: 100, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 100, scale: 0.95 }}
              transition={{ delay: index * 0.05, type: 'spring', damping: 20 }}
              className={`glass-card ${colors.bg} border ${colors.border} p-4 w-80 pointer-events-auto shadow-glass-lg`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{colors.icon}</span>
                  <span className="text-sm font-bold text-text-primary">{alert.symbol}</span>
                  <span className={`text-xs font-medium ${colors.text}`}>
                    {alert.alert.type.replace(/_/g, ' ')}
                  </span>
                </div>
                <button
                  onClick={() => dismissAlert(alert.id)}
                  className="p-1 rounded-lg hover:bg-surface-hover transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5 text-text-muted" />
                </button>
              </div>

              <div className="flex items-center gap-4 text-xs">
                <div>
                  <span className="text-text-muted">Current: </span>
                  <span className="font-bold font-mono text-text-primary">${formatPrice(alert.currentPrice)}</span>
                </div>
                <div>
                  <span className="text-text-muted">Target: </span>
                  <span className="font-bold font-mono text-text-primary">${formatPrice(alert.alert.value)}</span>
                </div>
              </div>

              <div className="flex items-center justify-between mt-3">
                <span className="text-[10px] text-text-muted flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {timeAgo(alert.triggeredAt)}
                </span>
                <button
                  onClick={() => dismissAlert(alert.id)}
                  className="text-[10px] text-text-muted hover:text-text-secondary cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

// ─── Alert Modal (Alert List) ────────────────────────────────

export function AlertModal() {
  const { alertsOpen, toggleAlerts } = useUIStore();
  const { alerts, removeAlert, toggleAlert, triggeredAlerts, clearTriggered } = useAlertStore();

  if (!alertsOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={toggleAlerts}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="glass-card relative z-10 w-full max-w-2xl max-h-[80vh] flex flex-col shadow-glass-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center">
              <Bell className="w-5 h-5 text-accent-light" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-text-primary">Alerts</h2>
              <p className="text-xs text-text-muted">{alerts.length} configured · {triggeredAlerts.length} triggered</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {triggeredAlerts.length > 0 && (
              <button onClick={clearTriggered} className="ghost-btn !py-1.5 !px-3 !text-[10px] flex items-center gap-1.5">
                <Check className="w-3 h-3" />
                Clear All
              </button>
            )}
            <button onClick={toggleAlerts} className="p-2 rounded-xl hover:bg-surface-hover transition-colors cursor-pointer">
              <X className="w-5 h-5 text-text-muted" />
            </button>
          </div>
        </div>

        {/* Alert list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-text-muted">
              <BellOff className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">No alerts configured</p>
              <p className="text-xs mt-1">Create alerts from the coin detail view</p>
            </div>
          ) : (
            alerts.map((alert) => {
              const colors = getAlertColor(alert.type);
              const isTriggered = triggeredAlerts.some((t) => t.alertId === alert.id);
              return (
                <div
                  key={alert.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all duration-200
                    ${isTriggered ? `${colors.bg} ${colors.border}` : 'bg-bg-primary/30 border-border hover:border-border-light'}`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${colors.bg}`}>
                    {colors.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-text-primary">{alert.symbol}</span>
                      <span className={`text-xs ${colors.text}`}>{alert.condition} ${formatPrice(alert.value)}</span>
                    </div>
                    <div className="text-[10px] text-text-muted mt-0.5">
                      {alert.type.replace(/_/g, ' ')} · Created {timeAgo(alert.createdAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => toggleAlert(alert.id)}
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer
                        ${alert.enabled ? 'text-accent-light hover:bg-accent/10' : 'text-text-muted hover:bg-surface-hover'}`}
                    >
                      {alert.enabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => removeAlert(alert.id)}
                      className="p-1.5 rounded-lg text-text-muted hover:text-negative hover:bg-negative/10 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
