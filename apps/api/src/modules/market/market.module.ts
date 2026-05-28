import { Module, forwardRef } from '@nestjs/common';
import { MarketController } from './market.controller';
import { MarketService } from './market.service';
import { MarketGateway } from './market.gateway';

@Module({
  controllers: [MarketController],
  providers: [
    { provide: MarketService, useClass: MarketService },
    { provide: MarketGateway, useClass: MarketGateway },
  ],
  exports: [MarketService],
})
export class MarketModule {}
