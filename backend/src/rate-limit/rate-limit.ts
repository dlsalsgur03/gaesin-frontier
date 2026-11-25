import { ExecutionContext, Injectable } from '@nestjs/common';
import {
  ThrottlerException,
  ThrottlerGuard,
  type ThrottlerLimitDetail,
} from '@nestjs/throttler';
import type { ThrottlerOptions } from '@nestjs/throttler';

const MINUTE = 60_000;

/**
 * 시도 횟수 제한 규칙. 기록은 서버 메모리에 두므로 서버를 다시 켜면 초기화되고,
 * 서버를 여러 대로 늘리면 Redis 같은 공유 저장소가 필요하다.
 *
 * - login-ip: 한 IP의 로그인 요청 전체. 여러 계정을 돌아가며 대입하는 것을 막는다.
 *   학교처럼 여러 사람이 같은 공인 IP를 쓰는 곳을 고려해 넉넉하게 둔다.
 * - login-account: 한 IP에서 같은 이메일로 하는 로그인. 비밀번호 대입을 막는다.
 *   IP를 함께 묶어, 다른 사람이 일부러 틀려서 내 계정을 잠그지는 못하게 한다.
 * - invite-code: 한 사용자의 초대 코드 참여 요청. 코드를 무작위로 맞혀 보는 것을 막는다.
 */
export const RATE_LIMITS: ThrottlerOptions[] = [
  { name: 'login-ip', ttl: MINUTE, limit: 30 },
  {
    name: 'login-account',
    ttl: MINUTE,
    limit: 5,
    blockDuration: 5 * MINUTE,
    getTracker: (req: Record<string, any>) => {
      const body = req.body as { email?: unknown } | undefined;
      const email =
        typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
      return `${String(req.ip)}|${email}`;
    },
  },
  {
    name: 'invite-code',
    ttl: 10 * MINUTE,
    limit: 10,
    blockDuration: 10 * MINUTE,
    // JwtAuthGuard 다음에 실행되므로 로그인한 사용자 ID가 있다.
    getTracker: (req: Record<string, any>) => `user:${String(req.userId)}`,
  },
];

/** 이 가드가 맡은 규칙만 적용하고, 막힐 때 한국어 메시지와 Retry-After를 보낸다. */
abstract class RateLimitGuard extends ThrottlerGuard {
  protected abstract readonly names: string[];
  protected abstract readonly action: string;

  async onModuleInit() {
    await super.onModuleInit();
    this.throttlers = this.throttlers.filter(({ name }) =>
      this.names.includes(name ?? ''),
    );
  }

  protected async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const seconds = Math.max(1, detail.timeToBlockExpire);
    const { res } = this.getRequestResponse(context);
    this.setResponseHeader(res, 'Retry-After', seconds);
    const wait =
      seconds >= 60 ? `${Math.ceil(seconds / 60)}분` : `${seconds}초`;
    throw new ThrottlerException(
      `${this.action} 시도가 너무 많습니다. ${wait} 후에 다시 시도해주세요.`,
    );
  }
}

@Injectable()
export class LoginRateLimitGuard extends RateLimitGuard {
  protected readonly names = ['login-ip', 'login-account'];
  protected readonly action = '로그인';
}

@Injectable()
export class InviteCodeRateLimitGuard extends RateLimitGuard {
  protected readonly names = ['invite-code'];
  protected readonly action = '초대 코드 입력';
}
