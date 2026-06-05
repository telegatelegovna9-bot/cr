import type { Candle } from '@crypto-screener/shared';
import type {
  PatternGeometry,
  PatternKind,
  PatternStatus,
  PatternTimeframe,
} from '../patterns.types';

export type DetectorCandle = Pick<
  Candle,
  'time' | 'open' | 'high' | 'low' | 'close' | 'volume'
>;

export interface DetectorPivotCandle extends DetectorCandle {
  index: number;
}

export interface PatternCandidate {
  id: string;
  exchange: 'binance';
  marketType: 'futures';
  symbol: string;
  timeframe: PatternTimeframe;
  kind: PatternKind;
  status: PatternStatus;
  quality: number;
  geometry: PatternGeometry;
  from: number;
  to: number;
}

export type PatternDetector = (
  symbol: string,
  timeframe: PatternTimeframe,
  candles: DetectorCandle[],
) => PatternCandidate[];
