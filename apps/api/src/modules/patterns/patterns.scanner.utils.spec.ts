import assert from 'node:assert/strict';
import { selectSymbolsForScan } from './patterns.scanner.utils';

const tickers = [
  { exchange: 'binance', marketType: 'futures', symbol: 'C/USDT:USDT', volume24h: 300 },
  { exchange: 'binance', marketType: 'futures', symbol: 'A/USDT:USDT', volume24h: 500 },
  { exchange: 'binance', marketType: 'futures', symbol: 'B/USDT:USDT', volume24h: 400 },
  { exchange: 'binance', marketType: 'spot', symbol: 'SPOT/USDT', volume24h: 999 },
  { exchange: 'bybit', marketType: 'futures', symbol: 'OTHER/USDT:USDT', volume24h: 999 },
] as const;

assert.deepEqual(selectSymbolsForScan(tickers as never, 2, 0), ['A/USDT:USDT', 'B/USDT:USDT']);
assert.deepEqual(selectSymbolsForScan(tickers as never, 2, 1), ['C/USDT:USDT', 'A/USDT:USDT']);
assert.deepEqual(selectSymbolsForScan(tickers as never, 10, 0), ['A/USDT:USDT', 'B/USDT:USDT', 'C/USDT:USDT']);
