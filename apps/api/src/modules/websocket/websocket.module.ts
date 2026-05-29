import { Module } from '@nestjs/common';
import { WebSocketService } from './websocket.service';
import { MarketModule } from '../market/market.module';

@Module({
  imports: [MarketModule],
  providers: [WebSocketService],
  exports: [WebSocketService],
})
export class WebSocketModule {}
