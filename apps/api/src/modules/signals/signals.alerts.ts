import { Injectable } from '@nestjs/common';
import type { SignalAlert, SignalEvent } from './signals.types';

@Injectable()
export class SignalsAlertsService {
  private readonly notificationCooldownMs = 5 * 60 * 1000;
  private readonly lastAlertedAt = new Map<string, number>();

  shouldAlert(event: SignalEvent) {
    if (!this.passesSeverityGate(event)) {
      return false;
    }

    const key = this.getCooldownKey(event);
    const lastTriggeredAt = this.lastAlertedAt.get(key) ?? 0;
    if (event.timestamp - lastTriggeredAt < this.notificationCooldownMs) {
      return false;
    }

    this.lastAlertedAt.set(key, event.timestamp);
    return true;
  }

  createAlert(event: SignalEvent): SignalAlert {
    return {
      id: `alert-${event.id}`,
      signalId: event.id,
      timestamp: event.timestamp,
      minUsdThreshold: event.usdValue,
      title: event.summary,
      body: event.details,
    };
  }

  private passesSeverityGate(event: SignalEvent): boolean {
    switch (event.eventType) {
      case 'block_trade':
        return event.usdValue >= 100_000;
      case 'cross_exchange_activity':
        return event.usdValue >= 200_000 && event.tradeCount >= 2;
      case 'buy_cluster':
      case 'sell_cluster':
        return event.usdValue >= 250_000 && event.tradeCount >= 4;
      case 'anomalous_activity':
        return event.usdValue >= 150_000 && event.priorityScore >= 0.85;
      default:
        return false;
    }
  }

  private getCooldownKey(event: SignalEvent): string {
    return `${event.baseAsset}:${event.eventType}:${event.side}`;
  }
}
