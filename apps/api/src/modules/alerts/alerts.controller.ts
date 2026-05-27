import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AlertsService } from './alerts.service';
import type { AlertType } from '@crypto-screener/shared';

@ApiTags('Alerts')
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  @ApiOperation({ summary: 'Get alerts' })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'symbol', required: false })
  @ApiQuery({ name: 'read', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  async getAlerts(
    @Query('type') type?: AlertType,
    @Query('symbol') symbol?: string,
    @Query('read') read?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const result = await this.alertsService.getAlerts({
      type,
      symbol,
      read: read !== undefined ? read === 'true' : undefined,
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0,
    });
    return { success: true, ...result, timestamp: Date.now() };
  }

  @Get('recent')
  @ApiOperation({ summary: 'Get recent alerts (in-memory)' })
  @ApiQuery({ name: 'limit', required: false })
  getRecent(@Query('limit') limit?: string) {
    return {
      success: true,
      data: this.alertsService.getRecentAlerts(limit ? parseInt(limit) : 50),
      timestamp: Date.now(),
    };
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread alert count' })
  getUnreadCount() {
    return {
      success: true,
      data: { count: this.alertsService.getUnreadCount() },
      timestamp: Date.now(),
    };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark alert as read' })
  async markAsRead(@Param('id') id: string) {
    await this.alertsService.markAsRead(id);
    return { success: true, timestamp: Date.now() };
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Mark all alerts as read' })
  async markAllAsRead() {
    await this.alertsService.markAllAsRead();
    return { success: true, timestamp: Date.now() };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete alert' })
  async deleteAlert(@Param('id') id: string) {
    await this.alertsService.deleteAlert(id);
    return { success: true, timestamp: Date.now() };
  }
}
