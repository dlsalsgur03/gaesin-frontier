import { IsDateString, Matches } from 'class-validator';

export class CalendarQueryDto {
  @Matches(/^[1-9]\d{3}-\d{2}-\d{2}$/, {
    message: 'from은 YYYY-MM-DD 형식이어야 합니다.',
  })
  @IsDateString({ strict: true }, { message: 'from은 유효한 날짜여야 합니다.' })
  from: string;

  @Matches(/^[1-9]\d{3}-\d{2}-\d{2}$/, {
    message: 'to는 YYYY-MM-DD 형식이어야 합니다.',
  })
  @IsDateString({ strict: true }, { message: 'to는 유효한 날짜여야 합니다.' })
  to: string;
}
