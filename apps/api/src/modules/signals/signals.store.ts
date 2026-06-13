import { Injectable } from '@nestjs/common';
import type {
  SignalAlert,
  SignalEvent,
  SignalExchange,
  SignalHealth,
  SignalSummary,
} from './signals.types';

@Injectable()
export class SignalsStore {
  private readonly signalRetentionMs = 60 * 60 * 1000;
  private readonly alertRetentionMs = 24 * 60 * 60 * 1000;
  private readonly maxSignals = 250;
  private readonly maxAlerts = 1000;
  private readonly maxSignalsPerAsset = 2;
  private readonly signals = new Map<string, SignalEvent>();
  private readonly alerts = new Map<string, SignalAlert>();
  private readonly exchangeStats = new Map<SignalExchange, { events: number; lastSeenAt: number | null }>();
  private lastIngestedAt: number | null = null;
  private lastSignalAt: number | null = null;
  private totalEventsIngested = 0;

  upsertSignal(event: SignalEvent) {
    this.signals.set(event.id, event);
    this.lastSignalAt = Math.max(this.lastSignalAt ?? 0, event.timestamp);
  }

  appendAlert(alert: SignalAlert) {
    this.alerts.set(alert.id, alert);
  }

  noteIngest(exchange: SignalExchange, timestamp: number) {
    const current = this.exchangeStats.get(exchange) ?? { events: 0, lastSeenAt: null };
    this.exchangeStats.set(exchange, {
      events: current.events + 1,
      lastSeenAt: Math.max(current.lastSeenAt ?? 0, timestamp),
    });
    this.lastIngestedAt = Math.max(this.lastIngestedAt ?? 0, timestamp);
    this.totalEventsIngested += 1;
  }

  prune(now = Date.now()) {
    const signalCutoff = now - this.signalRetentionMs;
    const alertCutoff = now - this.alertRetentionMs;
    for (const [id, signal] of this.signals) {
      if (signal.timestamp < signalCutoff) {
        this.signals.delete(id);
      }
    }

    for (const [id, alert] of this.alerts) {
      if (alert.timestamp < alertCutoff) {
        this.alerts.delete(id);
      }
    }
  }

  listSignals(): SignalEvent[] {
    const sorted = Array.from(this.signals.values())
      .sort((a, b) => b.priorityScore - a.priorityScore || b.timestamp - a.timestamp);

    const assetCounts = new Map<string, number>();
    const feed: SignalEvent[] = [];

    for (const signal of sorted) {
      const count = assetCounts.get(signal.baseAsset) ?? 0;
      if (count >= this.maxSignalsPerAsset) {
        continue;
      }

      assetCounts.set(signal.baseAsset, count + 1);
      feed.push(signal);

      if (feed.length >= this.maxSignals) {
        break;
      }
    }

    return feed.sort((a, b) => b.timestamp - a.timestamp || b.priorityScore - a.priorityScore);
  }

  listAlerts(): SignalAlert[] {
    return Array.from(this.alerts.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, this.maxAlerts);
  }

  getSummary(): SignalSummary {
    const items = Array.from(this.signals.values());
    return {
      totalSignals: items.length,
      totalUsd: items.reduce((sum, item) => sum + item.usdValue, 0),
      buyUsd: items.filter(item => item.side === 'buy').reduce((sum, item) => sum + item.usdValue, 0),
      sellUsd: items.filter(item => item.side === 'sell').reduce((sum, item) => sum + item.usdValue, 0),
      blockTrades: items.filter(item => item.eventType === 'block_trade').length,
      crossExchangeSignals: items.filter(item => item.eventType === 'cross_exchange_activity').length,
      anomalies: items.filter(item => item.eventType === 'anomalous_activity').length,
    };
  }

  getHealth(): SignalHealth {
    const byExchange: SignalHealth['byExchange'] = {};
    for (const [exchange, stats] of this.exchangeStats.entries()) {
      byExchange[exchange] = stats;
    }

    return {
      lastIngestedAt: this.lastIngestedAt,
      lastSignalAt: this.lastSignalAt,
      totalEventsIngested: this.totalEventsIngested,
      totalSignalsStored: this.signals.size,
      totalAlertsStored: this.alerts.size,
      supportedExchanges: ['hyperliquid', 'binance', 'bybit', 'okx', 'coinbase'],
      byExchange,
    };
  }
}
