import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Inject, forwardRef, Logger } from '@nestjs/common';
import { Server, WebSocket } from 'ws';
import { MarketService } from './market.service';
import type { ExchangeId, Timeframe } from '@crypto-screener/shared';

interface SubscribePayload {
  exchange: ExchangeId;
  marketType: 'spot' | 'futures';
  symbol: string;
  timeframe?: Timeframe;
  channel?: string;
  action?: 'subscribe' | 'unsubscribe';
}

@WebSocketGateway({
  path: '/ws',
})
export class MarketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(MarketGateway.name);

  @WebSocketServer()
  server!: Server;

  // Track client subscriptions for cleanup on disconnect
  private clientSubscriptions = new Map<WebSocket, Set<string>>();

  // Optimized lookup: channel -> symbol -> Set of clients
  // Symbol format in lookup: "exchange:symbol" or "exchange:symbol:timeframe"
  private channelSubscriptions = new Map<string, Map<string, Set<WebSocket>>>();

  constructor(
    @Inject(forwardRef(() => MarketService)) private readonly marketService: MarketService,
  ) {
    // Initialize channel maps
    ['ticker', 'candle', 'orderbook', 'trade', 'alert', 'pattern'].forEach(ch => {
      this.channelSubscriptions.set(ch, new Map());
    });
  }

  handleConnection(client: WebSocket) {
    this.logger.log('Client connected to WebSocket');
    this.clientSubscriptions.set(client, new Set());

    // Handle raw messages from the client
    client.on('message', (message: string) => {
      try {
        const payload = JSON.parse(message);
        this.handleSubscription(client, payload);
      } catch (err) {
        this.logger.error('Failed to parse WebSocket message:', err);
      }
    });
  }

  handleDisconnect(client: WebSocket) {
    this.logger.log('Client disconnected from WebSocket');
    const subs = this.clientSubscriptions.get(client);
    if (subs) {
      for (const subKey of subs) {
        try {
          const sub = JSON.parse(subKey);
          this.removeSubscriptionFromLookup(client, sub);
          
          const { exchange, symbol, timeframe, channel } = sub;
          if (channel === 'orderbook') {
            this.marketService.unsubscribeOrderBook(symbol, exchange as ExchangeId);
          } else if (timeframe) {
            this.marketService.unsubscribeCandle(symbol, timeframe as Timeframe, exchange as ExchangeId);
          } else {
            this.marketService.unsubscribeSymbol(symbol);
          }
        } catch { /* Ignore */ }
      }
    }
    this.clientSubscriptions.delete(client);
  }

  private handleSubscription(client: WebSocket, data: SubscribePayload) {
    const { action = 'subscribe', exchange, marketType, symbol, timeframe, channel } = data;
    const subData = { exchange, marketType, symbol, timeframe, channel };
    const subKey = JSON.stringify(subData);

    const subs = this.clientSubscriptions.get(client);
    if (!subs) return;

    if (action === 'subscribe') {
      if (subs.has(subKey)) return;
      subs.add(subKey);
      this.addSubscriptionToLookup(client, subData);

      // Subscribe via MarketService
      if (channel === 'orderbook') {
        this.marketService.subscribeOrderBook(symbol, exchange);
      } else if (timeframe) {
        this.marketService.subscribeCandle(symbol, timeframe, exchange);
      } else {
        this.marketService.subscribeSymbol(symbol);
      }

      // Send confirmation
      client.send(JSON.stringify({ event: 'subscribed', data: { exchange, marketType, symbol, timeframe, channel } }));

      // Send initial data if available
      if (!timeframe && !channel) {
        const tickers = this.marketService.getTickers(exchange, [symbol]);
        if (tickers.length > 0) {
          client.send(JSON.stringify({ channel: 'ticker', data: tickers[0] }));
        }
      }
    } else if (action === 'unsubscribe') {
      if (!subs.has(subKey)) return;
      subs.delete(subKey);
      this.removeSubscriptionFromLookup(client, subData);

      if (channel === 'orderbook') {
        this.marketService.unsubscribeOrderBook(symbol, exchange);
      } else if (timeframe) {
        this.marketService.unsubscribeCandle(symbol, timeframe, exchange);
      } else {
        this.marketService.unsubscribeSymbol(symbol);
      }
      client.send(JSON.stringify({ event: 'unsubscribed', data: { exchange, marketType, symbol, timeframe, channel } }));
    }
  }

  private addSubscriptionToLookup(client: WebSocket, sub: any) {
    const channel = sub.channel || (sub.timeframe ? 'candle' : 'ticker');
    const symbolKey = this.getSymbolKey(sub);
    
    let channelMap = this.channelSubscriptions.get(channel);
    if (!channelMap) {
      channelMap = new Map();
      this.channelSubscriptions.set(channel, channelMap);
    }

    let clients = channelMap.get(symbolKey);
    if (!clients) {
      clients = new Set();
      channelMap.set(symbolKey, clients);
    }
    clients.add(client);
  }

  private removeSubscriptionFromLookup(client: WebSocket, sub: any) {
    const channel = sub.channel || (sub.timeframe ? 'candle' : 'ticker');
    const symbolKey = this.getSymbolKey(sub);
    
    const channelMap = this.channelSubscriptions.get(channel);
    if (channelMap) {
      const clients = channelMap.get(symbolKey);
      if (clients) {
        clients.delete(client);
        if (clients.size === 0) {
          channelMap.delete(symbolKey);
        }
      }
    }
  }

  private getSymbolKey(sub: any): string {
    const parts = [sub.exchange, sub.symbol];
    if (sub.timeframe) parts.push(sub.timeframe);
    return parts.join(':');
  }

  @SubscribeMessage('message')
  handleSubscribeMessage(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() payload: any,
  ) {
    this.handleSubscription(client, payload);
  }

  // Optimized Broadcaster
  broadcast(channel: string, data: any) {
    const channelMap = this.channelSubscriptions.get(channel);
    if (!channelMap) return;

    // Build lookup keys based on incoming data
    const keys: string[] = [];
    if (channel === 'candle') {
      keys.push(`${data.exchange}:${data.symbol}:${data.timeframe}`);
    } else {
      keys.push(`${data.exchange}:${data.symbol}`);
    }

    const message = JSON.stringify({ channel, data });
    
    for (const key of keys) {
      const clients = channelMap.get(key);
      if (clients) {
        clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(message);
          }
        });
      }
    }
  }
}

