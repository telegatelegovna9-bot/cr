import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { FlowsService } from './flows.service';
import type { HyperliquidFlowKind } from './flows.types';

@ApiTags('Flows')
@Controller('flows')
export class FlowsController {
  constructor(private readonly flowsService: FlowsService) {}

  @Get('hyperliquid')
  @ApiOperation({ summary: 'Get Hyperliquid flows feed' })
  @ApiQuery({ name: 'kind', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'minUsd', required: false })
  @ApiQuery({ name: 'limit', required: false })
  listHyperliquidFlows(
    @Query('kind') kind?: HyperliquidFlowKind,
    @Query('search') search?: string,
    @Query('minUsd') minUsd?: string,
    @Query('limit') limit?: string,
  ) {
    const data = this.flowsService.listHyperliquidFlows({
      kind,
      search,
      minUsd: minUsd ? Number(minUsd) : undefined,
      limit: limit ? Number(limit) : undefined,
    });

    return {
      success: true,
      ...data,
      timestamp: Date.now(),
    };
  }
}
