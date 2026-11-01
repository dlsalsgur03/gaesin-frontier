# 팀 과제·할 일 API

모든 요청은 `access_token` 쿠키 인증이 필요하다. 팀 과제와 할 일은 해당 팀의 **모든 멤버**가
등록·수정·삭제할 수 있다. 멤버가 아니거나 존재하지 않는 자원은 동일하게 404로 응답한다.
경로의 ID는 양의 정수 문자열이며 형식이 틀리면 400이다.

## 팀 과제

- `GET /teams/:teamId/assignments`: 팀 과제 목록 (200, private/no-store). 마감일 오름차순(없으면 마지막), id 오름차순.
- `POST /teams/:teamId/assignments`: 등록 (201)
- `GET /team-assignments/:id`: 상세 (200, private/no-store)
- `PUT /team-assignments/:id`: 전체 수정 (200)
- `DELETE /team-assignments/:id`: 삭제 (200). 딸린 할 일과 첨부파일 행도 한 트랜잭션에서 지운다.

본문은 개인 과제와 같은 `AssignmentDto`(title, description, startDate, dueDate, status)이며 검증 규칙도 같다.
시작일·마감일은 필수 `YYYY-MM-DD`이고 UTC 자정으로 저장한다. 날짜 변환은 `toAssignmentData`를 공유한다.

응답은 `{ assignment: { id, teamId, teamName, title, description, startDate, dueDate, status, taskCount, doneTaskCount } }`이다.

## 할 일(Task)

- `GET /team-assignments/:id/tasks`: 목록 (200, private/no-store). 마감일 오름차순(없으면 마지막), id 오름차순.
- `POST /team-assignments/:id/tasks`: 등록 (201)
- `PUT /tasks/:id`: 전체 수정 (200). 생략한 설명·담당자·마감일은 비운다.
- `DELETE /tasks/:id`: 삭제 (200)

본문: `title`(공백 제거 후 1~100자), `description`(선택, 최대 10,000자), `assigneeId`(선택, null은 미배정),
`dueDate`(선택 `YYYY-MM-DD`, null은 마감일 없음), `status`(TODO/IN_PROGRESS/DONE).
담당자는 같은 팀의 현재 멤버만 지정할 수 있으며 아니면 400이다.
멤버가 팀을 떠나거나 내보내지면 그 멤버가 맡던 이 팀의 할 일은 미배정으로 바뀐다.

응답은 `{ task: { id, teamAssignmentId, title, description, assigneeId, assigneeNickname, dueDate, status } }`이다.

권한 확인 직후 다른 요청이 같은 행을 지운 경우에도 500 대신 404로 응답한다.
스키마 변경은 없다.

검증: backend에서 `npm run test:teams`를 실행한다. 팀 API 테스트와 함께 비멤버 차단, 입력 검증,
일반 멤버의 등록·수정과 캘린더 반영, 담당자 검증, 정렬, 멤버 탈퇴 시 미배정, 연쇄 삭제 범위를 검사한다.
