import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';

export class LoginDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: '올바른 이메일 주소를 입력해주세요.' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @Length(8, 128, {
    message: '비밀번호는 8~128자로 입력해주세요.',
  })
  password!: string;
}