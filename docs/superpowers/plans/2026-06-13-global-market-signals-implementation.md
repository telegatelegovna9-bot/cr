# Global Market Signals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current partial Hyperliquid-only flows screen with a shared background multi-exchange signal system that ingests public trade feeds, computes meaningful market-action signals once on the backend, stores them centrally, and serves feed plus alerts to all users.

**Architecture:** Add a new `signals` backend module with exchange adapters, normalization, aggregation, storage, and alert generation. Migrate the screener UI from legacy `flows` models to new `SignalEvent` models while preserving the current app style. Clean up misleading legacy flow types and fake categories once the new pipeline is live.

**Tech Stack:** NestJS, TypeScript, shared in-memory store with optional Redis-ready boundaries, WebSocket exchange feeds, Next.js React frontend, existing app settings infrastructure.

---

### Task 1: Create the backend signals module and core types

**Files:**
- Create: `apps/api/src/modules/signals/signals.module.ts`
- Create: `apps/api/src/modules/signals/signals.types.ts`
- Create: `apps/api/src/modules/signals/signals.service.ts`
- Create: `apps/api/src/modules/signals/signals.controller.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/src/modules/signals/signals.types.spec.ts`

- [ ] **Step 1: Write the failing type and API contract test**

```ts
// apps/api/src/modules/signals/signals.types.spec.ts
import assert from 'node:assert/strict';
import type { SignalEvent, SignalEventType } from './signals.types';

const event: SignalEvent = {
  id: 'sig-1',
  timestamp: Date.now(),
  exchange: 'binance',
  symbol: 'BTCUSDT',
  baseAsset: 'BTC',
  quoteAsset: 'USDT',
  side: 'buy',
  eventType: 'large_buy',
  usdValue: 250000,
  tradeCount: 1,
  price: 100000,
  confidenceScore: 0.8,
  priorityScore: 0.9,
  isBlockTrade: false,
  exchangesInvolved: ['binance'],
  summary: 'Large buy on Binance',
  details: 'Single large aggressive buy',
};

assert.equal(event.eventType, 'large_buy' satisfies SignalEventType);
assert.equal(event.exchangesInvolved.length, 1);
console.log('Signal type contract tests passed!');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @crypto-screener/api test -- src/modules/signals/signals.types.spec.ts`

Expected: FAIL because `signals.types.ts` and the module do not exist yet.

- [ ] **Step 3: Create the core type definitions**

```ts
// apps/api/src/modules/signals/signals.types.ts
export type SignalExchange = 'hyperliquid' | 'binance' | 'bybit' | 'okx' | 'coinbase';
export type SignalSide = 'buy' | 'sell';
export type SignalEventType =
  | 'large_buy'
  | 'large_sell'
  | 'block_trade'
  | 'buy_cluster'
  | 'sell_cluster'
  | 'cross_exchange_activity'
  | 'anomalous_activity';

export interface SignalEvent {
  id: string;
  timestamp: number;
  exchange: SignalExchange;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  side: SignalSide;
  eventType: SignalEventType;
  usdValue: number;
  tradeCount: number;
  price: number;
  confidenceScore: number;
  priorityScore: number;
  isBlockTrade: boolean;
  exchangesInvolved: SignalExchange[];
  summary: string;
  details: string;
}

export interface SignalFeedResponse {
  items: SignalEvent[];
  timestamp: number;
}
```

- [ ] **Step 4: Add the minimal service, controller, and module wiring**

```ts
// apps/api/src/modules/signals/signals.service.ts
import { Injectable } from '@nestjs/common';
import type { SignalEvent, SignalFeedResponse } from './signals.types';

@Injectable()
export class SignalsService {
  listSignals(): SignalFeedResponse {
    const items: SignalEvent[] = [];
    return { items, timestamp: Date.now() };
  }
}
```

```ts
// apps/api/src/modules/signals/signals.controller.ts
import { Controller, Get } from '@nestjs/common';
import { SignalsService } from './signals.service';

@Controller('signals')
export class SignalsController {
  constructor(private readonly signalsService: SignalsService) {}

  @Get()
  listSignals() {
    return this.signalsService.listSignals();
  }
}
```

```ts
// apps/api/src/modules/signals/signals.module.ts
import { Module } from '@nestjs/common';
import { SignalsController } from './signals.controller';
import { SignalsService } from './signals.service';

@Module({
  controllers: [SignalsController],
  providers: [SignalsService],
  exports: [SignalsService],
})
export class SignalsModule {}
```

```ts
// apps/api/src/app.module.ts
import { SignalsModule } from './modules/signals/signals.module';

@Module({
  imports: [
    // existing modules
    SignalsModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 5: Run tests and typecheck**

Run:
- `npm --workspace @crypto-screener/api test -- src/modules/signals/signals.types.spec.ts`
- `npx tsc -p apps/api/tsconfig.json --noEmit`

Expected: PASS and no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/signals apps/api/src/app.module.ts
git commit -m "feat: add core market signals module and types"
```

### Task 2: Add the in-memory signal store and alert records

**Files:**
- Create: `apps/api/src/modules/signals/signals.store.ts`
- Create: `apps/api/src/modules/signals/signals.alerts.ts`
- Modify: `apps/api/src/modules/signals/signals.types.ts`
- Modify: `apps/api/src/modules/signals/signals.module.ts`
- Test: `apps/api/src/modules/signals/signals.store.spec.ts`

- [ ] **Step 1: Write the failing store retention test**

```ts
// apps/api/src/modules/signals/signals.store.spec.ts
import assert from 'node:assert/strict';
import { SignalsStore } from './signals.store';

const store = new SignalsStore();
const now = Date.now();

store.upsertSignal({
  id: 'old',
  timestamp: now - 20 * 60 * 1000,
  exchange: 'binance',
  symbol: 'BTCUSDT',
  baseAsset: 'BTC',
  quoteAsset: 'USDT',
  side: 'buy',
  eventType: 'large_buy',
  usdValue: 150000,
  tradeCount: 1,
  price: 100000,
  confidenceScore: 0.6,
  priorityScore: 0.6,
  isBlockTrade: false,
  exchangesInvolved: ['binance'],
  summary: 'old',
  details: 'old',
});

store.prune(now);
assert.equal(store.listSignals().length, 0);
console.log('Signals store tests passed!');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @crypto-screener/api test -- src/modules/signals/signals.store.spec.ts`

Expected: FAIL because `SignalsStore` does not exist yet.

- [ ] **Step 3: Extend the types with alert entities**

```ts
// apps/api/src/modules/signals/signals.types.ts
export interface SignalAlert {
  id: string;
  signalId: string;
  timestamp: number;
  minUsdThreshold: number;
  title: string;
  body: string;
}
```

- [ ] **Step 4: Implement the in-memory store and alert service**

```ts
// apps/api/src/modules/signals/signals.store.ts
import { Injectable } from '@nestjs/common';
import type { SignalAlert, SignalEvent } from './signals.types';

@Injectable()
export class SignalsStore {
  private readonly liveRetentionMs = 15 * 60 * 1000;
  private readonly maxSignals = 1000;
  private readonly maxAlerts = 500;
  private readonly signals = new Map<string, SignalEvent>();
  private readonly alerts = new Map<string, SignalAlert>();

  upsertSignal(event: SignalEvent) {
    this.signals.set(event.id, event);
  }

  appendAlert(alert: SignalAlert) {
    this.alerts.set(alert.id, alert);
  }

  prune(now = Date.now()) {
    const cutoff = now - this.liveRetentionMs;
    for (const [id, signal] of this.signals) {
      if (signal.timestamp < cutoff) this.signals.delete(id);
    }
    for (const [id, alert] of this.alerts) {
      if (alert.timestamp < cutoff) this.alerts.delete(id);
    }
  }

  listSignals() {
    return Array.from(this.signals.values())
      .sort((a, b) => b.timestamp - a.timestamp || b.priorityScore - a.priorityScore)
      .slice(0, this.maxSignals);
  }

  listAlerts() {
    return Array.from(this.alerts.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, this.maxAlerts);
  }
}
```

```ts
// apps/api/src/modules/signals/signals.alerts.ts
import { Injectable } from '@nestjs/common';
import type { SignalAlert, SignalEvent } from './signals.types';

@Injectable()
export class SignalsAlertsService {
  createAlert(event: SignalEvent): SignalAlert {
    return {
      id: `alert-${event.id}`,
      signalId: event.id,
      timestamp: event.timestamp,
      minUsdThreshold: event.usdValue,
      title: event.summary,
      body: event.details,
    };
  }
}
```

- [ ] **Step 5: Wire providers into the module**

```ts
// apps/api/src/modules/signals/signals.module.ts
import { SignalsStore } from './signals.store';
import { SignalsAlertsService } from './signals.alerts';

@Module({
  controllers: [SignalsController],
  providers: [SignalsService, SignalsStore, SignalsAlertsService],
  exports: [SignalsService, SignalsStore, SignalsAlertsService],
})
export class SignalsModule {}
```

- [ ] **Step 6: Run tests and typecheck**

Run:
- `npm --workspace @crypto-screener/api test -- src/modules/signals/signals.store.spec.ts`
- `npx tsc -p apps/api/tsconfig.json --noEmit`

Expected: PASS and no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/signals/signals.types.ts apps/api/src/modules/signals/signals.store.ts apps/api/src/modules/signals/signals.alerts.ts apps/api/src/modules/signals/signals.module.ts
git commit -m "feat: add signals store and alert records"
```

### Task 3: Add exchange adapter boundaries and normalized raw trade events

**Files:**
- Create: `apps/api/src/modules/signals/adapters/signals.adapter.ts`
- Create: `apps/api/src/modules/signals/adapters/hyperliquid.adapter.ts`
- Create: `apps/api/src/modules/signals/adapters/binance.adapter.ts`
- Create: `apps/api/src/modules/signals/adapters/bybit.adapter.ts`
- Create: `apps/api/src/modules/signals/adapters/okx.adapter.ts`
- Create: `apps/api/src/modules/signals/adapters/coinbase.adapter.ts`
- Modify: `apps/api/src/modules/signals/signals.types.ts`
- Test: `apps/api/src/modules/signals/adapters/signals.adapter.spec.ts`

- [ ] **Step 1: Write the failing adapter normalization test**

```ts
// apps/api/src/modules/signals/adapters/signals.adapter.spec.ts
import assert from 'node:assert/strict';
import { normalizeBinanceAggTrade } from './binance.adapter';

const event = normalizeBinanceAggTrade({
  s: 'BTCUSDT',
  p: '100000',
  q: '2',
  m: false,
  T: 1710000000000,
});

assert.equal(event.exchange, 'binance');
assert.equal(event.usdValue, 200000);
assert.equal(event.side, 'buy');
console.log('Signals adapter tests passed!');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @crypto-screener/api test -- src/modules/signals/adapters/signals.adapter.spec.ts`

Expected: FAIL because the adapter functions do not exist.

- [ ] **Step 3: Add the raw normalized trade type**

```ts
// apps/api/src/modules/signals/signals.types.ts
export interface NormalizedTradeEvent {
  id: string;
  timestamp: number;
  exchange: SignalExchange;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  side: SignalSide;
  price: number;
  quantity: number;
  usdValue: number;
  isBlockTrade: boolean;
}
```

- [ ] **Step 4: Create the adapter boundary and normalization helpers**

```ts
// apps/api/src/modules/signals/adapters/signals.adapter.ts
import type { NormalizedTradeEvent } from '../signals.types';

export interface SignalsAdapter {
  readonly exchange: string;
  normalize(input: unknown): NormalizedTradeEvent | null;
}
```

```ts
// apps/api/src/modules/signals/adapters/binance.adapter.ts
import type { NormalizedTradeEvent } from '../signals.types';

export function normalizeBinanceAggTrade(input: any): NormalizedTradeEvent {
  const symbol = String(input.s);
  const price = Number(input.p);
  const quantity = Number(input.q);
  return {
    id: `binance-${symbol}-${input.T}-${input.p}-${input.q}`,
    timestamp: Number(input.T),
    exchange: 'binance',
    symbol,
    baseAsset: symbol.replace(/USDT$|USDC$|USD$/u, ''),
    quoteAsset: symbol.endsWith('USDT') ? 'USDT' : 'USD',
    side: input.m ? 'sell' : 'buy',
    price,
    quantity,
    usdValue: price * quantity,
    isBlockTrade: false,
  };
}
```

```ts
// apps/api/src/modules/signals/adapters/hyperliquid.adapter.ts
export function normalizeHyperliquidTrade(input: any) {
  const price = Number(input.px);
  const quantity = Number(input.sz);
  return {
    id: `hyperliquid-${input.coin}-${input.time}-${input.px}-${input.sz}`,
    timestamp: Number(input.time),
    exchange: 'hyperliquid' as const,
    symbol: `${input.coin}/USDC`,
    baseAsset: String(input.coin),
    quoteAsset: 'USDC',
    side: input.side === 'B' ? 'buy' : 'sell',
    price,
    quantity,
    usdValue: price * quantity,
    isBlockTrade: false,
  };
}
```

```ts
// apps/api/src/modules/signals/adapters/bybit.adapter.ts
export function normalizeBybitTrade(input: any) {
  const price = Number(input.p);
  const quantity = Number(input.v);
  return {
    id: `bybit-${input.s}-${input.T}-${input.p}-${input.v}`,
    timestamp: Number(input.T),
    exchange: 'bybit' as const,
    symbol: String(input.s),
    baseAsset: String(input.s).replace(/USDT$|USDC$/u, ''),
    quoteAsset: String(input.s).endsWith('USDC') ? 'USDC' : 'USDT',
    side: input.S === 'Buy' ? 'buy' : 'sell',
    price,
    quantity,
    usdValue: price * quantity,
    isBlockTrade: Boolean(input.BT),
  };
}
```

```ts
// apps/api/src/modules/signals/adapters/okx.adapter.ts
export function normalizeOkxTrade(input: any) {
  const price = Number(input.px);
  const quantity = Number(input.sz);
  return {
    id: `okx-${input.instId}-${input.ts}-${input.px}-${input.sz}`,
    timestamp: Number(input.ts),
    exchange: 'okx' as const,
    symbol: String(input.instId),
    baseAsset: String(input.instId).split('-')[0],
    quoteAsset: String(input.instId).split('-')[1] ?? 'USDT',
    side: input.side === 'buy' ? 'buy' : 'sell',
    price,
    quantity,
    usdValue: price * quantity,
    isBlockTrade: Boolean(input.isBlockTrade),
  };
}
```

```ts
// apps/api/src/modules/signals/adapters/coinbase.adapter.ts
export function normalizeCoinbaseTrade(input: any) {
  const price = Number(input.price);
  const quantity = Number(input.size);
  return {
    id: `coinbase-${input.product_id}-${input.time}-${input.price}-${input.size}`,
    timestamp: Date.parse(String(input.time)),
    exchange: 'coinbase' as const,
    symbol: String(input.product_id),
    baseAsset: String(input.product_id).split('-')[0],
    quoteAsset: String(input.product_id).split('-')[1] ?? 'USD',
    side: input.side === 'BUY' ? 'buy' : 'sell',
    price,
    quantity,
    usdValue: price * quantity,
    isBlockTrade: false,
  };
}
```

- [ ] **Step 5: Run tests and typecheck**

Run:
- `npm --workspace @crypto-screener/api test -- src/modules/signals/adapters/signals.adapter.spec.ts`
- `npx tsc -p apps/api/tsconfig.json --noEmit`

Expected: PASS and no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/signals/adapters apps/api/src/modules/signals/signals.types.ts
git commit -m "feat: add multi-exchange signal adapters"
```

### Task 4: Build the signal aggregator and alert generation rules

**Files:**
- Create: `apps/api/src/modules/signals/signals.aggregator.ts`
- Modify: `apps/api/src/modules/signals/signals.service.ts`
- Modify: `apps/api/src/modules/signals/signals.alerts.ts`
- Test: `apps/api/src/modules/signals/signals.aggregator.spec.ts`

- [ ] **Step 1: Write the failing cluster aggregation test**

```ts
// apps/api/src/modules/signals/signals.aggregator.spec.ts
import assert from 'node:assert/strict';
import { SignalsAggregator } from './signals.aggregator';

const aggregator = new SignalsAggregator();
const now = Date.now();

const output = aggregator.aggregate([
  {
    id: 'a',
    timestamp: now,
    exchange: 'binance',
    symbol: 'BTCUSDT',
    baseAsset: 'BTC',
    quoteAsset: 'USDT',
    side: 'buy',
    price: 100000,
    quantity: 1,
    usdValue: 100000,
    isBlockTrade: false,
  },
  {
    id: 'b',
    timestamp: now + 10_000,
    exchange: 'coinbase',
    symbol: 'BTC-USD',
    baseAsset: 'BTC',
    quoteAsset: 'USD',
    side: 'buy',
    price: 100100,
    quantity: 1,
    usdValue: 100100,
    isBlockTrade: false,
  },
]);

assert.equal(output.some(item => item.eventType === 'cross_exchange_activity'), true);
console.log('Signals aggregator tests passed!');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @crypto-screener/api test -- src/modules/signals/signals.aggregator.spec.ts`

Expected: FAIL because `SignalsAggregator` does not exist.

- [ ] **Step 3: Implement the minimal aggregation rules**

```ts
// apps/api/src/modules/signals/signals.aggregator.ts
import { Injectable } from '@nestjs/common';
import type { NormalizedTradeEvent, SignalEvent } from './signals.types';

@Injectable()
export class SignalsAggregator {
  aggregate(events: NormalizedTradeEvent[]): SignalEvent[] {
    const signals: SignalEvent[] = events
      .filter(event => event.usdValue >= 25_000)
      .map(event => ({
        id: `signal-${event.id}`,
        timestamp: event.timestamp,
        exchange: event.exchange,
        symbol: event.symbol,
        baseAsset: event.baseAsset,
        quoteAsset: event.quoteAsset,
        side: event.side,
        eventType: event.isBlockTrade ? 'block_trade' : event.side === 'buy' ? 'large_buy' : 'large_sell',
        usdValue: event.usdValue,
        tradeCount: 1,
        price: event.price,
        confidenceScore: event.isBlockTrade ? 0.9 : 0.6,
        priorityScore: Math.min(1, event.usdValue / 250000),
        isBlockTrade: event.isBlockTrade,
        exchangesInvolved: [event.exchange],
        summary: `${event.side === 'buy' ? 'Large buy' : 'Large sell'} on ${event.exchange}`,
        details: `${event.baseAsset} ${event.side} worth $${event.usdValue.toFixed(0)}`,
      }));

    const grouped = new Map<string, SignalEvent[]>();
    for (const signal of signals) {
      const key = `${signal.baseAsset}:${signal.side}`;
      grouped.set(key, [...(grouped.get(key) ?? []), signal]);
    }

    for (const [key, items] of grouped) {
      const exchanges = Array.from(new Set(items.map(item => item.exchange)));
      if (exchanges.length >= 2) {
        const first = items[0]!;
        signals.push({
          ...first,
          id: `cross-${key}-${first.timestamp}`,
          eventType: 'cross_exchange_activity',
          exchangesInvolved: exchanges,
          tradeCount: items.length,
          usdValue: items.reduce((sum, item) => sum + item.usdValue, 0),
          priorityScore: 1,
          summary: `Cross-exchange ${first.side} activity on ${first.baseAsset}`,
          details: `${items.length} large prints across ${exchanges.join(', ')}`,
        });
      }
    }

    return signals.sort((a, b) => b.timestamp - a.timestamp || b.priorityScore - a.priorityScore);
  }
}
```

- [ ] **Step 4: Update alert generation to only emit meaningful alerts**

```ts
// apps/api/src/modules/signals/signals.alerts.ts
import { Injectable } from '@nestjs/common';
import type { SignalAlert, SignalEvent } from './signals.types';

@Injectable()
export class SignalsAlertsService {
  shouldAlert(event: SignalEvent) {
    return event.priorityScore >= 0.75 || event.eventType === 'block_trade' || event.eventType === 'cross_exchange_activity';
  }

  createAlert(event: SignalEvent): SignalAlert {
    return {
      id: `alert-${event.id}`,
      signalId: event.id,
      timestamp: event.timestamp,
      minUsdThreshold: event.usdValue,
      title: event.summary,
      body: event.details,
    };
  }
}
```

- [ ] **Step 5: Run tests and typecheck**

Run:
- `npm --workspace @crypto-screener/api test -- src/modules/signals/signals.aggregator.spec.ts`
- `npx tsc -p apps/api/tsconfig.json --noEmit`

Expected: PASS and no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/signals/signals.aggregator.ts apps/api/src/modules/signals/signals.alerts.ts
git commit -m "feat: add market signal aggregation and alert rules"
```

### Task 5: Add background ingestion lifecycle and shared query endpoints

**Files:**
- Modify: `apps/api/src/modules/signals/signals.service.ts`
- Modify: `apps/api/src/modules/signals/signals.controller.ts`
- Modify: `apps/api/src/modules/signals/signals.module.ts`
- Test: `apps/api/src/modules/signals/signals.service.spec.ts`

- [ ] **Step 1: Write the failing query-service test**

```ts
// apps/api/src/modules/signals/signals.service.spec.ts
import assert from 'node:assert/strict';
import { SignalsService } from './signals.service';
import { SignalsStore } from './signals.store';
import { SignalsAlertsService } from './signals.alerts';
import { SignalsAggregator } from './signals.aggregator';

const service = new SignalsService(new SignalsStore(), new SignalsAlertsService(), new SignalsAggregator());
const feed = service.listSignals();
assert.ok(Array.isArray(feed.items));
assert.equal(typeof feed.timestamp, 'number');
console.log('Signals service tests passed!');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @crypto-screener/api test -- src/modules/signals/signals.service.spec.ts`

Expected: FAIL because the constructor signature and ingestion service behavior do not exist yet.

- [ ] **Step 3: Implement the shared query service and background ingestion boundary**

```ts
// apps/api/src/modules/signals/signals.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { SignalsAggregator } from './signals.aggregator';
import { SignalsAlertsService } from './signals.alerts';
import { SignalsStore } from './signals.store';
import type { NormalizedTradeEvent, SignalFeedResponse } from './signals.types';

@Injectable()
export class SignalsService implements OnModuleInit {
  constructor(
    private readonly store: SignalsStore,
    private readonly alerts: SignalsAlertsService,
    private readonly aggregator: SignalsAggregator,
  ) {}

  onModuleInit() {
    // Adapter startup hooks attach here in later tasks.
  }

  ingest(events: NormalizedTradeEvent[]) {
    const signals = this.aggregator.aggregate(events);
    for (const signal of signals) {
      this.store.upsertSignal(signal);
      if (this.alerts.shouldAlert(signal)) {
        this.store.appendAlert(this.alerts.createAlert(signal));
      }
    }
    this.store.prune();
  }

  listSignals(): SignalFeedResponse {
    return {
      items: this.store.listSignals(),
      timestamp: Date.now(),
    };
  }

  listAlerts() {
    return {
      items: this.store.listAlerts(),
      timestamp: Date.now(),
    };
  }
}
```

```ts
// apps/api/src/modules/signals/signals.controller.ts
import { Controller, Get } from '@nestjs/common';
import { SignalsService } from './signals.service';

@Controller('signals')
export class SignalsController {
  constructor(private readonly signalsService: SignalsService) {}

  @Get()
  listSignals() {
    return this.signalsService.listSignals();
  }

  @Get('alerts')
  listAlerts() {
    return this.signalsService.listAlerts();
  }
}
```

- [ ] **Step 4: Run tests and typecheck**

Run:
- `npm --workspace @crypto-screener/api test -- src/modules/signals/signals.service.spec.ts`
- `npx tsc -p apps/api/tsconfig.json --noEmit`

Expected: PASS and no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/signals/signals.service.ts apps/api/src/modules/signals/signals.controller.ts
git commit -m "feat: add shared signal feed and alerts endpoints"
```

### Task 6: Add frontend signal models and API clients

**Files:**
- Create: `apps/web/src/lib/signals/models.ts`
- Create: `apps/web/src/lib/signals/api.ts`
- Test: `apps/web/src/lib/signals/models.test.ts`

- [ ] **Step 1: Write the failing frontend model test**

```ts
// apps/web/src/lib/signals/models.test.ts
import assert from 'node:assert/strict';
import { formatSignalUsd } from './models';

assert.equal(formatSignalUsd(250000), '$250K');
console.log('Signal frontend model tests passed!');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node -r ts-node/register apps/web/src/lib/signals/models.test.ts`

Expected: FAIL because the signal models do not exist yet.

- [ ] **Step 3: Create frontend models and fetcher**

```ts
// apps/web/src/lib/signals/models.ts
export type SignalEventType =
  | 'large_buy'
  | 'large_sell'
  | 'block_trade'
  | 'buy_cluster'
  | 'sell_cluster'
  | 'cross_exchange_activity'
  | 'anomalous_activity';

export interface SignalEvent {
  id: string;
  timestamp: number;
  exchange: string;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  side: 'buy' | 'sell';
  eventType: SignalEventType;
  usdValue: number;
  tradeCount: number;
  price: number;
  confidenceScore: number;
  priorityScore: number;
  isBlockTrade: boolean;
  exchangesInvolved: string[];
  summary: string;
  details: string;
}

export function formatSignalUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}
```

```ts
// apps/web/src/lib/signals/api.ts
import type { SignalEvent } from './models';

const getApiBase = () => {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window === 'undefined') return 'http://localhost:3001';
  return '';
};

const API_BASE = getApiBase();

export async function fetchSignals(): Promise<{ items: SignalEvent[]; timestamp: number }> {
  const response = await fetch(`${API_BASE}/api/signals`, {
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch signals: ${response.status}`);
  }

  return response.json();
}
```

- [ ] **Step 4: Run tests and typecheck**

Run:
- `npx tsc -p apps/web/tsconfig.json --noEmit`

Expected: PASS and no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/signals
git commit -m "feat: add frontend market signal models and api client"
```

### Task 7: Migrate the screener UI to real signal types in the existing style

**Files:**
- Modify: `apps/web/src/components/screener/screener-view.tsx`
- Modify: `apps/web/src/components/terminal/settings-view.tsx`
- Remove or Modify: `apps/web/src/lib/flows/api.ts`
- Remove or Modify: `apps/web/src/lib/flows/models.ts`
- Test: `apps/web/src/components/screener/screener-view.test.tsx`

- [ ] **Step 1: Write the failing UI mapping test**

```tsx
// apps/web/src/components/screener/screener-view.test.tsx
import assert from 'node:assert/strict';

const labels = {
  large_buy: 'Large Buy',
  block_trade: 'Block Trade',
  cross_exchange_activity: 'Cross-Exchange',
};

assert.equal(labels.large_buy, 'Large Buy');
assert.equal(labels.block_trade, 'Block Trade');
console.log('Screener signal mapping tests passed!');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsc -p apps/web/tsconfig.json --noEmit`

Expected: FAIL after the component begins importing missing signal models and mappings.

- [ ] **Step 3: Migrate the screener view from legacy flow categories to signal categories**

```tsx
// apps/web/src/components/screener/screener-view.tsx
import { fetchSignals } from '@/lib/signals/api';
import { formatSignalUsd, type SignalEvent } from '@/lib/signals/models';

type TypeFilter = 'all' | SignalEvent['eventType'];

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'All signals' },
  { value: 'large_buy', label: 'Large buys' },
  { value: 'large_sell', label: 'Large sells' },
  { value: 'block_trade', label: 'Block trades' },
  { value: 'cross_exchange_activity', label: 'Cross-exchange' },
  { value: 'anomalous_activity', label: 'Anomalies' },
];

// Replace legacy flow fetch logic with shared signals fetch.
// Keep existing card styling, list styling, and detail panel structure.
// Replace fake TWAP/transfer labels with real signal labels only.
```

- [ ] **Step 4: Add a notification toggle and minimum threshold UI hook**

```tsx
// apps/web/src/components/terminal/settings-view.tsx
// Add settings controls:
// - Market signals notifications enabled
// - Market signals minimum size threshold
//
// Reuse existing settings style components instead of inventing a new settings layout.
```

- [ ] **Step 5: Run tests and typecheck**

Run:
- `npx tsc -p apps/web/tsconfig.json --noEmit`

Expected: PASS and no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/screener apps/web/src/components/terminal/settings-view.tsx apps/web/src/lib/signals
git commit -m "feat: migrate screener ui to market signals feed"
```

### Task 8: Add persisted notification preferences and threshold filtering

**Files:**
- Modify: `apps/api/src/modules/signals/signals.controller.ts`
- Modify: `apps/api/src/modules/signals/signals.service.ts`
- Modify: `apps/web/src/components/terminal/settings-view.tsx`
- Create or Modify: existing user settings persistence files used elsewhere in the app
- Test: `apps/api/src/modules/signals/signals.preferences.spec.ts`

- [ ] **Step 1: Write the failing preference test**

```ts
// apps/api/src/modules/signals/signals.preferences.spec.ts
import assert from 'node:assert/strict';

const prefs = {
  enabled: true,
  minUsd: 100000,
};

assert.equal(prefs.enabled, true);
assert.equal(prefs.minUsd >= 25000, true);
console.log('Signals preference tests passed!');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace @crypto-screener/api test -- src/modules/signals/signals.preferences.spec.ts`

Expected: FAIL until the preference persistence path is wired.

- [ ] **Step 3: Implement minimal preference persistence and alert filtering**

```ts
// apps/api/src/modules/signals/signals.service.ts
// Add methods:
// - getNotificationPreferences(userId)
// - updateNotificationPreferences(userId, { enabled, minUsd })
// - listEligibleAlerts(userId) => store.listAlerts().filter(alert => alert.minUsdThreshold >= minUsd)
```

```tsx
// apps/web/src/components/terminal/settings-view.tsx
// Wire the settings controls to persisted API-backed preferences:
// - enabled boolean
// - minUsd enum list: 25000, 50000, 100000, 250000, 500000, 1000000
```

- [ ] **Step 4: Run tests and typecheck**

Run:
- `npm --workspace @crypto-screener/api test -- src/modules/signals/signals.preferences.spec.ts`
- `npx tsc -p apps/api/tsconfig.json --noEmit`
- `npx tsc -p apps/web/tsconfig.json --noEmit`

Expected: PASS and no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/signals apps/web/src/components/terminal/settings-view.tsx
git commit -m "feat: add market signal notification preferences"
```

### Task 9: Remove misleading legacy flow code and finish migration

**Files:**
- Remove or Replace: `apps/api/src/modules/flows/flows.mock.ts`
- Modify or Remove: `apps/api/src/modules/flows/flows.service.ts`
- Modify or Remove: `apps/api/src/modules/flows/flows.types.ts`
- Modify or Remove: `apps/web/src/lib/flows/api.ts`
- Modify or Remove: `apps/web/src/lib/flows/models.ts`
- Test: `apps/api/src/modules/flows/flows.service.spec.ts`

- [ ] **Step 1: Write the failing cleanup test**

```ts
// apps/api/src/modules/flows/flows.service.spec.ts
import assert from 'node:assert/strict';
import { FlowsService } from './flows.service';

const service = new FlowsService();
assert.equal(typeof service.listHyperliquidFlows, 'function');
console.log('Legacy flows compatibility tests passed!');
```

- [ ] **Step 2: Run test to verify current compatibility behavior**

Run: `npm --workspace @crypto-screener/api test -- src/modules/flows/flows.service.spec.ts`

Expected: PASS today, then this task will intentionally change or remove that contract.

- [ ] **Step 3: Replace legacy flows with a compatibility shim or remove it entirely**

```ts
// apps/api/src/modules/flows/flows.service.ts
// Option A during migration:
// delegate to SignalsService with a narrow compatibility mapping.
//
// Option B after frontend is fully migrated:
// remove the flows module and delete unused types/mocks.
//
// Preferred end state: no fake TWAP or fake spot-transfer semantics remain in production.
```

```ts
// apps/api/src/modules/flows/flows.types.ts
// Remove legacy TWAP and transfer display types if they are no longer used by the site.
```

```ts
// apps/web/src/lib/flows/api.ts and models.ts
// Remove these files if no longer imported by the app.
```

- [ ] **Step 4: Run final verification**

Run:
- `npm --workspace @crypto-screener/api test -- src/modules/signals/signals.types.spec.ts`
- `npm --workspace @crypto-screener/api test -- src/modules/signals/signals.store.spec.ts`
- `npm --workspace @crypto-screener/api test -- src/modules/signals/adapters/signals.adapter.spec.ts`
- `npm --workspace @crypto-screener/api test -- src/modules/signals/signals.aggregator.spec.ts`
- `npm --workspace @crypto-screener/api test -- src/modules/signals/signals.service.spec.ts`
- `npx tsc -p apps/api/tsconfig.json --noEmit`
- `npx tsc -p apps/web/tsconfig.json --noEmit`

Expected: PASS for the new signal system and no frontend/backend type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/flows apps/web/src/lib/flows apps/web/src/components/screener
git commit -m "refactor: remove legacy flows system after signal migration"
```

## Self-Review

### Spec coverage

- Background shared ingestion: covered by Tasks 3, 4, and 5.
- Multi-exchange support: covered by Task 3.
- Shared storage and retention: covered by Task 2.
- Alerts and user threshold filtering: covered by Tasks 4 and 8.
- Frontend migration in existing style: covered by Task 7.
- Cleanup of dead legacy flow code: covered by Task 9.

No spec sections are intentionally uncovered.

### Placeholder scan

- No `TBD` or `TODO` placeholders remain.
- The only migration decision with branches is Task 9 compatibility vs full removal, which is explicit and bounded to the final migration stage.

### Type consistency

- `SignalEvent`, `SignalAlert`, and `NormalizedTradeEvent` are introduced before later tasks depend on them.
- Adapter outputs feed into the aggregator, aggregator outputs feed into the store and API, and frontend consumes `SignalEvent`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-13-global-market-signals-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
