import { Module } from '@nestjs/common';
import { MarketModule } from '../market/market.module';
import { PatternsController } from './patterns.controller';
import { PatternsScanner } from './patterns.scanner';
import { PatternsService } from './patterns.service';

@Module({
  imports: [MarketModule],
  controllers: [PatternsController],
  providers: [PatternsService, PatternsScanner],
  exports: [PatternsService],
})
export class PatternsModule {}
