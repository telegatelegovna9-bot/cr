export type PatternKind = 
  | 'cascade' 
  | 'trendline' 
  | 'triangle' 
  | 'triangle_symmetrical' 
  | 'triangle_ascending' 
  | 'triangle_descending'
  | 'channel_up'
  | 'channel_down';

export type PatternStatus = 'forming' | 'confirmed' | 'finished';
export type PatternTimeframe = '5m' | '15m' | '1h';

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

export interface PatternListItem {
  id: string;
  symbol: string;
  timeframe: PatternTimeframe;
  kind: PatternKind;
  status: PatternStatus;
  quality: number;
  updatedAt: number;
  exchange?: 'binance';
  marketType?: 'futures';
  geometry?: PatternGeometry;
  detectedAt?: number;
  finishedAt?: number | null;
  expiresAt?: number | null;
}

export interface PatternDetail extends PatternListItem {
  exchange: 'binance';
  marketType: 'futures';
  geometry: PatternGeometry;
  detectedAt: number;
  finishedAt: number | null;
  expiresAt: number | null;
}

export interface PatternFilters {
  kinds: PatternKind[];
  timeframes: PatternTimeframe[];
  statuses: PatternStatus[];
}

export interface PatternsPage {
  items: PatternListItem[];
  hasMore: boolean;
  nextCursor: number | null;
}

export interface PatternsUIState {
  search: string;
  selectedPatternId: string | null;
  filters: PatternFilters;
}

export const DEFAULT_PATTERNS_UI_STATE: PatternsUIState = {
  search: '',
  selectedPatternId: null,
  filters: {
    kinds: [],
    timeframes: [],
    statuses: [],
  },
};
