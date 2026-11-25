# 캘린더 조회 API

`GET /calendar/assignments?from=2026-08-30&to=2026-10-10`

로그인 쿠키(`access_token`, 배포 주소에서는 `__Host-access_token`)가 필요하다. 응답은 `Cache-Control: private, no-store`로 캐시하지 않는다.

## 조회 조건

- `from`, `to`는 필수이며 실제로 존재하는 `YYYY-MM-DD` 날짜여야 한다.
- 양 끝을 포함해 최대 62일까지 조회할 수 있다. 프론트엔드는 현재 달의 앞뒤 날짜를 포함한 42일을 요청한다.
- 사용자 식별은 JWT에서만 수행한다. `userId`, `teamId` 등 추가 쿼리 파라미터는 허용하지 않는다.
- 개인 과제는 로그인 사용자 소유, 팀 과제는 해당 사용자의 `TeamMember`가 있는 팀으로 제한한다.
- 팀 소유자도 팀 생성 시 `OWNER` 멤버십을 만들어야 한다. 소유자라는 이유만으로 멤버십 조건을 우회하지 않는다.
- 시작일 또는 마감일이 NULL인 과제, 시작일이 마감일보다 늦은 과제는 제외한다.
- 완료 과제도 포함한다. `startDate < to 다음 날 00:00 UTC`이며 `dueDate >= from 00:00 UTC`인 과제가 대상이다.
- 필터(전체/개인/팀)는 프론트엔드에서 적용하며 필터 변경만으로 재요청하지 않는다.

## 날짜 규칙

API의 날짜와 DB `DateTime` 필드는 UTC 기준으로 해석한다. 날짜 입력은 UTC 자정으로
변환하고, 응답은 UTC 날짜 부분만 `YYYY-MM-DD`로 제공한다. 브라우저는 이 문자열에
시간대 변환을 적용하지 않는다. 시간 값이 있는 기존 데이터는 그 UTC 날짜에 표시된다.

개인 과제 등록·수정 API는 동일한 규칙을 사용한다. 후속 팀 과제 API에서도 날짜 입력을 `YYYY-MM-DD`로 받아 UTC 자정으로 저장해야
동일한 의미가 유지된다. `createdAt`을 시작일로 대신 사용하지 않는다.

## 응답

```json
{
  "assignments": [
    {
      "kind": "personal",
      "id": "1",
      "title": "개인 과제",
      "startDate": "2026-09-18",
      "dueDate": "2026-09-20",
      "status": "TODO"
    },
    {
      "kind": "team",
      "id": "1",
      "title": "팀 과제",
      "startDate": "2026-09-19",
      "dueDate": "2026-09-21",
      "status": "DONE",
      "teamId": "3",
      "teamName": "개신프론티어"
    }
  ]
}
```

ID는 BigInt를 문자열로 변환한다. 개인·팀 과제의 ID가 같을 수 있으므로
`kind`와 `id`를 함께 사용한다. 결과가 없으면 `{"assignments": []}`를 반환한다.
잘못된 쿼리는 400, 미인증·만료된 쿠키는 401이다.

## 내 할 일 (`GET /calendar/tasks?from=&to=`)

캘린더의 마감일 칸에 체크박스와 함께 보일 할 일이다. 기간 규칙(`from`·`to`, 1~62일, 400·401)과 캐시 헤더는 위와 같다.

- **나에게 배정되고**(`assigneeId`가 나) 마감일이 기간 안에 있는, **지금 소속된 팀**의 할 일만 돌려준다(사용자 결정).
  미배정·다른 사람의 할 일, 마감일 없는 할 일, 나간 팀의 할 일은 빠진다.
- 정렬은 마감일, 같은 날이면 ID 순이다.

```json
{
  "tasks": [
    {
      "id": "7",
      "title": "자료 조사",
      "description": "논문 3편",
      "status": "IN_PROGRESS",
      "dueDate": "2026-09-19",
      "assigneeId": "2",
      "teamAssignmentId": "4",
      "teamAssignmentTitle": "발표 준비",
      "teamId": "3",
      "teamName": "개신프론티어"
    }
  ]
}
```

완료 체크는 별도 API 없이 `PUT /tasks/:id`(전체 수정)를 쓴다. 그래서 응답에 제목·설명·담당자·마감일을 함께 담아
바꾸지 않는 값을 그대로 돌려보낼 수 있게 한다. 체크하면 `DONE`, 해제하면 `IN_PROGRESS`다(사용자 결정).

## 프론트엔드 연결

- `frontend/src/components/calendar/calendar.tsx`: 월 상태, 과제·일정·할 일 요청과 취소, 로딩·오류·재시도·새로고침, 401 시 로그인 이동.
  모든 팀의 `assignments`·`schedules`·`team` 변경, `team:removed`, 소켓 재연결 때 보고 있는 달을 조용히 다시 불러온다.
- `month-calendar.tsx`: 필터(전체/개인/팀)를 적용한다. 과제를 누르면 편집 창(팀 과제는 팀 과제 API), 일정은 일정 수정 창,
  할 일 제목은 할 일 수정 창(팀 멤버를 먼저 불러와 담당자 목록을 채운다)을 연다. 일정과 할 일은 전체·팀 필터에서 보인다.
- `calendar-week.tsx`: 과제 막대, 날짜 칸 아래의 팀 일정(주황 점)과 내 할 일(체크박스)을 그린다.
- 임시 과제 생성 함수는 예시용으로 보관하지만 실제 메인 화면에서는 사용하지 않는다.

## 검증

Node.js 24에서 `backend` 디렉터리의 다음 명령으로 통합 테스트를 실행한다.

```sh
npm run test:calendar
```

`CALENDAR_TEST_DATABASE_URL` 또는 `.env`의 `DATABASE_URL`로 로컬 PostgreSQL에 연결한다.
테스트용 무작위 스키마를 생성하여 저장소 마이그레이션을 적용한 뒤 실제 HTTP 요청으로
권한·기간·응답을 검증한다. 종료 시 그 테스트 스키마만 삭제한다. 기존 `public`의
데이터와 인증 세션은 사용하지 않는다. DB 계정에는 스키마 생성 권한이 필요하다.

이 테스트는 기존 Jest/TypeScript 6 설정 문제와 독립적으로 Node 내장 테스트 러너를 사용한다.
