# Prisma 스키마와 마이그레이션

아래 명령은 `backend` 디렉터리에서 실행한다. 이 프로젝트는 기본 파일명이 아닌
`prisma7.config.ts`를 사용하므로 `--config` 옵션을 명시한다.

```sh
npx prisma validate --config prisma7.config.ts
npx prisma migrate deploy --config prisma7.config.ts
npx prisma generate --config prisma7.config.ts
npx prisma migrate status --config prisma7.config.ts
```

`migrate deploy`는 저장소의 미적용 마이그레이션을 DB에 적용한다.
Prisma Client 재생성은 별도 명령이다. 연결 대상은 `backend/.env`의 `DATABASE_URL`이다.

## 개인·팀 과제 시작일

`20260927061835_add_assignment_start_dates`는 `Assignment`와 `TeamAssignment`에
`startDate DateTime? @map("start_date")`를 추가한다. PostgreSQL 타입은 기존
`due_date`와 같은 `TIMESTAMP(3)`이다.

- 기존 과제의 시작일을 추측하지 않도록 기본값과 데이터 보정 없이 NULL을 허용한다.
- 기존 마감일의 선택값 정책을 유지한다. 생성 시각을 시작일로 대체하지 않는다.
- `Task`와 별도 일정 모델인 `Schedule`은 변경하지 않는다.
- 두 컬럼 추가는 하나의 트랜잭션으로 적용한다.

## 후속 API 구현 시 결정할 사항

새 과제의 날짜 필수 여부, 시작일이 마감일보다 늦은 요청의 검증, 날짜가 없는 기존
과제의 캘린더 표시 정책은 API 구현 단계에서 정한다. 현재 DB는 두 날짜가 모두
선택값이며 기간 순서에 대한 CHECK 제약은 없다.

프론트엔드 캘린더는 `YYYY-MM-DD` 형식의 날짜를 사용하므로 API 응답 변환 시 서비스의
날짜·시간대 기준을 명시해야 한다. 이번 변경에는 API 구현이나 실제 데이터 연결이
포함되지 않는다.
