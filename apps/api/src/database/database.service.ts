import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Pool, QueryResult, QueryResultRow } from 'pg';
import Redis from 'ioredis';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool: Pool | null = null;
  private redis: Redis | null = null;

  async onModuleInit() {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (databaseUrl) {
      this.pool = new Pool({
        connectionString: databaseUrl,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });
    } else {
      console.warn('[DatabaseService] DATABASE_URL not set, running without PostgreSQL');
    }

    const redisUrl = process.env.REDIS_URL?.trim();
    if (redisUrl) {
      this.redis = this.createRedisClient(redisUrl);
    }

    if (this.pool) {
      await this.runMigrations();
    }
    console.log('✅ Database connected and migrated');
  }

  async onModuleDestroy() {
    await this.pool?.end();
    this.redis?.disconnect();
  }

  async query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    if (!this.pool) {
      throw new Error('Database unavailable');
    }
    return this.pool.query<T>(text, params);
  }

  getRedis(): Redis | null {
    return this.redis;
  }

  // Cache helpers
  async cacheGet<T>(key: string): Promise<T | null> {
    if (!this.redis) return null;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  async cacheSet(key: string, value: unknown, ttlSeconds = 60): Promise<void> {
    if (!this.redis) return;
    await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async cacheDel(key: string): Promise<void> {
    if (!this.redis) return;
    await this.redis.del(key);
  }

  // Pub/Sub helpers
  async publish(channel: string, message: unknown): Promise<void> {
    if (!this.redis) return;
    await this.redis.publish(channel, JSON.stringify(message));
  }

  createSubscriber(): Redis | null {
    const redisUrl = process.env.REDIS_URL?.trim();
    if (!redisUrl) return null;

    return new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
    });
  }

  private createRedisClient(redisUrl: string): Redis {
    const client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: times => Math.min(times * 500, 5000),
    });
    client.on('error', error => {
      console.warn(`[DatabaseService] Redis error: ${error.message}`);
    });
    return client;
  }

  private async runMigrations() {
    const shouldResetOnBoot = process.env.DB_RESET_ON_BOOT === 'true';

    if (shouldResetOnBoot) {
      await this.query(`
        DROP TABLE IF EXISTS alert_rules CASCADE;
        DROP TABLE IF EXISTS watchlists CASCADE;
        DROP TABLE IF EXISTS users CASCADE;
        DROP TABLE IF EXISTS candles CASCADE;
      `);
    }

    await this.query(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;

      CREATE TABLE IF NOT EXISTS candles (
        id BIGSERIAL,
        symbol VARCHAR(20) NOT NULL,
        exchange VARCHAR(20) NOT NULL,
        timeframe VARCHAR(5) NOT NULL,
        time BIGINT NOT NULL,
        open NUMERIC(20,8) NOT NULL,
        high NUMERIC(20,8) NOT NULL,
        low NUMERIC(20,8) NOT NULL,
        close NUMERIC(20,8) NOT NULL,
        volume NUMERIC(30,8) NOT NULL,
        trades INTEGER DEFAULT 0,
        PRIMARY KEY (symbol, exchange, timeframe, time)
      );

      CREATE INDEX IF NOT EXISTS idx_candles_symbol_tf_time 
        ON candles (symbol, timeframe, time DESC);
      CREATE INDEX IF NOT EXISTS idx_candles_exchange_time 
        ON candles (exchange, time DESC);

      CREATE TABLE IF NOT EXISTS alerts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        type VARCHAR(50) NOT NULL,
        priority VARCHAR(20) NOT NULL DEFAULT 'medium',
        symbol VARCHAR(20),
        exchange VARCHAR(20),
        title VARCHAR(255) NOT NULL,
        message TEXT,
        data JSONB,
        read BOOLEAN DEFAULT FALSE,
        user_id UUID,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_alerts_user_created 
        ON alerts (user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_alerts_type_created 
        ON alerts (type, created_at DESC);

      CREATE TABLE IF NOT EXISTS detected_patterns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        symbol VARCHAR(20) NOT NULL,
        exchange VARCHAR(20) NOT NULL,
        type VARCHAR(50) NOT NULL,
        timeframe VARCHAR(5) NOT NULL,
        confidence NUMERIC(5,4) NOT NULL,
        points JSONB NOT NULL,
        description TEXT,
        direction VARCHAR(20),
        target_price NUMERIC(20,8),
        stop_loss NUMERIC(20,8),
        status VARCHAR(20) DEFAULT 'forming',
        detected_at BIGINT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_patterns_symbol_status 
        ON detected_patterns (symbol, status);
      CREATE INDEX IF NOT EXISTS idx_patterns_detected_at 
        ON detected_patterns (detected_at DESC);

      ALTER TABLE detected_patterns
        ADD COLUMN IF NOT EXISTS market_type VARCHAR(20) DEFAULT 'futures',
        ADD COLUMN IF NOT EXISTS kind VARCHAR(50),
        ADD COLUMN IF NOT EXISTS quality INTEGER,
        ADD COLUMN IF NOT EXISTS geometry JSONB,
        ADD COLUMN IF NOT EXISTS updated_at BIGINT,
        ADD COLUMN IF NOT EXISTS finished_at BIGINT,
        ADD COLUMN IF NOT EXISTS expires_at BIGINT;

      UPDATE detected_patterns
      SET
        kind = COALESCE(kind, type),
        quality = COALESCE(quality, ROUND(confidence * 100)),
        geometry = COALESCE(
          geometry,
          jsonb_build_object(
            'anchorTimeFrom', detected_at,
            'anchorTimeTo', detected_at,
            'priceMin', 0,
            'priceMax', 0,
            'pivots', COALESCE(points, '[]'::jsonb),
            'lines', '[]'::jsonb,
            'zones', '[]'::jsonb
          )
        ),
        updated_at = COALESCE(updated_at, detected_at)
      WHERE kind IS NULL
         OR quality IS NULL
         OR geometry IS NULL
         OR updated_at IS NULL;

      CREATE INDEX IF NOT EXISTS idx_patterns_updated_at
        ON detected_patterns (updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_patterns_kind_status
        ON detected_patterns (kind, status);

      CREATE TABLE IF NOT EXISTS watchlists (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        name VARCHAR(100) NOT NULL,
        symbols JSONB NOT NULL DEFAULT '[]',
        is_default BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        telegram_id BIGINT UNIQUE,
        username VARCHAR(100),
        email VARCHAR(255),
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS alert_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        type VARCHAR(50) NOT NULL,
        symbol VARCHAR(20),
        exchange VARCHAR(20),
        conditions JSONB NOT NULL,
        channels JSONB NOT NULL DEFAULT '["in_app"]',
        enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
  }
}
