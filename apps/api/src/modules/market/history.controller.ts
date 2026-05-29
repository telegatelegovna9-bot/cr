import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { MarketService } from './market.service';
import type { ExchangeId, Timeframe } from '@crypto-screener/shared';

@ApiTags('History')
@Controller('history')
export class HistoryController {
  constructor(private readonly marketService: MarketService) {}

  @Get()
  @ApiOperation({ summary: 'Get historical candles' })
  @ApiQuery({ name: 'exchange', required: true })
  @ApiQuery({ name: 'marketType', required: false })
  @ApiQuery({ name: 'symbol', required: true })
  @ApiQuery({ name: 'timeframe', required: true })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'endTime', required: false })
  async getHistory(
    @Query('exchange') exchange: ExchangeId,
    @Query('symbol') symbol: string,
    @Query('timeframe') timeframe: Timeframe,
    @Query('limit') limit?: string,
    @Query('endTime') endTime?: string,
  ) {
    const candles = await this.marketService.getCandles(
      symbol.replace('-', '/'),
      timeframe || '1h',
      exchange,
      limit ? parseInt(limit, 10) : 500,
      endTime ? parseInt(endTime, 10) : undefined,
    );
    return {
      success: true,
      data: candles,
      timestamp: Date.now(),
    };
  }
}
