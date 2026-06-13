import { Injectable } from '@nestjs/common';
import type { NormalizedTradeEvent, SignalEvent } from './signals.types';

@Injectable()
export class SignalsAggregator {
  private readonly minimumUsdValue = 25_000;

  aggregate(events: NormalizedTradeEvent[]): SignalEvent[] {
    const signals = events
      .filter(event => event.usdValue >= this.minimumUsdValue)
      .map(event => this.toLargeSignal(event));

    const grouped = new Map<string, SignalEvent[]>();
    for (const signal of signals) {
      const key = `${signal.baseAsset}:${signal.side}`;
      const items = grouped.get(key) ?? [];
      items.push(signal);
      grouped.set(key, items);
    }

    for (const [key, items] of grouped) {
      const exchanges = Array.from(new Set(items.map(item => item.exchange)));
      if (exchanges.length < 2) {
        continue;
      }

      const first = items[0];
      if (!first) {
        continue;
      }

      signals.push({
        ...first,
        id: `cross-${key}-${first.timestamp}`,
        eventType: 'cross_exchange_activity',
        exchangesInvolved: exchanges,
        tradeCount: items.length,
        usdValue: items.reduce((sum, item) => sum + item.usdValue, 0),
        confidenceScore: 0.95,
        priorityScore: 1,
        summary: `Cross-exchange ${first.side} activity on ${first.baseAsset}`,
        details: `${items.length} large prints across ${exchanges.join(', ')}`,
      });
    }

    return signals.sort((a, b) => b.timestamp - a.timestamp || b.priorityScore - a.priorityScore);
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
}
