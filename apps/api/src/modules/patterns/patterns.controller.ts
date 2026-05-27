import { Controller, Get, Query, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PatternsService } from './patterns.service';
import type { PatternType, ExchangeId, Timeframe } from '@crypto-screener/shared';

@ApiTags('Patterns')
@Controller('patterns')
export class PatternsController {
  constructor(private readonly patternsService: PatternsService) {}

  @Get()
  @ApiOperation({ summary: 'Get detected patterns' })
  @ApiQuery({ name: 'symbol', required: false })
  @ApiQuery({ name: 'exchange', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'timeframe', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getPatterns(
    @Query('symbol') symbol?: string,
    @Query('exchange') exchange?: ExchangeId,
    @Query('type') type?: PatternType,
    @Query('timeframe') timeframe?: Timeframe,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    const patterns = await this.patternsService.getPatterns({
      symbol, exchange, type, timeframe, status,
      limit: limit ? parseInt(limit) : 50,
    });
    return { success: true, data: patterns, timestamp: Date.now() };
  }

  @Get('active')
  @ApiOperation({ summary: 'Get active (in-memory) patterns' })
  getActive() {
    return {
      success: true,
      data: this.patternsService.getActivePatterns(),
      timestamp: Date.now(),
    };
  }
}
