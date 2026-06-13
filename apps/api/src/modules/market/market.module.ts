import { Module, forwardRef } from '@nestjs/common';
import { MarketController } from './market.controller';
import { HistoryController } from './history.controller';
import { MarketService } from './market.service';
import { MarketGateway } from './market.gateway';
import { AlertsModule } from '../alerts/alerts.module';
import { SignalsModule } from '../signals/signals.module';

@Module({
  imports: [AlertsModule, SignalsModule],
  controllers: [MarketController, HistoryController],
  providers: [
    { provide: MarketService, useClass: MarketService },
    { provide: MarketGateway, useClass: MarketGateway },
  ],
  exports: [MarketService, MarketGateway],
})
export class MarketModule {}
