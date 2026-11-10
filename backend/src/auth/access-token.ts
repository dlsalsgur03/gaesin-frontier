import type { JwtService } from '@nestjs/jwt';

export const ACCESS_TOKEN_COOKIE = 'access_token';

/** Cookie 헤더에서 access_token 값을 꺼낸다. 없으면 undefined. */
export function readAccessTokenCookie(header: string | undefined) {
  for (const part of header?.split(';') ?? []) {
    const index = part.indexOf('=');
    if (index < 0 || part.slice(0, index).trim() !== ACCESS_TOKEN_COOKIE)
      continue;
    try {
      return decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
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
