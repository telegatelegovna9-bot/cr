import { Injectable } from '@nestjs/common';
import type { SignalAlert, SignalEvent } from './signals.types';

@Injectable()
export class SignalsStore {
  private readonly liveRetentionMs = 15 * 60 * 1000;
  private readonly maxSignals = 1000;
  private readonly maxAlerts = 500;
  private readonly signals = new Map<string, SignalEvent>();
  private readonly alerts = new Map<string, SignalAlert>();

  upsertSignal(event: SignalEvent) {
    this.signals.set(event.id, event);
  }

  appendAlert(alert: SignalAlert) {
    this.alerts.set(alert.id, alert);
  }

  prune(now = Date.now()) {
    const cutoff = now - this.liveRetentionMs;
    for (const [id, signal] of this.signals) {
      if (signal.timestamp < cutoff) {
        this.signals.delete(id);
      }
    }

    for (const [id, alert] of this.alerts) {
      if (alert.timestamp < cutoff) {
        this.alerts.delete(id);
      }
    }
  }

  listSignals(): SignalEvent[] {
    return Array.from(this.signals.values())
      .sort((a, b) => b.timestamp - a.timestamp || b.priorityScore - a.priorityScore)
      .slice(0, this.maxSignals);
  }

  listAlerts(): SignalAlert[] {
    return Array.from(this.alerts.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, this.maxAlerts);
  }
}
