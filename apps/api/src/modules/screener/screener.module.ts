import { Module, forwardRef } from '@nestjs/common';
import { MarketModule } from '../market/market.module';
import { ScreenerController } from './screener.controller';
import { ScreenerService } from './screener.service';

@Module({
  imports: [forwardRef(() => MarketModule)],
  controllers: [ScreenerController],
  providers: [ScreenerService],
  exports: [ScreenerService],
})
export class ScreenerModule {}
