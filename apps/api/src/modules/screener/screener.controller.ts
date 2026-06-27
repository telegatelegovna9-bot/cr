import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import type { ScreenerMarketType } from '@crypto-screener/shared';
import { ScreenerService } from './screener.service';

@Controller('screener')
export class ScreenerController {
  constructor(private readonly screenerService: ScreenerService) {}

  @Get('snapshot')
  getSnapshot(@Query('marketType') marketType?: string) {
    return {
      success: true,
      data: this.screenerService.listSnapshot(this.parseMarketType(marketType)),
    };
  }

  private parseMarketType(marketType?: string): ScreenerMarketType {
    if (!marketType) {
      return 'spot';
    }

    if (marketType === 'spot' || marketType === 'futures') {
      return marketType;
    }

    throw new BadRequestException(`Unsupported marketType: ${marketType}`);
  }
}
