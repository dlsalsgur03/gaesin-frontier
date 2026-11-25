# 팀 채팅 API

모든 요청은 로그인 쿠키(`access_token`, 배포 주소에서는 `__Host-access_token`) 인증이 필요하다. 그 팀의 **현재 멤버**만 읽고 쓸 수 있으며,
멤버가 아니거나 존재하지 않는 팀은 404다. 경로의 팀 ID는 양의 정수 문자열이며 형식이 틀리면 400이다.

보내기는 REST로 하고, 저장된 메시지는 소켓 이벤트 `message:new`로 팀 룸 전체(보낸 사람 포함)에 전달된다.
소켓 연결·인증은 `../realtime/README.md`를 본다.

## 엔드포인트

- `GET /teams/:teamId/messages`: 내역 조회 (200, private/no-store)
- `POST /teams/:teamId/messages`: 보내기 (201). 본문 `{ "content": "..." }`
- `PUT /teams/:teamId/messages/read`: 읽음 표시 (200). 본문 `{ "messageId": "..." }`, 응답 `{ unreadCount }`

메시지는 `{ id, teamId, userId, nickname, content, createdAt }`이다. `nickname`은 작성자의 현재 닉네임,
`createdAt`은 ISO(UTC) 시각이다. 응답은 `{ messages, hasMore }`, `{ message }` 형태다.

## 내용

- `content`는 앞뒤 공백을 제거한 뒤 1~2,000자(JavaScript 문자열 길이 기준). 줄바꿈은 유지한다.
- 작성자·시각은 서버가 정한다. 본문에 다른 필드가 있으면 400이다.
- 메시지 수정·삭제와 메시지별 읽음 확인(누가 읽었는지)은 없다. 안 읽은 메시지 **수**만 센다(아래).
- 화면은 일반 텍스트로 표시하며 HTML로 해석하지 않는다.

## 내역 조회

순서 기준은 메시지 ID(작성 순서)이며, 응답 목록은 항상 **오래된 것 → 최신** 순이다.

| Query | 의미 |
| --- | --- |
| (없음) | 최신 `limit`개 |
| `before=<id>` | 그 메시지보다 오래된 것 중 가장 가까운 `limit`개 (위로 더 불러오기) |
| `after=<id>` | 그 메시지보다 새로운 것 중 가장 오래된 `limit`개 (재연결 후 빈틈 채우기) |
| `limit` | 1~100, 기본 50 |

- `before`와 `after`를 함께 보내면 400. ID 형식이 틀리거나 BIGINT 범위를 넘으면 400.
- `hasMore`는 요청 방향(커서 없음·`before`는 더 오래된 쪽, `after`는 더 새로운 쪽)에 남은 메시지가 있는지다.
- 결과가 없으면 `{ messages: [], hasMore: false }`.

프론트엔드는 처음에 최신 내역을 받고, 위쪽 버튼으로 `before`를 이어 부른다. 소켓이 다시 연결되면
마지막 메시지 ID로 `after`를 `hasMore`가 false가 될 때까지 불러오고, REST·소켓으로 받은 메시지를 ID로 합친다.
전송 응답을 받지 못하면 저장 여부를 알 수 없으므로 자동으로 다시 보내지 않는다.

## 안 읽은 메시지

- 멤버마다 마지막으로 읽은 메시지 ID(`TeamMember.lastReadMessageId`)를 둔다. 그보다 새로운, **다른 사람이 보낸** 메시지가 안 읽은 메시지다.
- `GET /teams`의 각 팀에 `unreadCount`가 있다.
- 읽음 표시는 같은 팀의 메시지 ID를 보내며, 이미 더 뒤까지 읽었다면 뒤로 돌아가지 않는다. 다른 팀 메시지·없는 ID는 404, 형식 오류는 400.
  처리 뒤 내 모든 연결(다른 탭·기기)에 소켓 `messages:read { teamId, unreadCount }`를 보낸다.
- 나중에 참여한 멤버는 참여 시점의 마지막 메시지까지 읽은 것으로 시작한다(참여 전 대화는 세지 않는다).
  마이그레이션 시 기존 멤버는 그때까지의 메시지를 모두 읽은 것으로 맞췄다.
- 프론트는 채팅 탭이 열려 있고 브라우저 탭이 보이는 동안 마지막 메시지까지 읽음 표시한다.
  배지는 상단 `팀` 탭(모든 팀 합계), 팀 목록(팀별), 팀룸 `채팅` 탭에 보인다(`frontend/src/lib/unread.ts`, `components/unread-*.tsx`).

## 연쇄 처리

- 팀을 삭제하면 메시지를 같은 트랜잭션에서 지운다.
- 멤버가 탈퇴하거나 내보내져도 그 멤버가 쓴 메시지는 남는다. 떠난 멤버는 읽거나 쓸 수 없고 실시간 전달도 즉시 끊긴다.

스키마: 조회용 인덱스 `messages(team_id, id)`를 추가하는 `add_message_team_index`, 읽음 위치 `team_members.last_read_message_id`를 추가하는 `add_member_last_read` 마이그레이션이 있다.

검증: backend에서 `npm run test:chat`을 실행한다. 소켓 인증·출처 거부, 404/400, 입력 검증,
같은 팀에만 실시간 전달, `before`·`after` 조회, 참여 즉시 수신, 탈퇴·내보내기·팀 삭제 알림, 토큰 만료 시 연결 종료,
팀 변경 알림(`team:changed`), 안 읽은 수·읽음 표시·`messages:read` 알림을 검사한다.
