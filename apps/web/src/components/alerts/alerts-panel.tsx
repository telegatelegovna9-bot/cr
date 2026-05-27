// Alerts Panel component - shows alert history

'use client';

import { useState } from 'react';
import { useRecentAlerts } from '@/hooks/useData';
import { alertsApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { getTimeAgo, formatDateTime } from '@/lib/format';
import type { AlertType } from '@crypto-screener/shared';

const ALERT_ICONS: Record<string, string> = {
  listing: '🆕',
  volume_spike: '📊',
  volatility_spike: '⚡',
  breakout: '🚀',
  liquidity_appear: '💧',
  funding_anomaly: '💰',
  oi_spike: '📈',
  price_cross: '🎯',
  pump: '🟢',
  dump: '🔴',
  pattern_detected: '📐',
};

const ALERT_TYPES: { id: AlertType | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'listing', label: 'Listings' },
  { id: 'volume_spike', label: 'Volume' },
  { id: 'volatility_spike', label: 'Volatility' },
  { id: 'breakout', label: 'Breakouts' },
  { id: 'pump', label: 'Pumps' },
  { id: 'dump', label: 'Dumps' },
  { id: 'pattern_detected', label: 'Patterns' },
];

export function AlertsPanel() {
  const [typeFilter, setTypeFilter] = useState<AlertType | 'all'>('all');
  const { data: alerts, refetch } = useRecentAlerts(100);

  const filteredAlerts = typeFilter === 'all'
    ? alerts
    : (alerts as any[])?.filter((a: any) => a.type === typeFilter);

  const handleMarkAllRead = async () => {
    await alertsApi.markAllAsRead();
    refetch();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-terminal-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">🔔 Alerts</h2>
          <button
            onClick={handleMarkAllRead}
            className="text-xs text-terminal-accent hover:underline"
          >
            Mark all read
          </button>
        </div>

        {/* Type filter */}
        <div className="flex flex-wrap gap-1">
          {ALERT_TYPES.map(type => (
            <button
              key={type.id}
              onClick={() => setTypeFilter(type.id)}
              className={cn(
                'px-2 py-1 text-xs rounded transition-colors',
                typeFilter === type.id
                  ? 'bg-terminal-accent text-white'
                  : 'bg-terminal-card text-terminal-muted hover:text-terminal-text'
              )}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {/* Alert list */}
      <div className="flex-1 overflow-y-auto">
        {(filteredAlerts as any[])?.map((alert: any) => (
          <div
            key={alert.id}
            className={cn(
              'p-3 border-b border-terminal-border hover:bg-terminal-hover transition-colors',
              !alert.read && 'bg-terminal-card/50'
            )}
          >
            <div className="flex items-start gap-2">
              <span className="text-lg mt-0.5">{ALERT_ICONS[alert.type] || '🔔'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{alert.title}</span>
                  <span className="text-xs text-terminal-muted">{getTimeAgo(alert.createdAt)}</span>
                </div>
                <p className="text-xs text-terminal-muted mt-1">{alert.message}</p>
                <div className="flex items-center gap-2 mt-2">
                  {alert.symbol && (
                    <span className="px-2 py-0.5 bg-terminal-card rounded text-xs font-mono">
                      {alert.symbol}
                    </span>
                  )}
                  <span className={cn(
                    'px-2 py-0.5 rounded text-xs',
                    alert.priority === 'critical' && 'bg-red-500/20 text-red-400',
                    alert.priority === 'high' && 'bg-orange-500/20 text-orange-400',
                    alert.priority === 'medium' && 'bg-yellow-500/20 text-yellow-400',
                    alert.priority === 'low' && 'bg-blue-500/20 text-blue-400',
                  )}>
                    {alert.priority}
                  </span>
                  <span className="text-xs text-terminal-muted">{alert.exchange}</span>
                </div>
              </div>
            </div>
          </div>
        ))}

        {(!filteredAlerts || filteredAlerts.length === 0) && (
          <div className="p-8 text-center text-terminal-muted">
            <span className="text-4xl mb-4 block">🔔</span>
            <p>No alerts yet</p>
            <p className="text-xs mt-1">Alerts will appear here in real-time</p>
          </div>
        )}
      </div>
    </div>
  );
}
