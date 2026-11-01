import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class TeamNameDto {
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  name: string;
}

export class JoinTeamDto {
  // 초대 코드는 대문자로 발급하므로 입력의 대소문자를 구분하지 않는다.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Length(1, 50)
  inviteCode: string;
}

export class TransferTeamDto {
  @IsString()
  @Matches(/^[1-9]\d{0,18}$/)
  userId: string;
}
