import { Controller, Get, Post, Put, Delete, Body, Param, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { WatchlistService } from './watchlist.service';
import { AuthService } from '../auth/auth.service';

@ApiTags('Watchlist')
@Controller('watchlists')
export class WatchlistController {
  constructor(
    private readonly watchlistService: WatchlistService,
    private readonly authService: AuthService,
  ) {}

  private getUserId(auth?: string): string {
    if (!auth) return 'guest';
    const token = auth.replace('Bearer ', '');
    const payload = this.authService.validateToken(token);
    return payload?.userId || 'guest';
  }

  @Get()
  @ApiOperation({ summary: 'Get user watchlists' })
  async getWatchlists(@Headers('authorization') auth?: string) {
    const userId = this.getUserId(auth);
    const watchlists = await this.watchlistService.getWatchlists(userId);
    return { success: true, data: watchlists, timestamp: Date.now() };
  }

  @Post()
  @ApiOperation({ summary: 'Create watchlist' })
  async createWatchlist(
    @Headers('authorization') auth: string | undefined,
    @Body() body: { name: string; symbols?: string[] },
  ) {
    const userId = this.getUserId(auth);
    const watchlist = await this.watchlistService.createWatchlist(userId, body.name, body.symbols);
    return { success: true, data: watchlist, timestamp: Date.now() };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update watchlist' })
  async updateWatchlist(
    @Param('id') id: string,
    @Body() body: { name?: string; symbols?: string[] },
  ) {
    await this.watchlistService.updateWatchlist(id, body);
    return { success: true, timestamp: Date.now() };
  }

  @Post(':id/symbols')
  @ApiOperation({ summary: 'Add symbol to watchlist' })
  async addSymbol(@Param('id') id: string, @Body() body: { symbol: string }) {
    await this.watchlistService.addSymbol(id, body.symbol);
    return { success: true, timestamp: Date.now() };
  }

  @Delete(':id/symbols/:symbol')
  @ApiOperation({ summary: 'Remove symbol from watchlist' })
  async removeSymbol(@Param('id') id: string, @Param('symbol') symbol: string) {
    await this.watchlistService.removeSymbol(id, symbol);
    return { success: true, detail: true });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete watchlist' })
  async deleteWatchlist(@Param('id') id: string) {
    await this.watchlistService.deleteWatchlist(id);
    return { success: true, timestamp: Date.now() };
  }
}
