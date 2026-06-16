import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ScreenerEvent } from '@crypto-screener/shared';
import { ScreenerReadModel } from './screener.read-model';

const NOW = 1_720_000_000_000;

function makeEvent(overrides: Partial<ScreenerEvent>): ScreenerEvent {
  return {
    id: 'event-1',
    symbol: 'BTC/USDT',
    marketMode: 'spot',
    detectorType: 'spot-breakout-pressure',
    promotionTier: 'actionable',
    strengthTier: 'actionable',
    headline: 'BTC breakout pressure',
    reason: 'Volume expanded while price held above range.',
    riskNote: 'Fails if price falls back into the range.',
    primaryExchange: 'binance',
    chartTimeframe: '5m',
    supportingMetrics: {
      priceChange5m: 3.4,
      volumeSpikeRatio: 2.8,
    },
    confirms: ['Needs hold above local range', 'Spot volume remains elevated'],
    invalidates: ['Breakout snaps back into prior range'],
    updatedAt: NOW - 30_000,
    ...overrides,
  };
}

function makeSnapshotFixture() {
  const actionableNewest = makeEvent({
    id: 'event-3',
    symbol: 'SOL/USDT',
    detectorType: 'spot-cross-exchange',
    promotionTier: 'actionable',
    strengthTier: 'watching',
    headline: 'SOL spot venues are diverging',
    updatedAt: NOW - 5_000,
  });
  const rareOlder = makeEvent({
    id: 'event-2',
    symbol: 'ETH/USDT:USDT',
    marketMode: 'futures',
    detectorType: 'futures-oi-build',
    promotionTier: 'rare',
    strengthTier: 'event-live',
    headline: 'ETH futures OI build',
    updatedAt: NOW - 20_000,
  });
  const rareNewest = makeEvent({
    id: 'event-1',
    promotionTier: 'rare',
    strengthTier: 'event-live',
    updatedAt: NOW - 10_000,
  });

  return {
    bestSetups: [actionableNewest, rareOlder, rareNewest],
    spotEvents: [actionableNewest, rareNewest],
    futuresEvents: [rareOlder],
    rows: [],
    summary: {
      totalRows: 7,
      momentumCount: 1,
      breakoutWatchCount: 2,
      compressionBreakoutCount: 1,
      oiBuildCount: 1,
      volumeExpansionCount: 1,
      shortSqueezeRiskCount: 1,
      longLiquidationRiskCount: 0,
      averageScore: 68.5,
      universeSize: 24,
    },
  };
}

describe('ScreenerReadModel', () => {
  it('returns best setups sorted by promotion strength and freshness', () => {
    const model = new ScreenerReadModel();

    const response = model.toBestSetupsResponse(makeSnapshotFixture(), NOW);

    assert.equal(response.items[0]?.id, 'event-1');
    assert.equal(response.items[1]?.id, 'event-2');
    assert.equal(response.items[2]?.id, 'event-3');
    assert.equal(response.items[0]?.setupLabel, 'Breakout Pressure');
    assert.equal(response.items[0]?.freshnessMs, 10_000);
  });

  it('returns a detail payload with confirms and invalidates', () => {
    const model = new ScreenerReadModel();

    const response = model.toDetailResponse(makeSnapshotFixture(), 'event-1', NOW);

    assert.equal(response.item?.id, 'event-1');
    assert.deepEqual(response.item?.confirms, ['Needs hold above local range', 'Spot volume remains elevated']);
    assert.deepEqual(response.item?.invalidates, ['Breakout snaps back into prior range']);
    assert.equal(response.item?.whatChanged, 'BTC breakout pressure');
    assert.equal(response.item?.whyFlagged, 'Volume expanded while price held above range.');
    assert.deepEqual(response.item?.marketContext, [
      { key: 'priceChange5m', label: 'Price change 5m', value: 3.4 },
      { key: 'volumeSpikeRatio', label: 'Volume spike ratio', value: 2.8 },
    ]);
  });

  it('returns spot and futures list responses shaped for their modes', () => {
    const model = new ScreenerReadModel();
    const snapshot = makeSnapshotFixture();

    const spot = model.toSpotResponse(snapshot, NOW);
    const futures = model.toFuturesResponse(snapshot, NOW);

    assert.equal(spot.timestamp, NOW);
    assert.deepEqual(spot.items.map(item => item.id), ['event-1', 'event-3']);
    assert.equal(spot.items[0]?.marketMode, 'spot');
    assert.equal(spot.items[1]?.setupLabel, 'Cross-Exchange Divergence');
    assert.equal(futures.timestamp, NOW);
    assert.deepEqual(futures.items.map(item => item.id), ['event-2']);
    assert.equal(futures.items[0]?.marketMode, 'futures');
    assert.equal(futures.items[0]?.setupLabel, 'OI Build Pressure');
  });

  it('returns a compatible legacy summary plus event counts', () => {
    const model = new ScreenerReadModel();

    const response = model.toSummaryResponse(makeSnapshotFixture(), NOW);

    assert.equal(response.timestamp, NOW);
    assert.equal(response.summary.totalRows, 7);
    assert.equal(response.summary.averageScore, 68.5);
    assert.deepEqual(response.summary.eventCounts, {
      bestSetupsCount: 3,
      spotCount: 2,
      futuresCount: 1,
      rareCount: 2,
    });
  });

  it('returns null detail when the id is missing', () => {
    const model = new ScreenerReadModel();

    const response = model.toDetailResponse(makeSnapshotFixture(), 'missing-id', NOW);

    assert.equal(response.item, null);
    assert.equal(response.timestamp, NOW);
  });

  it('handles duplicate ids across snapshot buckets deterministically', () => {
    const model = new ScreenerReadModel();
    const duplicated = makeEvent({
      id: 'shared-id',
      detectorType: 'spot-cross-exchange',
      promotionTier: 'rare',
      strengthTier: 'event-live',
      headline: 'Higher priority duplicate',
      reason: 'This should win regardless of bucket order.',
      updatedAt: NOW - 4_000,
    });
    const lowerPriority = makeEvent({
      id: 'shared-id',
      detectorType: 'spot-breakout-pressure',
      promotionTier: 'actionable',
      strengthTier: 'actionable',
      headline: 'Lower priority duplicate',
      reason: 'This should lose.',
      updatedAt: NOW - 2_000,
    });

    const response = model.toDetailResponse({
      ...makeSnapshotFixture(),
      bestSetups: [lowerPriority],
      spotEvents: [duplicated],
      futuresEvents: [],
    }, 'shared-id', NOW);

    assert.equal(response.item?.headline, 'Higher priority duplicate');
    assert.equal(response.item?.setupLabel, 'Cross-Exchange Divergence');
  });
});
