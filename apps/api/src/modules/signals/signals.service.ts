import { Injectable, OnModuleInit } from '@nestjs/common';
import { SignalsAggregator } from './signals.aggregator';
import { SignalsAlertsService } from './signals.alerts';
import { SignalsStore } from './signals.store';
import type {
  NormalizedTradeEvent,
  SignalAlertsResponse,
  SignalFeedResponse,
} from './signals.types';

@Injectable()
export class SignalsService implements OnModuleInit {
  constructor(
    private readonly store: SignalsStore,
    private readonly alerts: SignalsAlertsService,
    private readonly aggregator: SignalsAggregator,
  ) {}

  onModuleInit() {
    // Exchange connection startup hooks will attach here in a later migration step.
  }

  ingest(events: NormalizedTradeEvent[]) {
    const signals = this.aggregator.aggregate(events);
    for (const signal of signals) {
      this.store.upsertSignal(signal);
      if (this.alerts.shouldAlert(signal)) {
        this.store.appendAlert(this.alerts.createAlert(signal));
      }
    }

    this.store.prune();
  }

  listSignals(): SignalFeedResponse {
    return {
      items: this.store.listSignals(),
      timestamp: Date.now(),
    };
  }

  listAlerts(): SignalAlertsResponse {
    return {
      items: this.store.listAlerts(),
      timestamp: Date.now(),
    };
  }
}
