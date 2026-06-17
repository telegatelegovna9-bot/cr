import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseService } from './database.service';

test('DatabaseService cache and pubsub helpers become no-ops when redis is disabled', async () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousRedisUrl = process.env.REDIS_URL;
  delete process.env.DATABASE_URL;
  delete process.env.REDIS_URL;

  const service = new DatabaseService();
  (service as any).redis = null;

  await assert.doesNotReject(async () => {
    assert.equal(await service.cacheGet('signals:prefs:test'), null);
    await service.cacheSet('signals:prefs:test', { enabled: true });
    await service.cacheDel('signals:prefs:test');
    await service.publish('alert', { id: 'alert-1' });
  });
  assert.equal(service.createSubscriber(), null);
  await assert.doesNotReject(async () => {
    await service.onModuleInit();
  });
  await assert.rejects(() => service.query('SELECT 1'), /Database unavailable/);
  await assert.doesNotReject(async () => {
    await service.onModuleDestroy();
  });

  if (previousDatabaseUrl) {
    process.env.DATABASE_URL = previousDatabaseUrl;
  }
  if (previousRedisUrl) {
    process.env.REDIS_URL = previousRedisUrl;
  }
});
