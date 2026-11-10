import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export const MESSAGE_MAX_LENGTH = 2000;

export class MessageDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, MESSAGE_MAX_LENGTH, {
    message: `메시지는 1~${MESSAGE_MAX_LENGTH}자로 입력해주세요.`,
  })
  content: string;
}

/** before·after는 메시지 ID 경계이며 함께 보낼 수 없다(서비스에서 확인). */
export class MessagesQueryDto {
  @IsOptional()
  @Matches(/^[1-9]\d{0,18}$/, { message: 'before는 메시지 ID여야 합니다.' })
  before?: string;

  @IsOptional()
  @Matches(/^[1-9]\d{0,18}$/, { message: 'after는 메시지 ID여야 합니다.' })
  after?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit은 정수여야 합니다.' })
  @Min(1, { message: 'limit은 1 이상이어야 합니다.' })
  @Max(100, { message: 'limit은 100 이하여야 합니다.' })
  limit?: number;
}
