import { Module } from '@nestjs/common';
import { MarketController } from './market.controller';
import { MarketService } from './market.service';
import { MarketGateway } from './market.gateway';

@Module({
  controllers: [MarketController],
  providers: [MarketService, MarketGateway],
  exports: [MarketService],
})
export class MarketModule {}
