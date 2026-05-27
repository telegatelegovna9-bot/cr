// Generic REST-based exchange connector for exchanges without full WS implementation
// Supports: KuCoin, Bitget, Gate, MEXC, Hyperliquid, Coinbase

import type { Ticker, Candle, Timeframe, OrderBook, Trade, ExchangeId } from '@crypto-screener/shared';
import { normalizeSymbol, toExchangeSymbol, generateId } from '@crypto-screener/shared';
import { BaseExchangeConnector } from './base';

interface ExchangeEndpoints {
  tickers: string;
  candles: string | ((symbol: string, tf: string) => string);
  orderbook: string | ((symbol: string) => string);
  parseTicker: (data: Record<string, unknown>, symbol: string) => Ticker | Ticker[];
  parseCandles: (data: unknown) => Candle[];
  parseOrderBook: (data: unknown, symbol: string) => OrderBook;
}

const EXCHANGE_ENDPOINTS: Partial<Record<ExchangeId, ExchangeEndpoints>> = {
  kucoin: {
    tickers: '/api/v1/market/allTickers',
    candles: (symbol: string, tf: string) => `/api/v1/market/candles?type=${tf}&symbol=${symbol}`,
    orderbook: (symbol: string) => `/api/v1/market/orderbook/level2_20?symbol=${symbol}`,
    parseTicker: (data, symbol) => {
      const d = data as unknown as { data: { ticker: Record<string, unknown>[] } };
      const t = d.data.ticker.find((x: Record<string, unknown>) => x.symbol === symbol);
      if (!t) throw new Error('Symbol not found');
      const price = parseFloat(t.last as string);
      const change = parseFloat(t.changeRate as string) * 100;
      return {
        symbol: normalizeSymbol(symbol, 'kucoin'),
        exchange: 'kucoin',
        price,
        priceChange24h: price * (change / 100),
        priceChangePercent24h: change,
        high24h: parseFloat(t.high as string),
        low24h: parseFloat(t.low as string),
        volume24h: parseFloat(t.vol as string),
        quoteVolume24h: parseFloat(t.volValue as string),
        trades24h: 0,
        bid: price * 0.999,
        ask: price * 1.001,
        spread: price * 0.002,
        lastUpdate: Date.now(),
      };
    },
    parseCandles: (data) => {
      const d = data as { data: string[][] };
      return d.data.map((k): Candle => ({
        timestamp: parseInt(k[0], 10) * 1000,
        open: parseFloat(k[1]),
        close: parseFloat(k[2]),
        high: parseFloat(k[3]),
        low: parseFloat(k[4]),
        volume: parseFloat(k[5]),
        trades: 0,
      }));
    },
    parseOrderBook: (data, symbol) => {
      const d = data as { data: { bids: [string, string, string][]; asks: [string, string, string][] } };
      return {
        symbol,
        exchange: 'kucoin',
        bids: d.data.bids.slice(0, 20).map(([p, q]) => ({ price: parseFloat(p), quantity: parseFloat(q) })),
        asks: d.data.asks.slice(0, 20).map(([p, q]) => ({ price: parseFloat(p), quantity: parseFloat(q) })),
        timestamp: Date.now(),
      };
    },
  },
  bitget: {
    tickers: '/api/v2/spot/market/tickers',
    candles: (symbol: string, tf: string) => `/api/v2/spot/market/candles?symbol=${symbol}&granularity=${tf}`,
    orderbook: (symbol: string) => `/api/v2/spot/market/orderbook?symbol=${symbol}&limit=50`,
    parseTicker: (data, symbol) => {
      const d = data as { data: Record<string, unknown>[] };
      const t = d.data.find((x: Record<string, unknown>) => x.symbol === symbol);
      if (!t) throw new Error('Symbol not found');
      return {
        symbol: normalizeSymbol(symbol, 'bitget'),
        exchange: 'bitget',
        price: parseFloat(t.lastPr as string),
        priceChange24h: parseFloat(t.change24h as string),
        priceChangePercent24h: parseFloat(t.change24h as string) / parseFloat(t.open24h as string) * 100,
        high24h: parseFloat(t.high24h as string),
        low24h: parseFloat(t.low24h as string),
        volume24h: parseFloat(t.baseVolume as string),
        quoteVolume24h: parseFloat(t.quoteVolume as string),
        trades24h: 0,
        bid: parseFloat(t.bestBid as string),
        ask: parseFloat(t.bestAsk as string),
        spread: parseFloat(t.bestAsk as string) - parseFloat(t.bestBid as string),
        lastUpdate: Date.now(),
      };
    },
    parseCandles: (data) => {
      const d = data as { data: string[][] };
      return d.data.map((k): Candle => ({
        timestamp: parseInt(k[0], 10),
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
        trades: 0,
      }));
    },
    parseOrderBook: (data, symbol) => {
      const d = data as { data: { bids: [string, string][]; asks: [string, string][] } };
      return {
        symbol,
        exchange: 'bitget',
        bids: d.data.bids.map(([p, q]) => ({ price: parseFloat(p), quantity: parseFloat(q) })),
        asks: d.data.asks.map(([p, q]) => ({ price: parseFloat(p), quantity: parseFloat(q) })),
        timestamp: Date.now(),
      };
    },
  },
  gate: {
    tickers: '/api/v4/spot/tickers',
    candles: (symbol: string, tf: string) => `/api/v4/spot/candlesticks?currency_pair=${symbol}&interval=${tf}`,
    orderbook: (symbol: string) => `/api/v4/spot/order_book?currency_pair=${symbol}&limit=50`,
    parseTicker: (data, symbol) => {
      const d = (data as unknown) as Record<string, unknown>[];
      const t = d.find((x: Record<string, unknown>) => x.currency_pair === symbol);
      if (!t) throw new Error('Symbol not found');
      return {
        symbol: normalizeSymbol(symbol, 'gate'),
        exchange: 'gate',
        price: parseFloat(t.last as string),
        priceChange24h: parseFloat(t.last as string) - parseFloat(t.open24h as string),
        priceChangePercent24h: ((parseFloat(t.last as string) - parseFloat(t.open24h as string)) / parseFloat(t.open24h as string)) * 100,
        high24h: parseFloat(t.high_24h as string),
        low24h: parseFloat(t.low_24h as string),
        volume24h: parseFloat(t.base_volume as string),
        quoteVolume24h: parseFloat(t.quote_volume as string),
        trades24h: 0,
        bid: parseFloat(t.highest_bid as string),
        ask: parseFloat(t.lowest_ask as string),
        spread: parseFloat(t.lowest_ask as string) - parseFloat(t.highest_bid as string),
        lastUpdate: Date.now(),
      };
    },
    parseCandles: (data) => {
      const d = data as [string, string, string, string, string, string][];
      return d.map((k): Candle => ({
        timestamp: parseInt(k[0], 10) * 1000,
        open: parseFloat(k[5]),
        close: parseFloat(k[2]),
        high: parseFloat(k[3]),
        low: parseFloat(k[4]),
        volume: parseFloat(k[1]),
        trades: 0,
      }));
    },
    parseOrderBook: (data, symbol) => {
      const d = data as { bids: [string, string][]; asks: [string, string][] };
      return {
        symbol,
        exchange: 'gate',
        bids: d.bids.map(([p, q]) => ({ price: parseFloat(p), quantity: parseFloat(q) })),
        asks: d.asks.map(([p, q]) => ({ price: parseFloat(p), quantity: parseFloat(q) })),
        timestamp: Date.now(),
      };
    },
  },
  mexc: {
    tickers: '/api/v3/ticker/24hr',
    candles: (symbol: string, tf: string) => `/api/v3/klines?symbol=${symbol}&interval=${tf}`,
    orderbook: (symbol: string) => `/api/v3/depth?symbol=${symbol}&limit=50`,
    parseTicker: (data, symbol) => {
      const d = (data as unknown) as Record<string, unknown>[];
      const t = d.find((x: Record<string, unknown>) => x.symbol === symbol);
      if (!t) throw new Error('Symbol not found');
      return {
        symbol: normalizeSymbol(symbol, 'mexc'),
        exchange: 'mexc',
        price: parseFloat(t.lastPrice as string),
        priceChange24h: parseFloat(t.priceChange as string),
        priceChangePercent24h: parseFloat(t.priceChangePercent as string),
        high24h: parseFloat(t.highPrice as string),
        low24h: parseFloat(t.lowPrice as string),
        volume24h: parseFloat(t.volume as string),
        quoteVolume24h: parseFloat(t.quoteVolume as string),
        trades24h: parseInt(t.count as string, 10),
        bid: parseFloat(t.bidPrice as string),
        ask: parseFloat(t.askPrice as string),
        spread: parseFloat(t.askPrice as string) - parseFloat(t.bidPrice as string),
        lastUpdate: Date.now(),
      };
    },
    parseCandles: (data) => {
      const d = data as unknown[][];
      return d.map((k): Candle => ({
        timestamp: k[0] as number,
        open: parseFloat(k[1] as string),
        high: parseFloat(k[2] as string),
        low: parseFloat(k[3] as string),
        close: parseFloat(k[4] as string),
        volume: parseFloat(k[5] as string),
        trades: 0,
      }));
    },
    parseOrderBook: (data, symbol) => {
      const d = data as { bids: [string, string][]; asks: [string, string][] };
      return {
        symbol,
        exchange: 'mexc',
        bids: d.bids.map(([p, q]) => ({ price: parseFloat(p), quantity: parseFloat(q) })),
        asks: d.asks.map(([p, q]) => ({ price: parseFloat(p), quantity: parseFloat(q) })),
        timestamp: Date.now(),
      };
    },
  },
  coinbase: {
    tickers: '/products',
    candles: (symbol: string, tf: string) => `/products/${symbol}/candles?granularity=${tf}`,
    orderbook: (symbol: string) => `/products/${symbol}/book?level=2`,
    parseTicker: (data, symbol) => {
      const d = (data as unknown) as Record<string, unknown>[];
      const t = d.find((x: Record<string, unknown>) => x.id === symbol);
      if (!t) throw new Error('Symbol not found');
      const price = parseFloat(t.price as string);
      return {
        symbol: normalizeSymbol(symbol, 'coinbase'),
        exchange: 'coinbase',
        price,
        priceChange24h: 0,
        priceChangePercent24h: 0,
        high24h: parseFloat(t.high_24h as string || '0'),
        low24h: parseFloat(t.low_24h as string || '0'),
        volume24h: parseFloat(t.volume_24h as string || '0'),
        quoteVolume24h: 0,
        trades24h: 0,
        bid: price * 0.999,
        ask: price * 1.001,
        spread: price * 0.002,
        lastUpdate: Date.now(),
      };
    },
    parseCandles: (data) => {
      const d = data as unknown[][];
      return d.map((k): Candle => ({
        timestamp: (k[0] as number) * 1000,
        open: parseFloat(k[3] as string),
        high: parseFloat(k[2] as string),
        low: parseFloat(k[1] as string),
        close: parseFloat(k[4] as string),
        volume: parseFloat(k[5] as string),
        trades: 0,
      }));
    },
    parseOrderBook: (data, symbol) => {
      const d = data as { bids: [string, string, number][]; asks: [string, string, number][] };
      return {
        symbol,
        exchange: 'coinbase',
        bids: d.bids.slice(0, 50).map(([p, q]) => ({ price: parseFloat(p), quantity: parseFloat(q) })),
        asks: d.asks.slice(0, 50).map(([p, q]) => ({ price: parseFloat(p), quantity: parseFloat(q) })),
        timestamp: Date.now(),
      };
    },
  },
  hyperliquid: {
    tickers: '/info',
    candles: () => '/info',
    orderbook: () => '/info',
    parseTicker: (data) => {
      const d = data as { universe: { name: string }[]; mids: string[] };
      return d.universe.map((u, i): Ticker => ({
        symbol: `${u.name}/USDC`,
        exchange: 'hyperliquid',
        price: parseFloat(d.mids[i]),
        priceChange24h: 0,
        priceChangePercent24h: 0,
        high24h: 0,
        low24h: 0,
        volume24h: 0,
        quoteVolume24h: 0,
        trades24h: 0,
        bid: parseFloat(d.mids[i]) * 0.999,
        ask: parseFloat(d.mids[i]) * 1.001,
        spread: parseFloat(d.mids[i]) * 0.002,
        lastUpdate: Date.now(),
      }));
    },
    parseCandles: () => [],
    parseOrderBook: () => ({
      symbol: '',
      exchange: 'hyperliquid' as const,
      bids: [],
      asks: [],
      timestamp: Date.now(),
    }),
  },
};

const KUCOIN_TF_MAP: Record<Timeframe, string> = {
  '1m': '1min', '5m': '5min', '15m': '15min', '1h': '1hour', '4h': '4hour', '1d': '1day', '1w': '1week',
};

const GENERIC_TF_MAP: Record<Timeframe, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w',
};

const GATE_TF_MAP: Record<Timeframe, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '7d',
};

const COINBASE_TF_MAP: Record<Timeframe, string> = {
  '1m': '60', '5m': '300', '15m': '900', '1h': '3600', '4h': '14400', '1d': '86400', '1w': '604800',
};

export class GenericExchangeConnector extends BaseExchangeConnector {
  private endpoints: ExchangeEndpoints;
  private tfMap: Record<Timeframe, string>;

  constructor(exchangeId: ExchangeId) {
    const config: Record<ExchangeId, { wsUrl: string; restUrl: string; rateLimit: number }> = {
      kucoin: { wsUrl: '', restUrl: 'https://api.kucoin.com', rateLimit: 400 },
      bitget: { wsUrl: '', restUrl: 'https://api.bitget.com', rateLimit: 600 },
      gate: { wsUrl: '', restUrl: 'https://api.gateio.ws', rateLimit: 300 },
      mexc: { wsUrl: '', restUrl: 'https://api.mexc.com', rateLimit: 600 },
      coinbase: { wsUrl: '', restUrl: 'https://api.exchange.coinbase.com', rateLimit: 100 },
      hyperliquid: { wsUrl: '', restUrl: 'https://api.hyperliquid.xyz', rateLimit: 600 },
      binance: { wsUrl: '', restUrl: '', rateLimit: 0 },
      bybit: { wsUrl: '', restUrl: '', rateLimit: 0 },
      okx: { wsUrl: '', restUrl: '', rateLimit: 0 },
    };

    const c = config[exchangeId];
    super({ id: exchangeId, wsUrl: c.wsUrl, restUrl: c.restUrl, rateLimit: c.rateLimit });

    const ep = EXCHANGE_ENDPOINTS[exchangeId];
    if (!ep) throw new Error(`No endpoints defined for ${exchangeId}`);
    this.endpoints = ep;

    switch (exchangeId) {
      case 'kucoin': this.tfMap = KUCOIN_TF_MAP; break;
      case 'gate': this.tfMap = GATE_TF_MAP; break;
      case 'coinbase': this.tfMap = COINBASE_TF_MAP; break;
      default: this.tfMap = GENERIC_TF_MAP;
    }
  }

  // Generic connector uses REST polling for WS simulation
  private pollIntervals = new Map<string, ReturnType<typeof setInterval>>();

  async connectWS(): Promise<void> {
    // REST-based polling simulation
    this.connected = true;
    this.emit('connected');
  }

  subscribeTicker(symbol: string): void {
    const key = `ticker:${symbol}`;
    if (this.pollIntervals.has(key)) return;
    const interval = setInterval(async () => {
      try {
        const tickers = await this.fetchTickers([symbol]);
        if (tickers.length > 0) this.emit('ticker', tickers[0]);
      } catch { /* ignore */ }
    }, 5000);
    this.pollIntervals.set(key, interval);
    this.subscriptions.add(key);
  }

  subscribeCandle(symbol: string, timeframe: Timeframe): void {
    const key = `candle:${symbol}:${timeframe}`;
    if (this.pollIntervals.has(key)) return;
    const interval = setInterval(async () => {
      try {
        const candles = await this.fetchCandles(symbol, timeframe, 1);
        if (candles.length > 0) {
          this.emit('candle', { ...candles[0], symbol, finalized: true });
        }
      } catch { /* ignore */ }
    }, 10000);
    this.pollIntervals.set(key, interval);
    this.subscriptions.add(key);
  }

  subscribeOrderBook(symbol: string): void {
    const key = `orderbook:${symbol}`;
    if (this.pollIntervals.has(key)) return;
    const interval = setInterval(async () => {
      try {
        const ob = await this.fetchOrderBook(symbol);
        this.emit('orderbook', ob);
      } catch { /* ignore */ }
    }, 2000);
    this.pollIntervals.set(key, interval);
    this.subscriptions.add(key);
  }

  subscribeTrades(_symbol: string): void {
    // Not available for REST-based connectors
  }

  unsubscribeTicker(symbol: string): void {
    const key = `ticker:${symbol}`;
    const interval = this.pollIntervals.get(key);
    if (interval) { clearInterval(interval); this.pollIntervals.delete(key); }
    this.subscriptions.delete(key);
  }

  unsubscribeCandle(symbol: string, timeframe: Timeframe): void {
    const key = `candle:${symbol}:${timeframe}`;
    const interval = this.pollIntervals.get(key);
    if (interval) { clearInterval(interval); this.pollIntervals.delete(key); }
    this.subscriptions.delete(key);
  }

  unsubscribeOrderBook(symbol: string): void {
    const key = `orderbook:${symbol}`;
    const interval = this.pollIntervals.get(key);
    if (interval) { clearInterval(interval); this.pollIntervals.delete(key); }
    this.subscriptions.delete(key);
  }

  unsubscribeTrades(_symbol: string): void {}

  protected handleMessage(_msg: unknown): void {}

  async fetchTickers(symbols?: string[]): Promise<Ticker[]> {
    if (this.id === 'hyperliquid') {
      const data = await this.fetch<Record<string, unknown>>(`${this.endpoints.tickers}?type=metaAndAssetCtxs`);
      const result = this.endpoints.parseTicker(data, '');
      const all = Array.isArray(result) ? result : [result];
      return symbols ? all.filter(t => symbols.includes(t.symbol)) : all;
    }

    const data = await this.fetch<unknown>(this.endpoints.tickers);
    const rawList = (data as { data?: unknown[] }).data || (data as unknown[]);

    if (this.id === 'kucoin') {
      const tickers = (rawList as { ticker: Record<string, unknown>[] }).ticker;
      return tickers
        .filter((t: Record<string, unknown>) => {
          const sym = t.symbol as string;
          if (!sym.endsWith('-USDT')) return false;
          const normalized = normalizeSymbol(sym, 'kucoin');
          return !symbols || symbols.includes(normalized);
        })
        .map((t: Record<string, unknown>): Ticker => ({
          symbol: normalizeSymbol(t.symbol as string, 'kucoin'),
          exchange: 'kucoin',
          price: parseFloat(t.last as string),
          priceChange24h: parseFloat(t.last as string) * parseFloat(t.changeRate as string),
          priceChangePercent24h: parseFloat(t.changeRate as string) * 100,
          high24h: parseFloat(t.high as string),
          low24h: parseFloat(t.low as string),
          volume24h: parseFloat(t.vol as string),
          quoteVolume24h: parseFloat(t.volValue as string),
          trades24h: 0,
          bid: parseFloat(t.buy as string),
          ask: parseFloat(t.sell as string),
          spread: parseFloat(t.sell as string) - parseFloat(t.buy as string),
          lastUpdate: Date.now(),
        }));
    }

    if (this.id === 'gate') {
      const tickers = rawList as Record<string, unknown>[];
      return tickers
        .filter((t: Record<string, unknown>) => {
          const pair = t.currency_pair as string;
          if (!pair.endsWith('_USDT')) return false;
          const normalized = normalizeSymbol(pair, 'gate');
          return !symbols || symbols.includes(normalized);
        })
        .map((t: Record<string, unknown>): Ticker => ({
          symbol: normalizeSymbol(t.currency_pair as string, 'gate'),
          exchange: 'gate',
          price: parseFloat(t.last as string),
          priceChange24h: parseFloat(t.last as string) - parseFloat(t.open24h as string),
          priceChangePercent24h: ((parseFloat(t.last as string) - parseFloat(t.open24h as string)) / parseFloat(t.open24h as string)) * 100,
          high24h: parseFloat(t.high_24h as string),
          low24h: parseFloat(t.low_24h as string),
          volume24h: parseFloat(t.base_volume as string),
          quoteVolume24h: parseFloat(t.quote_volume as string),
          trades24h: 0,
          bid: parseFloat(t.highest_bid as string),
          ask: parseFloat(t.lowest_ask as string),
          spread: parseFloat(t.lowest_ask as string) - parseFloat(t.highest_bid as string),
          lastUpdate: Date.now(),
        }));
    }

    if (this.id === 'mexc') {
      const tickers = rawList as Record<string, unknown>[];
      return tickers
        .filter((t: Record<string, unknown>) => {
          const sym = t.symbol as string;
          if (!sym.endsWith('USDT')) return false;
          const normalized = normalizeSymbol(sym, 'mexc');
          return !symbols || symbols.includes(normalized);
        })
        .map((t: Record<string, unknown>): Ticker => ({
          symbol: normalizeSymbol(t.symbol as string, 'mexc'),
          exchange: 'mexc',
          price: parseFloat(t.lastPrice as string),
          priceChange24h: parseFloat(t.priceChange as string),
          priceChangePercent24h: parseFloat(t.priceChangePercent as string),
          high24h: parseFloat(t.highPrice as string),
          low24h: parseFloat(t.lowPrice as string),
          volume24h: parseFloat(t.volume as string),
          quoteVolume24h: parseFloat(t.quoteVolume as string),
          trades24h: parseInt(t.count as string, 10),
          bid: parseFloat(t.bidPrice as string),
          ask: parseFloat(t.askPrice as string),
          spread: parseFloat(t.askPrice as string) - parseFloat(t.bidPrice as string),
          lastUpdate: Date.now(),
        }));
    }

    if (this.id === 'bitget') {
      const tickers = ((data as { data?: unknown[] }).data || []) as Record<string, unknown>[];
      return tickers
        .filter((t: Record<string, unknown>) => {
          const sym = t.symbol as string;
          if (!sym.endsWith('USDT')) return false;
          const normalized = normalizeSymbol(sym, 'bitget');
          return !symbols || symbols.includes(normalized);
        })
        .map((t: Record<string, unknown>): Ticker => ({
          symbol: normalizeSymbol(t.symbol as string, 'bitget'),
          exchange: 'bitget',
          price: parseFloat(t.lastPr as string),
          priceChange24h: parseFloat(t.change24h as string),
          priceChangePercent24h: parseFloat(t.changeRate24h as string) * 100,
          high24h: parseFloat(t.high24h as string),
          low24h: parseFloat(t.low24h as string),
          volume24h: parseFloat(t.baseVolume as string),
          quoteVolume24h: parseFloat(t.quoteVolume as string),
          trades24h: 0,
          bid: parseFloat(t.bestBid as string),
          ask: parseFloat(t.bestAsk as string),
          spread: parseFloat(t.bestAsk as string) - parseFloat(t.bestBid as string),
          lastUpdate: Date.now(),
        }));
    }

    if (this.id === 'coinbase') {
      const products = rawList as Record<string, unknown>[];
      return products
        .filter((p: Record<string, unknown>) => {
          if (p.quote_currency !== 'USDT' && p.quote_currency !== 'USD') return false;
          if (p.status !== 'online') return false;
          const pair = `${p.base_currency}/${p.quote_currency}`;
          return !symbols || symbols.includes(pair);
        })
        .slice(0, 100)
        .map((p: Record<string, unknown>): Ticker => ({
          symbol: `${p.base_currency}/${p.quote_currency}`,
          exchange: 'coinbase',
          price: parseFloat(p.price as string || '0'),
          priceChange24h: 0,
          priceChangePercent24h: 0,
          high24h: parseFloat(p.high_24h as string || '0'),
          low24h: parseFloat(p.low_24h as string || '0'),
          volume24h: parseFloat(p.volume_24h as string || '0'),
          quoteVolume24h: 0,
          trades24h: 0,
          bid: 0,
          ask: 0,
          spread: 0,
          lastUpdate: Date.now(),
        }));
    }

    return [];
  }

  async fetchCandles(symbol: string, timeframe: Timeframe, limit = 200): Promise<Candle[]> {
    const local = this.toLocalSymbol(symbol);
    const tf = this.tfMap[timeframe];

    if (this.id === 'hyperliquid') {
      const data = await this.fetch<unknown>(`${this.endpoints.candles}?type=candleSnapshot&coin=${local}&interval=${tf}`);
      return (data as unknown[][]).map((k): Candle => ({
        timestamp: k[0] as number,
        open: parseFloat(k[1] as string),
        high: parseFloat(k[2] as string),
        low: parseFloat(k[3] as string),
        close: parseFloat(k[4] as string),
        volume: parseFloat(k[5] as string),
        trades: 0,
      }));
    }

    let endpoint: string;
    switch (this.id) {
      case 'kucoin':
        endpoint = `/api/v1/market/candles?type=${tf}&symbol=${local}`;
        break;
      case 'bitget':
        endpoint = `/api/v2/spot/market/candles?symbol=${local}&granularity=${tf}&limit=${limit}`;
        break;
      case 'gate':
        endpoint = `/api/v4/spot/candlesticks?currency_pair=${local}&interval=${tf}&limit=${limit}`;
        break;
      case 'mexc':
        endpoint = `/api/v3/klines?symbol=${local}&interval=${tf}&limit=${limit}`;
        break;
      case 'coinbase':
        endpoint = `/products/${local}/candles?granularity=${tf}`;
        break;
      default:
        return [];
    }

    const data = await this.fetch<unknown>(endpoint);
    return this.endpoints.parseCandles(data);
  }

  async fetchOrderBook(symbol: string, limit = 50): Promise<OrderBook> {
    const local = this.toLocalSymbol(symbol);

    if (this.id === 'hyperliquid') {
      const data = await this.fetch<Record<string, unknown>>(`${this.endpoints.orderbook}?type=l2Book&coin=${local}`);
      const levels = data as unknown as { levels: [string, string, string][] }[];
      return {
        symbol,
        exchange: 'hyperliquid',
        bids: (levels[0]?.levels || []).filter((_, i) => i % 2 === 0).map(([p, q]) => ({
          price: parseFloat(p), quantity: parseFloat(q),
        })),
        asks: (levels[1]?.levels || []).filter((_, i) => i % 2 === 0).map(([p, q]) => ({
          price: parseFloat(p), quantity: parseFloat(q),
        })),
        timestamp: Date.now(),
      };
    }

    let endpoint: string;
    switch (this.id) {
      case 'kucoin': endpoint = `/api/v1/market/orderbook/level2_20?symbol=${local}`; break;
      case 'bitget': endpoint = `/api/v2/spot/market/orderbook?symbol=${local}&limit=${limit}`; break;
      case 'gate': endpoint = `/api/v4/spot/order_book?currency_pair=${local}&limit=${limit}`; break;
      case 'mexc': endpoint = `/api/v3/depth?symbol=${local}&limit=${limit}`; break;
      case 'coinbase': endpoint = `/products/${local}/book?level=2`; break;
      default: throw new Error(`Orderbook not supported for ${this.id}`);
    }

    const data = await this.fetch<unknown>(endpoint);
    return this.endpoints.parseOrderBook(data, symbol);
  }

  disconnect(): void {
    for (const interval of this.pollIntervals.values()) {
      clearInterval(interval);
    }
    this.pollIntervals.clear();
    super.disconnect();
  }
}
