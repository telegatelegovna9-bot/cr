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
  private readonly majorAssets = new Set(['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'BNB', 'HYPE']);

  aggregate(events: NormalizedTradeEvent[]): SignalEvent[] {
    const signals: SignalEvent[] = [];

    for (const event of events) {
      this.rememberTrade(event);

      const clusterSignal = this.toClusterSignal(event);
      const crossExchangeSignal = this.toCrossExchangeSignal(event);
      const anomalySignal = this.toAnomalySignal(event);
      const strongerSignals = [clusterSignal, crossExchangeSignal, anomalySignal].filter(
        (signal): signal is SignalEvent => signal !== null,
      );

      signals.push(...strongerSignals);

      if (this.shouldEmitLargeSignal(event, strongerSignals.length > 0)) {
        signals.push(this.toLargeSignal(event));
      }
    }

    return this.deduplicateSignals(signals)
      .sort((a, b) => b.timestamp - a.timestamp || b.priorityScore - a.priorityScore);
  }

  private shouldEmitLargeSignal(event: NormalizedTradeEvent, hasStrongerSignal: boolean): boolean {
    if (hasStrongerSignal && !event.isBlockTrade) {
      return false;
    }

    const baseline = this.getRecentTrades(event)
      .filter(item => item.id !== event.id)
      .map(item => item.usdValue);
    const averageUsdValue =
      baseline.length > 0
        ? baseline.reduce((sum, value) => sum + value, 0) / baseline.length
        : 0;

    if (event.isBlockTrade) {
      return event.usdValue >= 100_000;
    }

    if (this.isMajorAsset(event.baseAsset)) {
      const minimumUsd = baseline.length >= 5
        ? Math.max(250_000, averageUsdValue * 3)
        : 250_000;
      return event.usdValue >= minimumUsd;
    }

    const minimumUsd = baseline.length >= 5
      ? Math.max(40_000, averageUsdValue * 1.8)
      : Math.max(this.minimumUsdValue, 40_000);
    return event.usdValue >= minimumUsd;
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
    const recent = this.getRecentTrades(event)
      .filter(item => event.timestamp - item.timestamp <= this.clusterWindowMs);

    const usdValue = recent.reduce((sum, item) => sum + item.usdValue, 0);
    const minimumTrades = this.isMajorAsset(event.baseAsset) ? 5 : this.clusterMinimumTrades;
    const minimumUsdValue = this.isMajorAsset(event.baseAsset) ? 500_000 : this.clusterMinimumUsdValue;

    if (recent.length < minimumTrades || usdValue < minimumUsdValue) {
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
    const recent = this.getRecentTrades(event)
      .filter(item => this.shouldCountForCrossExchange(item))
      .filter(item => event.timestamp - item.timestamp <= this.crossExchangeWindowMs);

    const exchanges = Array.from(new Set(recent.map(item => item.exchange)));
    const usdValue = recent.reduce((sum, item) => sum + item.usdValue, 0);
    const minimumUsdValue = this.isMajorAsset(event.baseAsset) ? 400_000 : 150_000;

    if (exchanges.length < 2 || recent.length < 3 || usdValue < minimumUsdValue) {
      return null;
    }

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
    const baseline = this.getRecentTrades(event)
      .filter(item => item.id !== event.id)
      .map(item => item.usdValue);

    if (baseline.length < 8) {
      return null;
    }

    const averageUsdValue = baseline.reduce((sum, value) => sum + value, 0) / baseline.length;
    const minimumUsdValue = this.isMajorAsset(event.baseAsset) ? 150_000 : this.anomalyMinimumUsdValue;
    const requiredMultiplier = this.isMajorAsset(event.baseAsset) ? 4 : 2.5;

    if (
      event.usdValue < minimumUsdValue ||
      !Number.isFinite(averageUsdValue) ||
      averageUsdValue <= 0 ||
      event.usdValue < averageUsdValue * requiredMultiplier
    ) {
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

  private getRecentTrades(event: NormalizedTradeEvent): NormalizedTradeEvent[] {
    return this.recentTrades.get(`${event.baseAsset}:${event.side}`) ?? [];
  }

  private isMajorAsset(baseAsset: string): boolean {
    return this.majorAssets.has(baseAsset.toUpperCase());
  }

  private shouldCountForCrossExchange(event: NormalizedTradeEvent): boolean {
    return event.usdValue >= (this.isMajorAsset(event.baseAsset) ? 100_000 : this.minimumUsdValue);
  }
}
