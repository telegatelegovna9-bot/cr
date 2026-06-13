import { Module } from '@nestjs/common';
import { SignalsAggregator } from './signals.aggregator';
import { SignalsAlertsService } from './signals.alerts';
import { SignalsController } from './signals.controller';
import { SignalsService } from './signals.service';
import { SignalsStore } from './signals.store';

@Module({
  controllers: [SignalsController],
  providers: [SignalsService, SignalsStore, SignalsAlertsService, SignalsAggregator],
  exports: [SignalsService, SignalsStore, SignalsAlertsService, SignalsAggregator],
})
export class SignalsModule {}
