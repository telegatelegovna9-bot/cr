import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import type { Alert, AlertType, AlertPriority, ExchangeId, Ticker } from '@crypto-screener/shared';
import { generateId, ALERT_COOLDOWN_MS } from '@crypto-screener/shared';

export interface PriceSignal {
  id: string;
  symbol: string;
  exchange: ExchangeId;
  price: number;
  direction: 'above' | 'below' | 'cross';
  armed: boolean;
  userId?: string;
}

@Injectable()
export class AlertsService implements OnModuleInit {
  private readonly logger = new Logger(AlertsService.name);
  private cooldowns = new Map<string, number>();
  private recentAlerts: Alert[] = [];
  private readonly MAX_RECENT = 200;

  // Active signals indexed by symbol for O(1) lookup
  private activeSignals = new Map<string, PriceSignal[]>();
  private lastPrices = new Map<string, number>();

  constructor(private readonly db: DatabaseService) {}

  async onModuleInit() {
    await this.loadActiveSignals();
  }

  private async loadActiveSignals() {
    try {
      // For now, signals are derived from 'drawing' levels or a dedicated signals table
      // We'll use a simplified version for this implementation
      this.logger?.log('Loading active price signals...');
      // Logic to load signals from DB would go here
    } catch (err) {
      console.error('Failed to load active signals:', err);
    }
  }

  /**
   * High-performance signal check called on every ticker update
   */
  checkPriceSignals(ticker: Ticker) {
    const key = `${ticker.exchange}:${ticker.symbol}`;
    const signals = this.activeSignals.get(key);
    if (!signals || signals.length === 0) {
      this.lastPrices.set(key, ticker.lastPrice);
      return;
    }

    const lastPrice = this.lastPrices.get(key);
    const currentPrice = ticker.lastPrice;
    this.lastPrices.set(key, currentPrice);

    if (lastPrice === undefined || lastPrice === currentPrice) return;

    for (const signal of signals) {
      if (!signal.armed) continue;

      let triggered = false;
      if (signal.direction === 'above' && currentPrice >= signal.price && lastPrice < signal.price) {
        triggered = true;
      } else if (signal.direction === 'below' && currentPrice <= signal.price && lastPrice > signal.price) {
        triggered = true;
      } else if (signal.direction === 'cross') {
        const crossedUp = lastPrice <= signal.price && currentPrice >= signal.price;
        const crossedDown = lastPrice >= signal.price && currentPrice <= signal.price;
        triggered = crossedUp || crossedDown;
      }

      if (triggered) {
        this.triggerSignal(signal, currentPrice);
      }
    }
  }

  private async triggerSignal(signal: PriceSignal, currentPrice: number) {
    // Prevent immediate re-trigger
    signal.armed = false;

    await this.createAlert({
      type: 'price_cross',
      priority: 'high',
      symbol: signal.symbol,
      exchange: signal.exchange,
      title: 'Price Signal Triggered',
      message: `${signal.symbol} reached ${signal.price} (Current: ${currentPrice})`,
      data: {
        signalId: signal.id,
        targetPrice: signal.price,
        currentPrice: currentPrice,
      },
    });

    // In a real app, we'd update the signal state in DB here
    console.log(`[Alerts] Signal triggered for ${signal.symbol} at ${signal.price}`);
  }

  /**
   * Registers a new signal for monitoring
   */
  registerSignal(signal: PriceSignal) {
    const key = `${signal.exchange}:${signal.symbol}`;
    const existing = this.activeSignals.get(key) || [];
    this.activeSignals.set(key, [...existing, signal]);
  }

  unregisterSignal(id: string) {
    for (const [key, signals] of this.activeSignals.entries()) {
      const filtered = signals.filter(s => s.id !== id);
      if (filtered.length !== signals.length) {
        this.activeSignals.set(key, filtered);
      }
    }
  }

  async createAlert(params: {
    type: AlertType;
    priority: AlertPriority;
    symbol?: string;
    exchange?: ExchangeId;
    title: string;
    message: string;
    data?: Record<string, unknown>;
  }): Promise<Alert> {
    const cooldownKey = `${params.type}:${params.symbol}:${params.exchange}`;
    const lastAlert = this.cooldowns.get(cooldownKey);
    if (lastAlert && Date.now() - lastAlert < ALERT_COOLDOWN_MS) {
      // Still in cooldown
      return null as unknown as Alert;
    }

    const alert: Alert = {
      id: generateId(),
      type: params.type,
      priority: params.priority,
      symbol: params.symbol || '',
      exchange: params.exchange || ('binance' as ExchangeId),
      title: params.title,
      message: params.message,
      data: params.data,
      read: false,
      createdAt: Date.now(),
    };

    // Store in DB
    try {
      await this.db.query(
        `INSERT INTO alerts (id, type, priority, symbol, exchange, title, message, data, read, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, to_timestamp($10 / 1000.0))`,
        [alert.id, alert.type, alert.priority, alert.symbol, alert.exchange,
         alert.title, alert.message, JSON.stringify(alert.data), alert.read, alert.createdAt],
      );
    } catch (err) {
      console.error('Failed to store alert:', err);
    }

    // Update cooldown
    this.cooldowns.set(cooldownKey, Date.now());

    // Add to recent
    this.recentAlerts.unshift(alert);
    if (this.recentAlerts.length > this.MAX_RECENT) {
      this.recentAlerts = this.recentAlerts.slice(0, this.MAX_RECENT);
    }

    // Publish for WebSocket relay
    await this.db.publish('alert', alert);

    return alert;
  }

  async getAlerts(params: {
    userId?: string;
    type?: AlertType;
    symbol?: string;
    read?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ alerts: Alert[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (params.userId) {
      conditions.push(`user_id = $${idx++}`);
      values.push(params.userId);
    }
    if (params.type) {
      conditions.push(`type = $${idx++}`);
      values.push(params.type);
    }
    if (params.symbol) {
      conditions.push(`symbol = $${idx++}`);
      values.push(params.symbol);
    }
    if (params.read !== undefined) {
      conditions.push(`read = $${idx++}`);
      values.push(params.read);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = params.limit || 50;
    const offset = params.offset || 0;

    const [dataResult, countResult] = await Promise.all([
      this.db.query<Alert>(
        `SELECT id, type, priority, symbol, exchange, title, message, data, read, 
                extract(epoch from created_at) * 1000 as "createdAt"
         FROM alerts ${where}
         ORDER BY created_at DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...values, limit, offset],
      ),
      this.db.query<{ count: string }>(
        `SELECT COUNT(*) as count FROM alerts ${where}`,
        values,
      ),
    ]);

    return {
      alerts: dataResult.rows,
      total: parseInt(countResult.rows[0]?.count || '0'),
    };
  }

  getRecentAlerts(limit = 50): Alert[] {
    return this.recentAlerts.slice(0, limit);
  }

  async markAsRead(alertId: string): Promise<void> {
    await this.db.query('UPDATE alerts SET read = true WHERE id = $1', [alertId]);
    
    const alert = this.recentAlerts.find(a => a.id === alertId);
    if (alert) alert.read = true;
  }

  async markAllAsRead(userId?: string): Promise<void> {
    if (userId) {
      await this.db.query('UPDATE alerts SET read = true WHERE user_id = $1', [userId]);
    } else {
      await this.db.query('UPDATE alerts SET read = true WHERE read = false');
    }
    this.recentAlerts.forEach(a => { a.read = true; });
  }

  async deleteAlert(alertId: string): Promise<void> {
    await this.db.query('DELETE FROM alerts WHERE id = $1', [alertId]);
    this.recentAlerts = this.recentAlerts.filter(a => a.id !== alertId);
  }

  getUnreadCount(): number {
    return this.recentAlerts.filter(a => !a.read).length;
  }
}
