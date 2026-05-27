import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { generateId } from '@crypto-screener/shared';

export interface User {
  id: string;
  telegramId?: number;
  username?: string;
  email?: string;
  settings: Record<string, unknown>;
}

@Injectable()
export class AuthService {
  constructor(private readonly db: DatabaseService) {}

  async getOrCreateTelegramUser(telegramId: number, username?: string): Promise<User> {
    const existing = await this.db.query<User>(
      'SELECT * FROM users WHERE telegram_id = $1',
      [telegramId],
    );

    if (existing.rows.length > 0) {
      return existing.rows[0];
    }

    const result = await this.db.query<User>(
      `INSERT INTO users (telegram_id, username) VALUES ($1, $2) RETURNING *`,
      [telegramId, username],
    );

    // Create default watchlist
    await this.db.query(
      `INSERT INTO watchlists (user_id, name, symbols, is_default) VALUES ($1, 'Default', $2, true)`,
      [result.rows[0].id, JSON.stringify(['BTC/USDT', 'ETH/USDT', 'SOL/USDT'])],
    );

    return result.rows[0];
  }

  async getUser(userId: string): Promise<User | null> {
    const result = await this.db.query<User>('SELECT * FROM users WHERE id = $1', [userId]);
    return result.rows[0] || null;
  }

  async updateSettings(userId: string, settings: Record<string, unknown>): Promise<void> {
    await this.db.query(
      'UPDATE users SET settings = settings || $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(settings), userId],
    );
  }

  // Simple JWT-like token for API auth (not full JWT for simplicity)
  generateToken(userId: string): string {
    const payload = { userId, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 };
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  validateToken(token: string): { userId: string } | null {
    try {
      const payload = JSON.parse(Buffer.from(token, 'base64').toString());
      if (payload.exp < Date.now()) return null;
      return { userId: payload.userId };
    } catch {
      return null;
    }
  }
}
