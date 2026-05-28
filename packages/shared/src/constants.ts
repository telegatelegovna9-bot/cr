// Constants for the crypto screener

import type { ExchangeId, ExchangeConfig } from './types';

export const EXCHANGE_CONFIGS: Record<ExchangeId, ExchangeConfig> = {
  binance: {
    id: 'binance',
    name: 'Binance',
    wsUrl: 'wss://stream.binance.com:9443/ws',
    restUrl: 'https://api.binance.com',
    rateLimit: 1200,
    enabled: true,
  },
  bybit: {
    id: 'bybit',
    name: 'Bybit',
    wsUrl: 'wss://stream.bybit.com/v5/public/linear',
    restUrl: 'https://api.bybit.com',
    rateLimit: 600,
    enabled: true,
  },
  okx: {
    id: 'okx',
    name: 'OKX',
    wsUrl: 'wss://ws.okx.com:8443/ws/v5/public',
    restUrl: 'https://www.okx.com',
    rateLimit: 600,
    enabled: true,
  },
  kucoin: {
    id: 'kucoin',
    name: 'KuCoin',
    wsUrl: 'wss://ws-api-spot.kucoin.com',
    restUrl: 'https://api.kucoin.com',
    rateLimit: 400,
    enabled: true,
  },
  bitget: {
    id: 'bitget',
    name: 'Bitget',
    wsUrl: 'wss://ws.bitget.com/spot/v1/stream',
    restUrl: 'https://api.bitget.com',
    rateLimit: 600,
    enabled: true,
  },
  gate: {
    id: 'gate',
    name: 'Gate.io',
    wsUrl: 'wss://api.gateio.ws/ws/v4/',
    restUrl: 'https://api.gateio.ws',
    rateLimit: 300,
    enabled: true,
  },
  mexc: {
    id: 'mexc',
    name: 'MEXC',
    wsUrl: 'wss://wbs.mexc.com/ws',
    restUrl: 'https://api.mexc.com',
    rateLimit: 600,
    enabled: true,
  },
  hyperliquid: {
    id: 'hyperliquid',
    name: 'Hyperliquid',
    wsUrl: 'wss://api.hyperliquid.xyz/ws',
    restUrl: 'https://api.hyperliquid.xyz',
    rateLimit: 600,
    enabled: true,
  },
  coinbase: {
    id: 'coinbase',
    name: 'Coinbase',
    wsUrl: 'wss://ws-feed.exchange.coinbase.com',
    restUrl: 'https://api.exchange.coinbase.com',
    rateLimit: 100,
    enabled: true,
  },
};

export const DEFAULT_SYMBOLS = [
  'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT',
  'DOGE/USDT', 'ADA/USDT', 'AVAX/USDT', 'DOT/USDT', 'LINK/USDT',
  'MATIC/USDT', 'UNI/USDT', 'ATOM/USDT', 'LTC/USDT', 'ETC/USDT',
  'FIL/USDT', 'APT/USDT', 'ARB/USDT', 'OP/USDT', 'INJ/USDT',
  'SUI/USDT', 'SEI/USDT', 'TIA/USDT', 'JUP/USDT', 'WIF/USDT',
  'PEPE/USDT', 'FLOKI/USDT', 'BONK/USDT', 'SHIB/USDT', '1000SATS/USDT',
];

export const WS_RECONNECT_DELAY = 5000;
export const WS_MAX_RECONNECT_ATTEMPTS = 20;
export const WS_HEARTBEAT_INTERVAL = 30000;
export const WS_STABILITY_THRESHOLD = 30000; // ms before resetting reconnect counter

export const CANDLE_CHUNK_SIZE = 500;
export const MAX_CANDLES_IN_MEMORY = 5000;

export const ORDERBOOK_DEPTH = 50;
export const TRADES_BUFFER_SIZE = 100;

export const ALERT_COOLDOWN_MS = 60_000; // 1 minute cooldown between same alerts
export const VOLUME_SPIKE_THRESHOLD = 3; // 3x average
export const VOLATILITY_SPIKE_THRESHOLD = 2; // 2x average

export const SCREENER_DEFAULT_PAGE_SIZE = 50;
export const SCREENER_MAX_PAGE_SIZE = 200;
