import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import type { Alert, AlertType, AlertPriority, ExchangeId } from '@crypto-screener/shared';
import { generateId, ALERT_COOLDOWN_MS } from '@crypto-screener/shared';

@Injectable()
export class AlertsService {
  private cooldowns = new Map<string, number>();
  private recentAlerts: Alert[] = [];
  private readonly MAX_RECENT = 200;

  constructor(private readonly db: DatabaseService) {}

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
