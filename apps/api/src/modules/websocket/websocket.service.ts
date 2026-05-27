import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class WebSocketService implements OnModuleInit, OnModuleDestroy {
  private subscriber: ReturnType<typeof this.db.createSubscriber> | null = null;

  constructor(private readonly db: DatabaseService) {}

  onModuleInit() {
    this.subscriber = this.db.createSubscriber();
    
    // Subscribe to Redis channels for relay
    this.subscriber.subscribe('ticker', 'candle', 'orderbook', 'trade', 'alert', 'pattern');
    
    this.subscriber.on('message', (channel: string, message: string) => {
      // Messages are relayed via Socket.IO in the gateway
      // This service handles Redis pub/sub subscription
    });
  }

  onModuleDestroy() {
    if (this.subscriber) {
      this.subscriber.disconnect();
    }
  }
}
