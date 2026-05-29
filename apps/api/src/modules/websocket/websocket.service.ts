import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { MarketGateway } from '../market/market.gateway';

@Injectable()
export class WebSocketService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebSocketService.name);
  private subscriber: ReturnType<typeof this.db.createSubscriber> | null = null;

  constructor(
    private readonly db: DatabaseService,
    private readonly gateway: MarketGateway,
  ) {}

  onModuleInit() {
    this.subscriber = this.db.createSubscriber();
    
    // Subscribe to Redis channels for relay
    this.subscriber.subscribe('ticker', 'candle', 'orderbook', 'trade', 'alert', 'pattern');
    
    this.subscriber.on('message', (channel: string, message: string) => {
      try {
        const data = JSON.parse(message);
        // Relay to local WebSocket gateway
        this.gateway.broadcast(channel, data);
      } catch (err) {
        this.logger.error(`Failed to relay message from channel ${channel}:`, err);
      }
    });

    this.logger.log('📡 WebSocket relay service initialized (Redis Pub/Sub)');
  }

  onModuleDestroy() {
    if (this.subscriber) {
      this.subscriber.disconnect();
    }
  }
}
