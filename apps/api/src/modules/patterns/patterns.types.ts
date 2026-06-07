export type PatternKind =
  | 'breakout'
  | 'retest'
  | 'structure_break'
  | 'liquidity_sweep';
export type PatternStatus = 'forming' | 'confirmed' | 'finished';
export type PatternTimeframe = '15m' | '1h';

export interface PatternPoint {
  time: number;
  price: number;
}

export interface PatternLine {
  kind: 'segment' | 'ray';
  points: [PatternPoint, PatternPoint];
}

export interface PatternZone {
  fromTime: number;
  toTime: number;
  low: number;
  high: number;
}

export interface PatternGeometry {
  anchorTimeFrom: number;
  anchorTimeTo: number;
  priceMin: number;
  priceMax: number;
  pivots: PatternPoint[];
  lines: PatternLine[];
  zones: PatternZone[];
}

export interface PersistedPatternPayload {
  id: string;
  exchange: 'binance';
  marketType: 'futures';
  symbol: string;
  timeframe: PatternTimeframe;
  kind: PatternKind;
  status: PatternStatus;
  quality: number;
  geometry: PatternGeometry;
  detectedAt: number;
  updatedAt: number;
  finishedAt: number | null;
  expiresAt: number | null;
}

export const PATTERN_SCAN_TIMEFRAMES: PatternTimeframe[] = ['15m', '1h'];
export const PATTERN_FINISHED_RETENTION_MINUTES = 15;
