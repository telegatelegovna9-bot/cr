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
import { Server } from 'ws';
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
  private clientSubscriptions = new Map<any, Set<string>>();

  constructor(
    @Inject(forwardRef(() => MarketService)) private readonly marketService: MarketService,
  ) {}

  handleConnection(client: any) {
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

  handleDisconnect(client: any) {
    this.logger.log('Client disconnected from WebSocket');
    const subs = this.clientSubscriptions.get(client);
    if (subs) {
      for (const subKey of subs) {
        try {
          const { exchange, symbol, timeframe, channel } = JSON.parse(subKey);
          if (channel === 'orderbook') {
            this.marketService.unsubscribeOrderBook(symbol, exchange as ExchangeId);
          } else if (timeframe) {
            this.marketService.unsubscribeCandle(symbol, timeframe as Timeframe, exchange as ExchangeId);
          } else {
            this.marketService.unsubscribeSymbol(symbol);
          }
        } catch {
          // Ignore parse errors
        }
      }
    }
    this.clientSubscriptions.delete(client);
  }

  private handleSubscription(client: any, data: SubscribePayload) {
    const { action = 'subscribe', exchange, marketType, symbol, timeframe, channel } = data;
    const subKey = JSON.stringify({ exchange, marketType, symbol, timeframe, channel });

    const subs = this.clientSubscriptions.get(client);
    if (!subs) return;

    if (action === 'subscribe') {
      if (subs.has(subKey)) return;
      subs.add(subKey);

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
      subs.delete(subKey);
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

  @SubscribeMessage('message')
  handleSubscribeMessage(
    @ConnectedSocket() client: any,
    @MessageBody() payload: any,
  ) {
    // This is still here for compatibility but we prefer handleSubscription
    this.handleSubscription(client, payload);
  }

  // Broadcasters used by MarketService (or Redis Relay)
  broadcast(channel: string, data: any) {
    const message = JSON.stringify({ channel, data });
    this.server.clients.forEach((client: any) => {
      if (client.readyState === 1) { // 1 = OPEN
        // Filter based on client subscriptions
        const subs = this.clientSubscriptions.get(client);
        if (subs) {
          for (const subKey of subs) {
            try {
              const sub = JSON.parse(subKey);
              
              if (channel === 'ticker' && sub.symbol === data.symbol && (!sub.exchange || sub.exchange === data.exchange)) {
                client.send(message);
                break;
              }
              if (channel === 'candle' && sub.symbol === data.symbol && sub.timeframe === data.timeframe && (!sub.exchange || sub.exchange === data.exchange)) {
                client.send(message);
                break;
              }
              if (channel === 'orderbook' && (sub.symbol === data.symbol || data.symbol === 'unknown') && sub.channel === 'orderbook' && (!sub.exchange || sub.exchange === data.exchange)) {
                client.send(message);
                break;
              }
            } catch { /* ignore */ }
          }
        }
      }
    });
  }
}
