import { Injectable } from '@nestjs/common';
import type { SignalAlert, SignalEvent } from './signals.types';

@Injectable()
export class SignalsAlertsService {
  shouldAlert(event: SignalEvent) {
    return (
      event.priorityScore >= 0.75 ||
      event.eventType === 'block_trade' ||
      event.eventType === 'cross_exchange_activity'
    );
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
}
