import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { MarketModule } from './modules/market/market.module';
import { ScreenerModule } from './modules/screener/screener.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { PatternsModule } from './modules/patterns/patterns.module';
import { WebSocketModule } from './modules/websocket/websocket.module';
import { AuthModule } from './modules/auth/auth.module';
import { WatchlistModule } from './modules/watchlist/watchlist.module';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuthModule,
    MarketModule,
    ScreenerModule,
    AlertsModule,
    PatternsModule,
    WebSocketModule,
    WatchlistModule,
  ],
})
export class AppModule {}
