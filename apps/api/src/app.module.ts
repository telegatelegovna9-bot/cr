import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { MarketModule } from './modules/market/market.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { WebSocketModule } from './modules/websocket/websocket.module';
import { AuthModule } from './modules/auth/auth.module';
import { SignalsModule } from './modules/signals/signals.module';
import { WatchlistModule } from './modules/watchlist/watchlist.module';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuthModule,
    MarketModule,
    AlertsModule,
    SignalsModule,
    WebSocketModule,
    WatchlistModule,
  ],
})
export class AppModule {}
