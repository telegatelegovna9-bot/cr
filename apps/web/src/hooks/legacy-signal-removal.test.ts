import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = process.cwd();

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), 'utf8');
}

test('terminal page no longer mounts the legacy signal monitor hook', () => {
  const page = read('apps/web/src/app/page.tsx');
  assert.equal(page.includes('useSignalMonitor'), false);
});

test('websocket hook no longer subscribes to the legacy signal alert channel', () => {
  const hook = read('apps/web/src/hooks/useWebSocket.ts');
  assert.equal(hook.includes('signal_alert'), false);
  assert.equal(hook.includes('__signals__'), false);
});

test('settings view no longer exposes legacy market signal controls', () => {
  const settings = read('apps/web/src/components/terminal/settings-view.tsx');
  assert.equal(settings.includes('Market Signal Notifications'), false);
  assert.equal(settings.includes('Signal Notification Floor'), false);
});

test('drawing tools no longer expose legacy signal levels', () => {
  const toolbar = read('apps/web/src/components/charts/drawing-toolbar.tsx');
  assert.equal(toolbar.includes("'signal_level'"), false);
});
