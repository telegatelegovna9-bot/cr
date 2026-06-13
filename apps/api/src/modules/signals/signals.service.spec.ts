import assert from 'node:assert/strict';
import { SignalsAggregator } from './signals.aggregator';
import { SignalsAlertsService } from './signals.alerts';
import { SignalsService } from './signals.service';
import { SignalsStore } from './signals.store';

const service = new SignalsService(
  new SignalsStore(),
  new SignalsAlertsService(),
  new SignalsAggregator(),
);
const feed = service.listSignals();
assert.ok(Array.isArray(feed.items));
assert.equal(typeof feed.timestamp, 'number');
console.log('Signals service tests passed!');
