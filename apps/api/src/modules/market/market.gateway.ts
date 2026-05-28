import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
  Inject,
} from '@nestjs/websockets';
import { forwardRef } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { MarketService } from './market.service';
import type { ExchangeId, Timeframe } from '@crypto-screener/shared';

interface SubscribePayload {
  channel: 'ticker' | 'candle' | 'orderbook' | 'trades';
  symbol?: string;
  exchange?: ExchangeId;
  timeframe?: Timeframe;
}

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  },
  namespace: '/market',
  transports: ['websocket', 'polling'],
})
export class MarketGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private clientSubscriptions = new Map<string, Set<string>>();

  constructor(
    @Inject(forwardRef(() => MarketService)) private readonly marketService: MarketService,
  ) {}

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
    this.clientSubscriptions.set(client.id, new Set());
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    this.clientSubscriptions.delete(client.id);
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SubscribePayload,
  ) {
    const { channel, symbol, exchange, timeframe } = payload;
    const key = `${channel}:${symbol || '*'}:${exchange || '*'}:${timeframe || '*'}`;

    const subs = this.clientSubscriptions.get(client.id);
    if (subs) subs.add(key);

    // Join socket.io room for efficient broadcasting
    client.join(key);

    // If subscribing to ticker and we have cached data, send immediately
    if (channel === 'ticker' && symbol) {
      const tickers = this.marketService.getTickers(exchange, [symbol]);
      if (tickers.length > 0) {
        client.emit('ticker', tickers[0]);
      }
      // Subscribe to exchange updates
      this.marketService.subscribeSymbol(symbol);
    }

    // Subscribe to candle stream on exchange
    if (channel === 'candle' && symbol && timeframe) {
      this.marketService.subscribeCandle(symbol, timeframe as Timeframe, exchange);
    }

    return { event: 'subscribed', data: { channel, symbol, exchange, timeframe } };
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SubscribePayload,
  ) {
    const { channel, symbol, exchange, timeframe } = payload;
    const key = `${channel}:${symbol || '*'}:${exchange || '*'}:${timeframe || '*'}`;

    const subs = this.clientSubscriptions.get(client.id);
    if (subs) subs.delete(key);

    client.leave(key);

    return { event: 'unsubscribed', data: { channel, symbol, exchange, timeframe } };
  }

  @SubscribeMessage('get_tickers')
  handleGetTickers(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { exchange?: ExchangeId; symbols?: string[] },
  ) {
    const tickers = this.marketService.getTickers(payload.exchange, payload.symbols);
    client.emit('tickers', tickers);
  }

  @SubscribeMessage('get_top_gainers')
  handleGetTopGainers(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { limit?: number },
  ) {
    client.emit('top_gainers', this.marketService.getTopGainers(payload.limit));
  }

  @SubscribeMessage('get_top_losers')
  handleGetTopLosers(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { limit?: number },
  ) {
    client.emit('top_losers', this.marketService.getTopLosers(payload.limit));
  }

  @SubscribeMessage('get_top_volume')
  handleGetTopVolume(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { limit?: number },
  ) {
    client.emit('top_volume', this.marketService.getTopVolume(payload.limit));
  }

  // Broadcast ticker updates to subscribed clients
  broadcastTicker(ticker: unknown) {
    const key = `ticker:${(ticker as { symbol: string }).symbol}:*:*`;
    this.server.to(key).emit('ticker', ticker);

    // Also broadcast to wildcard subscribers
    this.server.to('ticker:*:*:*').emit('ticker', ticker);
  }

  broadcastCandle(candle: unknown) {
    const c = candle as { symbol: string };
    this.server.to(`candle:${c.symbol}:*:*`).emit('candle', candle);
  }

  broadcastOrderBook(ob: unknown) {
    const o = ob as { exchange: string; symbol: string };
    this.server.to(`orderbook:${o.symbol}:${o.exchange}:*`).emit('orderbook', ob);
  }

  broadcastTrade(trade: unknown) {
    const t = trade as { symbol: string };
    this.server.to(`trades:${t.symbol}:*:*`).emit('trade', trade);
  }

  broadcastAlert(alert: unknown) {
    this.server.emit('alert', alert);
  }

  broadcastPattern(pattern: unknown) {
    this.server.emit('pattern', pattern);
  }
}
