import { Module } from '@nestjs/common';
import { ScreenerController } from './screener.controller';
import { ScreenerService } from './screener.service';
import { MarketModule } from '../market/market.module';
import { ScreenerStore } from './screener.store';
import { ScreenerEngine } from './screener.engine';

@Module({
  imports: [MarketModule],
  controllers: [ScreenerController],
  providers: [ScreenerService, ScreenerStore, ScreenerEngine],
  exports: [ScreenerService, ScreenerStore, ScreenerEngine],
})
export class ScreenerModule {}
