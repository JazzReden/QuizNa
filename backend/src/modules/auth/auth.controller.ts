import { Controller, Get, Post, Body, UseGuards, Headers } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto, RefreshDto, LogoutDto } from './auth.dto';
import { AuthGuard } from '../../common/guards/auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserProfile } from '../../common/types';

@Controller('api/auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Get('options')
  options() { return this.authService.options(); }

  @Post('logout')
  logout(@Headers('authorization') authorization: string | undefined, @Body() dto: LogoutDto) {
    return this.authService.logout(authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined,dto?.refresh_token);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  getProfile(@CurrentUser() user: UserProfile) {
    return this.authService.me(user);
  }

  @Post('login')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  refresh(@Body() dto: RefreshDto) { return this.authService.refresh(dto.refresh_token); }

  @Post('register')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }
}
