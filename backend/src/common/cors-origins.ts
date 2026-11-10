/** 쿠키 인증 요청을 허용할 프론트엔드 출처 목록. HTTP CORS와 소켓 연결이 함께 쓴다. */
export function corsOrigins() {
  return (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isAllowedOrigin(origin: string | undefined) {
  return !!origin && corsOrigins().includes(origin);
}
