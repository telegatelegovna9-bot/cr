import { Injectable } from '@nestjs/common';
import type { NormalizedTradeEvent, SignalEvent } from './signals.types';

@Injectable()
export class SignalsAggregator {
  private readonly minimumUsdValue = 25_000;
  private readonly anomalyMinimumUsdValue = 50_000;
  private readonly clusterWindowMs = 90_000;
  private readonly crossExchangeWindowMs = 120_000;
  private readonly clusterMinimumTrades = 3;
  private readonly clusterMinimumUsdValue = 150_000;
  private readonly recentTrades = new Map<string, NormalizedTradeEvent[]>();

  aggregate(events: NormalizedTradeEvent[]): SignalEvent[] {
    const signals: SignalEvent[] = [];

    for (const event of events) {
      this.rememberTrade(event);

      if (event.usdValue >= this.minimumUsdValue) {
        signals.push(this.toLargeSignal(event));
      }

      const clusterSignal = this.toClusterSignal(event);
      if (clusterSignal) {
        signals.push(clusterSignal);
      }

      const crossExchangeSignal = this.toCrossExchangeSignal(event);
      if (crossExchangeSignal) {
        signals.push(crossExchangeSignal);
      }

      const anomalySignal = this.toAnomalySignal(event);
      if (anomalySignal) {
        signals.push(anomalySignal);
      }
    }

    return this.deduplicateSignals(signals)
      .sort((a, b) => b.timestamp - a.timestamp || b.priorityScore - a.priorityScore);
  }

  private toLargeSignal(event: NormalizedTradeEvent): SignalEvent {
    const isBuy = event.side === 'buy';
    return {
      id: `signal-${event.id}`,
      timestamp: event.timestamp,
      exchange: event.exchange,
      symbol: event.symbol,
      baseAsset: event.baseAsset,
      quoteAsset: event.quoteAsset,
      side: event.side,
      eventType: event.isBlockTrade ? 'block_trade' : isBuy ? 'large_buy' : 'large_sell',
      usdValue: event.usdValue,
      tradeCount: 1,
      price: event.price,
      confidenceScore: event.isBlockTrade ? 0.9 : 0.6,
      priorityScore: Math.min(1, event.usdValue / 250_000),
      isBlockTrade: event.isBlockTrade,
      exchangesInvolved: [event.exchange],
      summary: `${isBuy ? 'Large buy' : 'Large sell'} on ${event.exchange}`,
      details: `${event.baseAsset} ${event.side} worth $${event.usdValue.toFixed(0)}`,
    };
  }

  private rememberTrade(event: NormalizedTradeEvent): void {
    const key = `${event.baseAsset}:${event.side}`;
    const existing = this.recentTrades.get(key) ?? [];
    const cutoff = event.timestamp - Math.max(this.clusterWindowMs, this.crossExchangeWindowMs);
    const next = [...existing.filter(item => item.timestamp >= cutoff), event];
    this.recentTrades.set(key, next);
  }

  private toClusterSignal(event: NormalizedTradeEvent): SignalEvent | null {
    const key = `${event.baseAsset}:${event.side}`;
    const recent = (this.recentTrades.get(key) ?? [])
      .filter(item => event.timestamp - item.timestamp <= this.clusterWindowMs);

    const usdValue = recent.reduce((sum, item) => sum + item.usdValue, 0);
    if (recent.length < this.clusterMinimumTrades || usdValue < this.clusterMinimumUsdValue) {
      return null;
    }

    const exchanges = Array.from(new Set(recent.map(item => item.exchange)));
    const eventType = event.side === 'buy' ? 'buy_cluster' : 'sell_cluster';
    return {
      id: `cluster-${key}-${Math.floor(event.timestamp / this.clusterWindowMs)}`,
      timestamp: event.timestamp,
      exchange: event.exchange,
      symbol: event.symbol,
      baseAsset: event.baseAsset,
      quoteAsset: event.quoteAsset,
      side: event.side,
      eventType,
      usdValue,
      tradeCount: recent.length,
      price: event.price,
      confidenceScore: 0.88,
      priorityScore: Math.min(1, usdValue / 500_000),
      isBlockTrade: recent.some(item => item.isBlockTrade),
      exchangesInvolved: exchanges,
      summary: `${event.side === 'buy' ? 'Buy' : 'Sell'} cluster on ${event.baseAsset}`,
      details: `${recent.length} large prints in ${Math.round(this.clusterWindowMs / 1000)}s worth $${usdValue.toFixed(0)}`,
    };
  }

  private toCrossExchangeSignal(event: NormalizedTradeEvent): SignalEvent | null {
    const key = `${event.baseAsset}:${event.side}`;
    const recent = (this.recentTrades.get(key) ?? [])
      .filter(item => item.usdValue >= this.minimumUsdValue)
      .filter(item => event.timestamp - item.timestamp <= this.crossExchangeWindowMs);

    const exchanges = Array.from(new Set(recent.map(item => item.exchange)));
    if (exchanges.length < 2) {
      return null;
    }

    const usdValue = recent.reduce((sum, item) => sum + item.usdValue, 0);
    return {
      ...this.toLargeSignal(event),
      id: `cross-${key}-${Math.floor(event.timestamp / this.crossExchangeWindowMs)}`,
      eventType: 'cross_exchange_activity',
      exchangesInvolved: exchanges,
      tradeCount: recent.length,
      usdValue,
      confidenceScore: 0.95,
      priorityScore: 1,
      summary: `Cross-exchange ${event.side} activity on ${event.baseAsset}`,
      details: `${recent.length} large prints across ${exchanges.join(', ')} worth $${usdValue.toFixed(0)}`,
    };
  }

  private toAnomalySignal(event: NormalizedTradeEvent): SignalEvent | null {
    const key = `${event.baseAsset}:${event.side}`;
    const baseline = (this.recentTrades.get(key) ?? [])
      .filter(item => item.id !== event.id)
      .map(item => item.usdValue);

    if (event.usdValue < this.anomalyMinimumUsdValue || baseline.length < 5) {
      return null;
    }

    const averageUsdValue = baseline.reduce((sum, value) => sum + value, 0) / baseline.length;
    if (!Number.isFinite(averageUsdValue) || averageUsdValue <= 0 || event.usdValue < averageUsdValue * 3) {
      return null;
    }

    return {
      ...this.toLargeSignal(event),
      id: `anomaly-${event.id}`,
      eventType: 'anomalous_activity',
      confidenceScore: 0.92,
      priorityScore: Math.min(1, event.usdValue / (averageUsdValue * 4)),
      summary: `Anomalous ${event.side} activity on ${event.baseAsset}`,
      details: `Print worth $${event.usdValue.toFixed(0)} vs rolling average $${averageUsdValue.toFixed(0)}`,
    };
  }

  private deduplicateSignals(signals: SignalEvent[]): SignalEvent[] {
    const byId = new Map<string, SignalEvent>();
    for (const signal of signals) {
      const current = byId.get(signal.id);
      if (!current || signal.timestamp >= current.timestamp) {
        byId.set(signal.id, signal);
      }
    }
    return Array.from(byId.values());
  }
}
