import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  userId: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();
    
    const cookies = request.cookies as
      | Record<string, unknown>
      | undefined;

    const token = cookies?.access_token;

    if (typeof token !== 'string' || !token) {
      throw new UnauthorizedException('로그인이 필요합니다.');
    }
    
    try {
      const payload = await this.jwtService.verifyAsync<{
        sub?: unknown;
        exp?: unknown;
      }>(token);

      if (
        typeof payload.sub !== 'string' || 
        !/^[1-9]\d*$/.test(payload.sub) ||
        typeof payload.exp !== 'number'
      ) {
        throw new Error('유효하지 않은 인증 정보');
      }

      request.userId = payload.sub;
      return true;
    } catch {
      throw new UnauthorizedException(
        '인증 정보가 유효하지 않거나 만료되었습니다.',
      );
    }
  }
}