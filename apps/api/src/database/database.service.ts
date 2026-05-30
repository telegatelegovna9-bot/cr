import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Pool, QueryResult, QueryResultRow } from 'pg';
import Redis from 'ioredis';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool!: Pool;
  private redis!: Redis;

  async onModuleInit() {
    // PostgreSQL
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    // Redis
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 500, 5000),
    });

    // Run migrations
    await this.runMigrations();
    console.log('✅ Database connected and migrated');
  }

  async onModuleDestroy() {
    await this.pool.end();
    this.redis.disconnect();
  }

  async query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params);
  }

  getRedis(): Redis {
    return this.redis;
  }

  // Cache helpers
  async cacheGet<T>(key: string): Promise<T | null> {
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  async cacheSet(key: string, value: unknown, ttlSeconds = 60): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async cacheDel(key: string): Promise<void> {
    await this.redis.del(key);
  }

  // Pub/Sub helpers
  async publish(channel: string, message: unknown): Promise<void> {
    await this.redis.publish(channel, JSON.stringify(message));
  }

  createSubscriber(): Redis {
    return new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
    });
  }

  private async runMigrations() {
    // Drop tables with potentially incompatible schema before recreating
    await this.query(`
      DROP TABLE IF EXISTS alert_rules CASCADE;
      DROP TABLE IF EXISTS watchlists CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
      DROP TABLE IF EXISTS candles CASCADE;
    `);

    await this.query(`
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
