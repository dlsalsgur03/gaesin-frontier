import { BadRequestException } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  IsISO8601,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/**
 * 일정 시각은 시간대를 포함한 ISO 8601(예: 2026-11-10T15:30:00+09:00, ...Z)만 받는다.
 * 시간대가 없으면 서버가 어느 시각인지 알 수 없으므로 400이다.
 */
const DATETIME =
  /^[1-9]\d{3}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const datetimeMessage = (field: string) =>
  `${field}는 시간대를 포함한 ISO 8601 시각이어야 합니다.`;

export class ScheduleDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 100)
  title: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(10000)
  description?: string;

  @Matches(DATETIME, { message: datetimeMessage('startAt') })
  @IsISO8601({ strict: true }, { message: datetimeMessage('startAt') })
  startAt: string;

  /** 선택값이다. 생략·null이면 시작 시각과 같은 시각으로 저장한다. */
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Matches(DATETIME, { message: datetimeMessage('endAt') })
  @IsISO8601({ strict: true }, { message: datetimeMessage('endAt') })
  endAt?: string | null;
}

export class CalendarScheduleQueryDto {
  @Matches(DATETIME, { message: datetimeMessage('from') })
  @IsISO8601({ strict: true }, { message: datetimeMessage('from') })
  from: string;

  @Matches(DATETIME, { message: datetimeMessage('to') })
  @IsISO8601({ strict: true }, { message: datetimeMessage('to') })
  to: string;
}

/** 종료를 비우면 시작과 같게 하고, 종료가 시작보다 앞서면 400이다. */
export function toScheduleTimes(dto: ScheduleDto) {
  const startAt = new Date(dto.startAt);
  const endAt = dto.endAt ? new Date(dto.endAt) : startAt;
  if (endAt < startAt)
    throw new BadRequestException('종료 시각은 시작 시각 이후여야 합니다.');
  return { startAt, endAt };
}
