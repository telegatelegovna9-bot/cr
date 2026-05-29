import { Controller, Get, Query, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { MarketService, TickerWithMeta } from './market.service';
import type { ExchangeId, Timeframe } from '@crypto-screener/shared';
import { ALL_EXCHANGES, TIMEFRAMES } from '@crypto-screener/shared';

@ApiTags('Market')
@Controller('market')
export class MarketController {
  constructor(private readonly marketService: MarketService) {}

  @Get('tickers')
  @ApiOperation({ summary: 'Get all tickers' })
  @ApiQuery({ name: 'exchange', required: false })
  @ApiQuery({ name: 'symbols', required: false, type: [String] })
  getTickers(
    @Query('exchange') exchange?: ExchangeId,
    @Query('symbols') symbols?: string,
  ) {
    const symbolList = symbols ? symbols.split(',') : undefined;
    return {
      success: true,
      data: this.marketService.getTickers(exchange, symbolList),
      timestamp: Date.now(),
    };
  }

  @Get('tickers/top-gainers')
  @ApiOperation({ summary: 'Get top gaining tickers' })
  @ApiQuery({ name: 'limit', required: false })
  getTopGainers(@Query('limit') limit?: string) {
    return {
      success: true,
      data: this.marketService.getTopGainers(limit ? parseInt(limit) : 50),
      timestamp: Date.now(),
    };
  }

  @Get('tickers/top-losers')
  @ApiOperation({ summary: 'Get top losing tickers' })
  @ApiQuery({ name: 'limit', required: false })
  getTopLosers(@Query('limit') limit?: string) {
    return {
      success: true,
      data: this.marketService.getTopLosers(limit ? parseInt(limit) : 50),
      timestamp: Date.now(),
    };
  }

  @Get('tickers/top-volume')
  @ApiOperation({ summary: 'Get top volume tickers' })
  @ApiQuery({ name: 'limit', required: false })
  getTopVolume(@Query('limit') limit?: string) {
    return {
      success: true,
      data: this.marketService.getTopVolume(limit ? parseInt(limit) : 50),
      timestamp: Date.now(),
    };
  }

  @Get('candles/:symbol')
  @ApiOperation({ summary: 'Get candle data' })
  @ApiQuery({ name: 'timeframe', required: false })
  @ApiQuery({ name: 'exchange', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'endTime', required: false })
  async getCandles(
    @Param('symbol') symbol: string,
    @Query('timeframe') timeframe?: Timeframe,
    @Query('exchange') exchange?: ExchangeId,
    @Query('limit') limit?: string,
    @Query('endTime') endTime?: string,
  ) {
    const candles = await this.marketService.getCandles(
      symbol.replace('-', '/'),
      timeframe || '1h',
      exchange,
      limit ? parseInt(limit) : 500,
      endTime ? parseInt(endTime) : undefined,
    );
    return {
      success: true,
      data: candles,
      timestamp: Date.now(),
    };
  }

  @Get('orderbook/:symbol')
  @ApiOperation({ summary: 'Get order book' })
  @ApiQuery({ name: 'exchange', required: false })
  async getOrderBook(
    @Param('symbol') symbol: string,
    @Query('exchange') exchange?: ExchangeId,
  ) {
    const ob = await this.marketService.getOrderBook(symbol.replace('-', '/'), exchange);
    return {
      success: true,
      data: ob,
      timestamp: Date.now(),
    };
  }

  @Get('health')
  @ApiOperation({ summary: 'Get exchange health status' })
  getHealth() {
    return {
      success: true,
      data: this.marketService.getExchangeHealth(),
      timestamp: Date.now(),
    };
  }

  @Get('exchanges')
  @ApiOperation({ summary: 'Get supported exchanges' })
  getExchanges() {
    return {
      success: true,
      data: {
        all: ALL_EXCHANGES,
        connected: this.marketService.getConnectedExchanges(),
      },
      timestamp: Date.now(),
    };
  }

  @Get('timeframes')
  @ApiOperation({ summary: 'Get supported timeframes' })
  getTimeframes() {
    return {
      success: true,
      data: TIMEFRAMES,
      timestamp: Date.now(),
    };
  }
}
