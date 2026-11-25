import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { readAccessToken, verifyAccessToken } from './access-token';

export interface AuthenticatedRequest extends Request {
  userId: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const token = readAccessToken(request.headers.cookie, request.headers.origin);

    if (typeof token !== 'string' || !token) {
      throw new UnauthorizedException('로그인이 필요합니다.');
    }

    const verified = await verifyAccessToken(this.jwtService, token);
    if (!verified) {
      throw new UnauthorizedException(
        '인증 정보가 유효하지 않거나 만료되었습니다.',
      );
    }

    request.userId = verified.userId;
    return true;
  }
}
