# 개인 과제 API

모든 요청은 `access_token` 쿠키 인증이 필요하다. 소유자는 JWT에서 결정하며
다른 사용자의 과제와 존재하지 않는 과제는 동일하게 404로 응답한다.

- `POST /assignments`: 등록 (201)
- `GET /assignments/:id`: 상세 조회 (200, private/no-store)
- `PUT /assignments/:id`: 전체 수정 및 완료 상태 변경 (200)
- `DELETE /assignments/:id`: 삭제 (200)

등록·수정 본문:

```json
{
  "title": "개인 과제",
  "description": "선택 설명",
  "startDate": "2026-09-30",
  "dueDate": "2026-10-02",
  "status": "TODO"
}
```

제목은 공백 제거 후 1~100자, 설명은 최대 10,000자이다. 설명 생략/빈 문자열은
설명 삭제로 처리한다. 날짜는 실재하는 YYYY-MM-DD 필수이며 시작일 ≤ 마감일이다.
UTC 자정으로 저장한다. 상태는 TODO/DONE만 허용한다. 추가 필드는 거부한다.
응답은 `{ "assignment": { "id": "문자열", ... } }` 형태이고 삭제 응답은 message이다.
DB 스키마 변경은 없다.

캘린더의 개인 과제 등록 버튼과 개인 과제 클릭으로 편집 창을 연다.
저장 후 시작일이 있는 달로 이동하고 재조회한다. 팀 필터에서는 개인 필터로 전환한다.
삭제 전 확인 단계를 거치며, 요청 실패 시 입력값을 유지한다.

검증: backend에서 `npm run test:calendar`를 실행한다. 기존 캘린더 테스트와 함께
개인 과제 CRUD, 타인 접근 차단, 입력 검증, 캘린더 반영을 임시 PostgreSQL 스키마에서 검사한다.
