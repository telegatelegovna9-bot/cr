import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = process.cwd();

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), 'utf8');
}

test('market gateway no longer exposes the legacy signal alert websocket channel', () => {
  const gateway = read('apps/api/src/modules/market/market.gateway.ts');
  assert.equal(gateway.includes('signal_alert'), false);
});

test('alerts controller no longer exposes legacy signal registration endpoints', () => {
  const controller = read('apps/api/src/modules/alerts/alerts.controller.ts');
  assert.equal(controller.includes("Post('signals')"), false);
  assert.equal(controller.includes("Delete('signals/:id')"), false);
});
