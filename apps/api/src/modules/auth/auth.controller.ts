import { Controller, Get, Post, Body, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthService, User } from './auth.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('telegram')
  @ApiOperation({ summary: 'Authenticate via Telegram Mini App' })
  async telegramAuth(@Body() body: { telegramId: number; username?: string }) {
    const user = await this.authService.getOrCreateTelegramUser(body.telegramId, body.username);
    const token = this.authService.generateToken(user.id);
    return { success: true, data: { user, token }, timestamp: Date.now() };
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current user' })
  async getMe(@Headers('authorization') auth?: string) {
    if (!auth) return { success: false, error: 'No auth token' };

    const token = auth.replace('Bearer ', '');
    const payload = this.authService.validateToken(token);
    if (!payload) return { success: false, error: 'Invalid token' };

    const user = await this.authService.getUser(payload.userId);
    return { success: true, data: user, timestamp: Date.now() };
  }

  @Post('guest')
  @ApiOperation({ summary: 'Guest access (no auth required)' })
  guestAccess() {
    return {
      success: true,
      data: { guest: true, token: this.authService.generateToken('guest') },
      timestamp: Date.now(),
    };
  }
}
