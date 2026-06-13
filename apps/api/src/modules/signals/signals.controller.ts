import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { SignalsService } from './signals.service';

@Controller('signals')
export class SignalsController {
  constructor(private readonly signalsService: SignalsService) {}

  @Get()
  listSignals() {
    return this.signalsService.listSignals();
  }

  @Get('alerts')
  listAlerts(
    @Headers('authorization') authorization?: string,
    @Headers('x-signal-client-id') clientId?: string,
  ) {
    return this.signalsService.listAlertsForPreferences(authorization, clientId);
  }

  @Get('summary')
  listSummary() {
    return this.signalsService.listSummary();
  }

  @Get('health')
  getHealth() {
    return this.signalsService.getHealth();
  }

  @Get('preferences')
  getPreferences(
    @Headers('authorization') authorization?: string,
    @Headers('x-signal-client-id') clientId?: string,
  ) {
    return this.signalsService.getPreferences(authorization, clientId);
  }

  @Post('preferences')
  updatePreferences(
    @Body() body: { enabled?: boolean; minUsd?: number },
    @Headers('authorization') authorization?: string,
    @Headers('x-signal-client-id') clientId?: string,
  ) {
    return this.signalsService.updatePreferences(body, authorization, clientId);
  }
}
