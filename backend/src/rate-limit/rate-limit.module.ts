import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import {
  InviteCodeRateLimitGuard,
  LoginRateLimitGuard,
  RATE_LIMITS,
} from './rate-limit';

/**
 * 시도 횟수 기록 저장소를 앱 전체에서 하나만 쓰도록 이 모듈로 감싼다.
 * 가드를 쓰는 모듈(Auth, Teams)이 가져다 쓴다.
 */
@Module({
  imports: [ThrottlerModule.forRoot({ throttlers: RATE_LIMITS })],
  providers: [LoginRateLimitGuard, InviteCodeRateLimitGuard],
  exports: [ThrottlerModule, LoginRateLimitGuard, InviteCodeRateLimitGuard],
})
export class RateLimitModule {}
