export const DRAWING_KINDS = [
  'horizontal_line',
  'signal_level',
  'trendline',
  'vertical_line',
  'rectangle',
  'ruler',
] as const;

export type DrawingKind = (typeof DRAWING_KINDS)[number];
export type DrawingTool = 'cursor' | 'delete' | DrawingKind;
export type InstrumentMarketType = 'spot' | 'futures';

export interface InstrumentRef {
  exchange: string;
  marketType: InstrumentMarketType;
  symbol: string;
}

export interface DrawingPoint {
  time: number;
  price: number;
  futureOffset?: number;
}

export interface DrawingStyle {
  color: string;
  lineWidth: number;
  lineStyle: 'solid' | 'dashed' | 'dotted';
  fillOpacity: number;
}

export interface DrawingBase extends InstrumentRef {
  id: string;
  kind: DrawingKind;
  instrumentKey: string;
  visible: boolean;
  locked: boolean;
  zIndex: number;
  createdAt: number;
  updatedAt: number;
  style: DrawingStyle;
}

export interface HorizontalLineDrawing extends DrawingBase {
  kind: 'horizontal_line';
  price: number;
}

export interface SignalLevelDrawing extends DrawingBase {
  kind: 'signal_level';
  price: number;
  triggered: boolean;
  triggeredAt: number | null;
  armed: boolean;
}

export interface TrendlineDrawing extends DrawingBase {
  kind: 'trendline';
  p1: DrawingPoint;
  p2: DrawingPoint;
}

export interface VerticalLineDrawing extends DrawingBase {
  kind: 'vertical_line';
  time: number;
}

export interface RectangleDrawing extends DrawingBase {
  kind: 'rectangle';
  p1: DrawingPoint;
  p2: DrawingPoint;
}

export interface RulerDrawing extends DrawingBase {
  kind: 'ruler';
  p1: DrawingPoint;
  p2: DrawingPoint;
}

export type AnyDrawing =
  | HorizontalLineDrawing
  | SignalLevelDrawing
  | TrendlineDrawing
  | VerticalLineDrawing
  | RectangleDrawing
  | RulerDrawing;

export const DRAWING_OPERATION_TYPES = [
  'create',
  'update',
  'delete',
  'reset',
  'visibility',
] as const;

export type DrawingOperationType = (typeof DRAWING_OPERATION_TYPES)[number];

export type DrawingOperationPayload =
  | { type: 'create'; drawing: AnyDrawing; instrumentKey: string }
  | { type: 'update'; drawing: AnyDrawing; instrumentKey: string }
  | { type: 'delete'; drawingId: string; instrumentKey: string }
  | { type: 'reset'; drawingId: string; instrumentKey: string }
  | { type: 'visibility'; hidden: boolean; instrumentKey: string };

export type DrawingOperationEvent = DrawingOperationPayload & {
  origin: string;
  occurredAt: number;
};

export function makeInstrumentKey(exchange: string, marketType: string, symbol: string): string {
  return `${exchange}:${marketType}:${symbol}`;
}

export function makeInstrumentKeyFromRef(instrument: InstrumentRef): string {
  return makeInstrumentKey(instrument.exchange, instrument.marketType, instrument.symbol);
}

export function isDrawingKind(value: string): value is DrawingKind {
  return DRAWING_KINDS.includes(value as DrawingKind);
}

export function isDrawingOperationType(value: string): value is DrawingOperationType {
  return DRAWING_OPERATION_TYPES.includes(value as DrawingOperationType);
}
