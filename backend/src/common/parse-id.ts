import { BadRequestException } from '@nestjs/common';

/** 경로의 ID는 PostgreSQL signed BIGINT 범위의 양의 정수 문자열만 허용한다. */
export function parseId(value: string, message: string) {
  if (!/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n)
    throw new BadRequestException(message);
  return BigInt(value);
}
