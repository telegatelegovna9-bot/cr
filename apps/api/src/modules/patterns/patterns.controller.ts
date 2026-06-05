import { Controller, Get, Query, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PatternsService } from './patterns.service';
import type { PatternType, ExchangeId, Timeframe } from '@crypto-screener/shared';

@ApiTags('Patterns')
@Controller('api/patterns')
export class PatternsController {
  constructor(private readonly patternsService: PatternsService) {}

  @Get()
  @ApiOperation({ summary: 'Get persisted patterns snapshot' })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'kinds', required: false })
  @ApiQuery({ name: 'timeframes', required: false })
  @ApiQuery({ name: 'statuses', required: false })
  async listPatterns(
    @Query('cursor') cursor?: string,
    @Query('search') search?: string,
    @Query('kinds') kinds?: string,
    @Query('timeframes') timeframes?: string,
    @Query('statuses') statuses?: string,
  ) {
    const patterns = await this.patternsService.listPatterns({
      cursor: cursor ? parseInt(cursor, 10) : undefined,
      search,
      kinds: kinds ? kinds.split(',') : undefined,
      timeframes: timeframes ? timeframes.split(',') : undefined,
      statuses: statuses ? statuses.split(',') : undefined,
    });

    return {
      success: true,
      ...patterns,
      timestamp: Date.now(),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one persisted pattern by id' })
  async getPattern(@Param('id') id: string) {
    return {
      success: true,
      data: await this.patternsService.getPattern(id),
      timestamp: Date.now(),
    };
  }
}
