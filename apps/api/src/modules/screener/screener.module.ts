import { Module } from '@nestjs/common';
import { ScreenerController } from './screener.controller';
import { ScreenerService } from './screener.service';
import { MarketModule } from '../market/market.module';

@Module({
  imports: [MarketModule],
  controllers: [ScreenerController],
  providers: [ScreenerService],
  exports: [ScreenerService],
})
export class ScreenerModule {}
