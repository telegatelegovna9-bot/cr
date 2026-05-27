import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { generateId } from '@crypto-screener/shared';

interface Watchlist {
  id: string;
  userId: string;
  name: string;
  symbols: string[];
  isDefault: boolean;
}

@Injectable()
export class WatchlistService {
  constructor(private readonly db: DatabaseService) {}

  async getWatchlists(userId: string): Promise<Watchlist[]> {
    const result = await this.db.query<Watchlist>(
      `SELECT id, user_id as "userId", name, symbols, is_default as "isDefault"
       FROM watchlists WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC`,
      [userId],
    );
    return result.rows;
  }

  async getDefaultWatchlist(userId: string): Promise<Watchlist | null> {
    const result = await this.db.query<Watchlist>(
      `SELECT id, user_id as "userId", name, symbols, is_default as "isDefault"
       FROM watchlists WHERE user_id = $1 AND is_default = true LIMIT 1`,
      [userId],
    );
    return result.rows[0] || null;
  }

  async createWatchlist(userId: string, name: string, symbols: string[] = []): Promise<Watchlist> {
    const result = await this.db.query<Watchlist>(
      `INSERT INTO watchlists (user_id, name, symbols) VALUES ($1, $2, $3)
       RETURNING id, user_id as "userId", name, symbols, is_default as "isDefault"`,
      [userId, name, JSON.stringify(symbols)],
    );
    return result.rows[0];
  }

  async updateWatchlist(watchlistId: string, updates: { name?: string; symbols?: string[] }): Promise<void> {
    if (updates.name) {
      await this.db.query(
        'UPDATE watchlists SET name = $1, updated_at = NOW() WHERE id = $2',
        [updates.name, watchlistId],
      );
    }
    if (updates.symbols) {
      await this.db.query(
        'UPDATE watchlists SET symbols = $1, updated_at = NOW() WHERE id = $2',
        [JSON.stringify(updates.symbols), watchlistId],
      );
    }
  }

  async addSymbol(watchlistId: string, symbol: string): Promise<void> {
    await this.db.query(
      `UPDATE watchlists SET symbols = (
        SELECT jsonb_agg(DISTINCT elem) FROM (
          SELECT jsonb_array_elements(symbols) AS elem
          UNION ALL SELECT to_jsonb($1::text)
        ) sub
      ), updated_at = NOW() WHERE id = $2`,
      [symbol, watchlistId],
    );
  }

  async removeSymbol(watchlistId: string, symbol: string): Promise<void> {
    await this.db.query(
      `UPDATE watchlists SET symbols = (
        SELECT jsonb_agg(elem) FROM jsonb_array_elements(symbols) elem
        WHERE elem != to_jsonb($1::text)
      ), updated_at = NOW() WHERE id = $2`,
      [symbol, watchlistId],
    );
  }

  async deleteWatchlist(watchlistId: string): Promise<void> {
    await this.db.query('DELETE FROM watchlists WHERE id = $1 AND is_default = false', [watchlistId]);
  }
}
