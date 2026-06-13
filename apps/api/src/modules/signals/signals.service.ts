import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { AuthService } from '../auth/auth.service';
import { SignalsAggregator } from './signals.aggregator';
import { SignalsAlertsService } from './signals.alerts';
import { SignalsStore } from './signals.store';
import type {
  NormalizedTradeEvent,
  SignalAlertsResponse,
  SignalFeedResponse,
  SignalHealthResponse,
  SignalNotificationPreferences,
  SignalSummaryResponse,
} from './signals.types';

@Injectable()
export class SignalsService implements OnModuleInit, OnModuleDestroy {
  private readonly guestPreferencesTtlSeconds = 90 * 24 * 60 * 60;
  private pruneTimer: ReturnType<typeof setInterval> | null = null;
  private readonly defaultPreferences: SignalNotificationPreferences = {
    enabled: true,
    minUsd: 100_000,
  };

  constructor(
    private readonly store: SignalsStore,
    private readonly alerts: SignalsAlertsService,
    private readonly aggregator: SignalsAggregator,
    private readonly db?: DatabaseService,
    private readonly auth?: AuthService,
  ) {}

  onModuleInit() {
    this.store.prune();
    this.pruneTimer = setInterval(() => {
      this.store.prune();
    }, 60_000);
  }

  onModuleDestroy() {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
  }

  ingest(events: NormalizedTradeEvent[]) {
    for (const event of events) {
      this.store.noteIngest(event.exchange, event.timestamp);
    }

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

  listSummary(): SignalSummaryResponse {
    return {
      summary: this.store.getSummary(),
      timestamp: Date.now(),
    };
  }

  getHealth(): SignalHealthResponse {
    return {
      health: this.store.getHealth(),
      timestamp: Date.now(),
    };
  }

  async getPreferences(authHeader?: string, clientId?: string): Promise<SignalNotificationPreferences> {
    const userId = await this.resolveUserId(authHeader);
    if (userId && this.auth) {
      const user = await this.auth.getUser(userId);
      const saved = user?.settings?.marketSignals as Partial<SignalNotificationPreferences> | undefined;
      return this.normalizePreferences(saved);
    }

    if (clientId && this.db) {
      const saved = await this.db.cacheGet<SignalNotificationPreferences>(this.getGuestPreferencesKey(clientId));
      return this.normalizePreferences(saved);
    }

    return this.defaultPreferences;
  }

  async updatePreferences(
    next: Partial<SignalNotificationPreferences>,
    authHeader?: string,
    clientId?: string,
  ): Promise<SignalNotificationPreferences> {
    const normalized = this.normalizePreferences(next);
    const userId = await this.resolveUserId(authHeader);

    if (userId && this.auth) {
      await this.auth.updateSettings(userId, { marketSignals: normalized });
      return normalized;
    }

    if (clientId && this.db) {
      await this.db.cacheSet(this.getGuestPreferencesKey(clientId), normalized, this.guestPreferencesTtlSeconds);
    }

    return normalized;
  }

  async listAlertsForPreferences(authHeader?: string, clientId?: string): Promise<SignalAlertsResponse> {
    const preferences = await this.getPreferences(authHeader, clientId);
    if (!preferences.enabled) {
      return { items: [], timestamp: Date.now() };
    }

    return {
      items: this.store.listAlerts().filter(alert => alert.minUsdThreshold >= preferences.minUsd),
      timestamp: Date.now(),
    };
  }

  private async resolveUserId(authHeader?: string): Promise<string | null> {
    if (!authHeader || !this.auth) {
      return null;
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return null;
    }

    return this.auth.validateToken(token)?.userId ?? null;
  }

  private normalizePreferences(
    input?: Partial<SignalNotificationPreferences> | null,
  ): SignalNotificationPreferences {
    const nextMinUsd = Number(input?.minUsd);
    return {
      enabled: typeof input?.enabled === 'boolean' ? input.enabled : this.defaultPreferences.enabled,
      minUsd: Number.isFinite(nextMinUsd) && nextMinUsd >= 25_000 ? nextMinUsd : this.defaultPreferences.minUsd,
    };
  }

  private getGuestPreferencesKey(clientId: string): string {
    return `signals:prefs:${clientId}`;
  }
}
