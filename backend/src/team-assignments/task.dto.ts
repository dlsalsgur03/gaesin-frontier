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

export class TaskDto {
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

  /** 생략·null은 미배정이다. 같은 팀 멤버인지는 서비스에서 확인한다. */
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  @Matches(/^[1-9]\d{0,18}$/)
  assigneeId?: string | null;

  /** 할 일 마감일은 선택값이다. 생략·null은 마감일 없음이다. */
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @Matches(/^[1-9]\d{3}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  dueDate?: string | null;

  @IsIn(['TODO', 'IN_PROGRESS', 'DONE'])
  status: 'TODO' | 'IN_PROGRESS' | 'DONE';
}
