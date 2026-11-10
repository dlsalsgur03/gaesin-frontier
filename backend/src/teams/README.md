# 팀 API

모든 요청은 `access_token` 쿠키 인증이 필요하다. 사용자는 JWT에서 결정한다.
멤버가 아닌 팀과 존재하지 않는 팀은 동일하게 404, 멤버지만 소유자가 아니면 403이다.
소유자는 `Team.ownerId`가 기준이며 소유자의 `TeamMember.role`도 항상 `OWNER`로 맞춘다.

- `GET /teams`: 내가 속한 팀 목록 (200, private/no-store). 최근 참여순. `{ teams: [{ id, name, role, memberCount }] }`
- `POST /teams`: 팀 생성 (201). 생성자는 OWNER 멤버가 되고 초대 코드를 발급한다.
- `POST /teams/join`: 초대 코드로 참여 (201). 잘못된 코드는 404, 이미 참여했으면 409.
- `GET /teams/:id`: 상세 (200, private/no-store, 멤버)
- `PUT /teams/:id`: 이름 변경 (200, 소유자)
- `POST /teams/:id/invite-code`: 초대 코드 재발급 (200, 소유자). 이전 코드는 즉시 무효.
- `POST /teams/:id/transfer`: 소유권 이전 (200, 소유자). 본문 `{ userId }`, 대상은 현재 멤버여야 한다.
- `POST /teams/:id/leave`: 탈퇴 (200, 멤버). 소유자는 소유권을 넘긴 뒤 탈퇴한다(400). 맡던 할 일은 미배정이 된다.
- `DELETE /teams/:id/members/:userId`: 멤버 내보내기 (200, 소유자). 소유자 자신은 불가(400). 맡던 할 일은 미배정이 된다.
- `DELETE /teams/:id`: 팀 삭제 (200, 소유자)

팀 이름은 공백 제거 후 1~100자다. 초대 코드는 혼동 문자(0/O, 1/I/L)를 뺀 대문자·숫자 10자이며
입력은 공백 제거 후 대문자로 바꿔 비교한다. 팀 ID와 사용자 ID는 양의 정수 문자열이다.

상세 응답은 `{ team: { id, name, inviteCode, myRole, members: [{ userId, nickname, role, joinedAt, isMe }] } }`이다.
멤버는 OWNER 먼저, 그다음 참여순이다. 초대 코드는 모든 멤버가 볼 수 있다.

외래 키에 cascade가 없으므로 팀 삭제는 한 트랜잭션에서 파일 → Task → 팀 과제 → 일정 → 메시지 → 멤버 → 팀 순으로 지운다.
업로드한 실제 파일은 커밋 뒤 업로드 폴더에서 지운다.
스키마 변경은 없다.

검증: backend에서 `npm run test:teams`를 실행한다. 캘린더 테스트와 같은 방식으로 로컬 PostgreSQL의
임시 스키마에서 권한, 참여, 초대 코드 재발급, 내보내기, 소유권 이전·탈퇴와 캘린더 반영, 삭제 범위를 검사한다.
