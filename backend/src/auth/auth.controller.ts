import { 
  Body, 
  Controller, 
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { accessTokenCookie, allAccessTokenCookies } from './access-token';
import { LoginRateLimitGuard } from '../rate-limit/rate-limit';
import type { AuthenticatedRequest } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(LoginRateLimitGuard)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(dto);

    // 배포 주소에서는 __Host-access_token(Secure), 로컬 개발 주소에서만 access_token(http 허용).
    const cookie = accessTokenCookie(request.headers.origin);
    response.cookie(cookie.name, result.accessToken, {
      ...cookie.options,
      maxAge: 60 * 60 * 1000,
    });

    return {
      message: '로그인되었습니다.',
      user: result.user,
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@Req() request: AuthenticatedRequest) {
    const user = await this.authService.getMe(request.userId);
    return { user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) response: Response) {
    // 어느 환경에서 만든 쿠키든 지운다. 지울 때도 만들 때와 같은 속성이어야 브라우저가 지운다.
    for (const cookie of allAccessTokenCookies())
      response.clearCookie(cookie.name, cookie.options);

    return {
      message: '로그아웃되었습니다.',
    };
  }
}