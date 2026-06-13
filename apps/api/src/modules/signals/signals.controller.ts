import { Controller, Get } from '@nestjs/common';
import { SignalsService } from './signals.service';

@Controller('signals')
export class SignalsController {
  constructor(private readonly signalsService: SignalsService) {}

  @Get()
  listSignals() {
    return this.signalsService.listSignals();
  }

  @Get('alerts')
  listAlerts() {
    return this.signalsService.listAlerts();
  }
}
