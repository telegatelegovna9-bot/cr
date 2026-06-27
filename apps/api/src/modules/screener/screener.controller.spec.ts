import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { test } from 'node:test';
import { ScreenerController } from './screener.controller';

function createController() {
  const calls: string[] = [];
  const controller = new ScreenerController({
    listSnapshot: (marketType: 'spot' | 'futures') => {
      calls.push(marketType);
      return { marketType, updatedAt: 1, rows: [] };
    },
  } as never);

  return { controller, calls };
}

test('ScreenerController defaults marketType to spot', () => {
  const { controller, calls } = createController();

  const response = controller.getSnapshot();

  assert.equal(calls[0], 'spot');
  assert.equal(response.data.marketType, 'spot');
});

test('ScreenerController accepts supported marketType values', () => {
  const { controller, calls } = createController();

  const response = controller.getSnapshot('futures');

  assert.equal(calls[0], 'futures');
  assert.equal(response.data.marketType, 'futures');
});

test('ScreenerController rejects unsupported marketType values', () => {
  const { controller } = createController();

  assert.throws(() => controller.getSnapshot('invalid'), BadRequestException);
});
