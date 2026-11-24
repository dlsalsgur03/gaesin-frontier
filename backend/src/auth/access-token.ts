import type { CookieOptions } from 'express';
import type { JwtService } from '@nestjs/jwt';

/** 로컬 개발(http://localhost)에서 쓰는 쿠키 이름 */
export const ACCESS_TOKEN_COOKIE = 'access_token';
/**
 * 배포(HTTPS)에서 쓰는 쿠키 이름. `__Host-` 접두사가 붙으면 브라우저가 Secure·Path=/·Domain 없음을
 * 강제하고, 같은 상위 도메인의 다른 서브도메인이 이 쿠키를 만들거나 덮어쓰지 못한다.
 */
export const SECURE_ACCESS_TOKEN_COOKIE = '__Host-access_token';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * 요청을 보낸 프론트엔드가 이 컴퓨터의 http 주소(로컬 개발)인지.
 * Host 헤더는 프록시(Nginx 등)가 localhost로 바꿔 보낼 수 있어 쓰지 않고, 브라우저가 붙이는 Origin을 본다.
 * 웹 페이지는 Origin을 속일 수 없고, 직접 위조한 요청은 그 요청을 보낸 사람의 쿠키에만 영향을 준다.
 */
export function isLocalDevOrigin(origin: unknown) {
  if (typeof origin !== 'string') return false;
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

/**
 * 로그인 쿠키의 이름과 속성. 기본은 배포용(HTTPS 전용, __Host- 접두사)이고,
 * 로컬 개발 주소에서 온 요청일 때만 http에서도 동작하는 이름·속성을 쓴다.
 * 그래서 어떤 설정으로 배포하든 실제 도메인에서는 Secure가 꺼지지 않는다.
 */
export function accessTokenCookie(origin: unknown) {
  return cookieFor(isLocalDevOrigin(origin));
}

/** 로그아웃할 때 지울 쿠키 두 가지(배포용, 로컬 개발용) */
export function allAccessTokenCookies() {
  return [cookieFor(false), cookieFor(true)];
}

function cookieFor(local: boolean): { name: string; options: CookieOptions } {
  return {
    name: local ? ACCESS_TOKEN_COOKIE : SECURE_ACCESS_TOKEN_COOKIE,
    options: {
      httpOnly: true,
      secure: !local,
      sameSite: 'strict',
      path: '/',
    },
  };
}

function cookieValue(header: string | undefined, name: string) {
  for (const part of header?.split(';') ?? []) {
    const index = part.indexOf('=');
    if (index < 0 || part.slice(0, index).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Cookie 헤더에서 로그인 토큰을 꺼낸다. 없으면 undefined.
 * 배포용 __Host- 쿠키를 먼저 보고, 접두사 없는 쿠키는 로컬 개발 주소에서 온 요청일 때만 받는다
 * (배포 환경에서 다른 서브도메인이 심은 쿠키를 받아들이지 않기 위해서다).
 */
export function readAccessToken(header: string | undefined, origin: unknown) {
  return (
    cookieValue(header, SECURE_ACCESS_TOKEN_COOKIE) ??
    (isLocalDevOrigin(origin)
      ? cookieValue(header, ACCESS_TOKEN_COOKIE)
      : undefined)
  );
}

/**
 * HTTP 요청과 소켓 연결이 같은 규칙으로 access_token을 검증한다.
 * 유효하면 사용자 ID와 만료 시각(초)을, 아니면 null을 돌려준다.
 */
export async function verifyAccessToken(
  jwtService: JwtService,
  token: unknown,
): Promise<{ userId: string; exp: number } | null> {
  if (typeof token !== 'string' || !token) return null;
  try {
    const payload = await jwtService.verifyAsync<{
      sub?: unknown;
      exp?: unknown;
    }>(token);
    if (
      typeof payload.sub !== 'string' ||
      !/^[1-9]\d*$/.test(payload.sub) ||
      typeof payload.exp !== 'number'
    )
      return null;
    return { userId: payload.sub, exp: payload.exp };
  } catch {
    return null;
  }
}
