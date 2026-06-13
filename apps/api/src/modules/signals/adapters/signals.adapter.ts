import type { NormalizedTradeEvent, SignalExchange } from '../signals.types';

export interface SignalsAdapter {
  readonly exchange: SignalExchange;
  normalize(input: unknown): NormalizedTradeEvent | null;
}
