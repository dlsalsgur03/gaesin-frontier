import { BadRequestException } from '@nestjs/common';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class AssignmentDto {
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

  @Matches(/^[1-9]\d{3}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  startDate: string;

  @Matches(/^[1-9]\d{3}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  dueDate: string;

  @IsIn(['TODO', 'IN_PROGRESS', 'DONE'])
  status: 'TODO' | 'IN_PROGRESS' | 'DONE';
}

/** 개인·팀 과제 공통: 날짜는 UTC 자정으로 저장하고 빈 설명은 삭제로 처리한다. */
export function toAssignmentData(dto: AssignmentDto) {
  if (dto.startDate > dto.dueDate)
    throw new BadRequestException('마감일은 시작일 이후여야 합니다.');
  return {
    title: dto.title,
    description: dto.description?.trim() || null,
    startDate: new Date(`${dto.startDate}T00:00:00.000Z`),
    dueDate: new Date(`${dto.dueDate}T00:00:00.000Z`),
    status: dto.status,
  };
}
