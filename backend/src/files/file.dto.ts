import { IsString, Matches, ValidateIf } from 'class-validator';

/** 팀 파일이 연결될 팀 과제. PUT 전체 수정이므로 생략하거나 null이면 연결을 해제한다. */
export class FileTagDto {
  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsString()
  @Matches(/^[1-9]\d{0,18}$/)
  teamAssignmentId?: string | null;
}
