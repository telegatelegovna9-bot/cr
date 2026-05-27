import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ScreenerService } from './screener.service';
import type { ScreenerFilter, ScreenerSortField, ExchangeId } from '@crypto-screener/shared';

@ApiTags('Screener')
@Controller('screener')
export class ScreenerController {
  constructor(private readonly screenerService: ScreenerService) {}

  @Post('scan')
  @ApiOperation({ summary: 'Run screener scan' })
  scan(@Body() body: {
    filters?: ScreenerFilter[];
    sortBy?: ScreenerSortField;
    sortDirection?: 'asc' | 'desc';
    exchange?: ExchangeId;
    page?: number;
    pageSize?: number;
  }) {
    const result = this.screenerService.screen(body);
    return { success: true, ...result, timestamp: Date.now() };
  }

  @Get('quick')
  @ApiOperation({ summary: 'Quick screener with preset filters' })
  @ApiQuery({ name: 'preset', required: false })
  @ApiQuery({ name: 'exchange', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  quick(
    @Query('preset') preset?: string,
    @Query('exchange') exchange?: ExchangeId,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const filters: ScreenerFilter[] = [];

    switch (preset) {
      case 'high_volume':
        filters.push({ field: 'quoteVolume24h', operator: 'gt', value: 10_000_000 });
        break;
      case 'volatile':
        filters.push({ field: 'priceChangePercent24h', operator: 'gt', value: 5 });
        break;
      case 'top_gainers':
        filters.push({ field: 'priceChangePercent24h', operator: 'gt', value: 0 });
        break;
      case 'top_losers':
        filters.push({ field: 'priceChangePercent24h', operator: 'lt', value: 0 });
        break;
    }

    const result = this.screenerService.screen({
      filters,
      sortBy: preset === 'top_gainers' || preset === 'volatile' ? 'priceChange24h' : 'quoteVolume24h',
      sortDirection: preset === 'top_losers' ? 'asc' : 'desc',
      exchange,
      page: page ? parseInt(page) : 1,
      pageSize: pageSize ? parseInt(pageSize) : 50,
    });

    return { success: true, ...result, timestamp: Date.now() };
  }
}
