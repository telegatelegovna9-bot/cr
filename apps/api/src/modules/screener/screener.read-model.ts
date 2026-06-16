import { Injectable } from '@nestjs/common';
import type { ScreenerDetectorType, ScreenerEvent } from '@crypto-screener/shared';
import type { ScreenerSummary } from './screener.types';

type ScreenerSnapshot = {
  bestSetups: ScreenerEvent[];
  spotEvents: ScreenerEvent[];
  futuresEvents: ScreenerEvent[];
  summary: ScreenerSummary;
};

export interface ScreenerEventListItem extends ScreenerEvent {
  setupLabel: string;
  freshnessMs: number;
}

export interface ScreenerEventDetailItem extends ScreenerEventListItem {
  whatChanged: string;
  whyFlagged: string;
  marketContext: Array<{
    key: string;
    label: string;
    value: number | string | null;
  }>;
}

export interface ScreenerEventListResponse {
  items: ScreenerEventListItem[];
  timestamp: number;
}

export interface ScreenerEventDetailResponse {
  item: ScreenerEventDetailItem | null;
  timestamp: number;
}

export interface ScreenerEventCounts {
  bestSetupsCount: number;
  spotCount: number;
  futuresCount: number;
  rareCount: number;
}

export interface ScreenerCompatibleSummary extends ScreenerSummary {
  eventCounts: ScreenerEventCounts;
}

export interface ScreenerCompatibleSummaryResponse {
  summary: ScreenerCompatibleSummary;
  timestamp: number;
}

const DETECTOR_LABELS: Record<ScreenerDetectorType, string> = {
  'spot-breakout-pressure': 'Breakout Pressure',
  'spot-cross-exchange': 'Cross-Exchange Divergence',
  'futures-oi-build': 'OI Build Pressure',
  'futures-squeeze-risk': 'Squeeze Risk',
};

const METRIC_LABELS: Record<string, string> = {
  breakoutRetentionMs: 'Breakout retention',
  breakoutReferencePrice: 'Breakout reference price',
  compressionPct: 'Compression',
  deviationBps: 'Deviation',
  exchangeCount: 'Exchange count',
  lastPrice: 'Last price',
  medianPrice: 'Median price',
  openInterestChangePct: 'Open interest change',
  openInterestNow: 'Open interest',
  outlierPrice: 'Outlier price',
  priceChange5m: 'Price change 5m',
  takerBuyRatio: 'Taker buy ratio',
  volumeNow: 'Rolling quote volume',
  volumeSpikeRatio: 'Volume spike ratio',
};

function promotionPriority(event: ScreenerEvent): number {
  switch (event.promotionTier) {
    case 'rare':
      return 3;
    case 'actionable':
      return 2;
    case 'watch':
      return 1;
    case 'ignore':
      return 0;
  }
}

function strengthPriority(event: ScreenerEvent): number {
  switch (event.strengthTier) {
    case 'event-live':
      return 3;
    case 'high-risk':
      return 2;
    case 'actionable':
      return 1;
    case 'watching':
      return 0;
  }
}

function compareEvents(a: ScreenerEvent, b: ScreenerEvent): number {
  return (
    promotionPriority(b) - promotionPriority(a)
    || strengthPriority(b) - strengthPriority(a)
    || b.updatedAt - a.updatedAt
    || a.symbol.localeCompare(b.symbol)
    || a.detectorType.localeCompare(b.detectorType)
  );
}

function metricLabel(key: string): string {
  return METRIC_LABELS[key] ?? key;
}

@Injectable()
export class ScreenerReadModel {
  toBestSetupsResponse(snapshot: ScreenerSnapshot, now = Date.now()): ScreenerEventListResponse {
    return this.toListResponse(snapshot.bestSetups, now);
  }

  toSpotResponse(snapshot: ScreenerSnapshot, now = Date.now()): ScreenerEventListResponse {
    return this.toListResponse(snapshot.spotEvents, now);
  }

  toFuturesResponse(snapshot: ScreenerSnapshot, now = Date.now()): ScreenerEventListResponse {
    return this.toListResponse(snapshot.futuresEvents, now);
  }

  toDetailResponse(snapshot: ScreenerSnapshot, id: string, now = Date.now()): ScreenerEventDetailResponse {
    const event = this.getUniqueEvents(snapshot).find(candidate => candidate.id === id) ?? null;

    return {
      item: event ? this.toDetailItem(event, now) : null,
      timestamp: now,
    };
  }

  toSummaryResponse(snapshot: ScreenerSnapshot, now = Date.now()): ScreenerCompatibleSummaryResponse {
    return {
      summary: {
        ...snapshot.summary,
        eventCounts: this.toEventCounts(snapshot),
      },
      timestamp: now,
    };
  }

  private toListResponse(events: ScreenerEvent[], now: number): ScreenerEventListResponse {
    return {
      items: [...events].sort(compareEvents).map(event => this.toListItem(event, now)),
      timestamp: now,
    };
  }

  private toListItem(event: ScreenerEvent, now: number): ScreenerEventListItem {
    return {
      ...event,
      setupLabel: DETECTOR_LABELS[event.detectorType],
      freshnessMs: Math.max(0, now - event.updatedAt),
    };
  }

  private toDetailItem(event: ScreenerEvent, now: number): ScreenerEventDetailItem {
    return {
      ...this.toListItem(event, now),
      whatChanged: event.headline,
      whyFlagged: event.reason,
      marketContext: Object.entries(event.supportingMetrics).map(([key, value]) => ({
        key,
        label: metricLabel(key),
        value,
      })),
    };
  }

  private toEventCounts(snapshot: ScreenerSnapshot): ScreenerEventCounts {
    return {
      bestSetupsCount: snapshot.bestSetups.length,
      spotCount: snapshot.spotEvents.length,
      futuresCount: snapshot.futuresEvents.length,
      rareCount: snapshot.bestSetups.filter(event => event.promotionTier === 'rare').length,
    };
  }

  private getUniqueEvents(snapshot: ScreenerSnapshot): ScreenerEvent[] {
    const events = new Map<string, ScreenerEvent>();

    for (const event of [...snapshot.bestSetups, ...snapshot.spotEvents, ...snapshot.futuresEvents]) {
      const current = events.get(event.id);
      if (!current || compareEvents(event, current) < 0) {
        events.set(event.id, event);
      }
    }

    return [...events.values()];
  }
}
