# 파일 API

모든 요청은 로그인 쿠키(`access_token`, 배포 주소에서는 `__Host-access_token`) 인증이 필요하다. 개인 과제 첨부는 과제 소유자만, 팀 파일은 그 팀의 현재 멤버만
볼 수 있다. 권한이 없거나 존재하지 않는 자원은 404, 볼 수는 있지만 금지된 행위(남이 올린 파일 삭제·연결 변경)는 403이다.
경로의 ID는 양의 정수 문자열이며 형식이 틀리면 400이다.

## 엔드포인트

- `GET /assignments/:id/files`: 개인 과제 첨부 목록 (200, private/no-store)
- `POST /assignments/:id/files`: 개인 과제에 첨부 (201)
- `GET /teams/:teamId/files`: 팀 파일 전체 목록 (200, private/no-store). 각 파일에 연결된 팀 과제가 들어 있다.
- `POST /teams/:teamId/files`: 팀 파일 올리기 (201). 선택 필드 `teamAssignmentId`로 같은 팀 과제에 연결한다.
- `PUT /files/:id`: 팀 파일의 연결 과제 변경 (200, 업로더 본인). 본문 `{ "teamAssignmentId": "3" }`, 생략하거나 null이면 연결 해제.
- `GET /files/:id/download`: 내려받기 (200, private/no-store)
- `DELETE /files/:id`: 삭제 (200, 업로더 본인). 응답 `{ message }`.

목록은 최근 업로드순(createdAt/id 내림차순)이다. 응답은 `{ files }`, `{ file }` 형태이며 파일은
`{ id, fileName, size, createdAt, uploaderNickname, isMine, teamAssignmentId, teamAssignmentTitle }`이다.
저장소 키(`file_url`)와 서버 경로는 응답에 넣지 않는다.

## 업로드

- `multipart/form-data`의 `file` 필드 하나. 파일이 없거나 두 개 이상이거나 다른 필드 이름이면 400.
- 파일당 최대 20MB(초과 시 413, `파일은 20MB까지 올릴 수 있습니다.`). 빈 파일은 400. **형식은 제한하지 않는다.**
- 사용자당 총 200MB(`USER_STORAGE_QUOTA_MB`로 변경). 넘으면 413, `저장 공간이 부족합니다. …(지금 nMB 사용 중)…`.
  내 개인 과제 첨부와, 아직 멤버인 팀에 내가 올린 파일을 합쳐 센다(나간 팀에 남은 파일은 지울 수 없으므로 빼고 센다).
  같은 사용자의 업로드가 동시에 와도 넘지 않도록 트랜잭션 안에서 사용자별 advisory lock을 잡고 합계를 센다.
  한도를 넘은 업로드는 디스크에 쓴 파일을 지운다.
- 원본 파일명은 경로 구분자·제어 문자를 뺀 1~255자로 표시용으로만 저장한다. 한글 파일명은 UTF-8로 받는다.
- 디스크에는 무작위 UUID 이름으로 저장한다. 저장 뒤 권한·입력 확인에 실패하면 쓴 파일을 지운다.

## 내려받기

형식과 관계없이 `Content-Type: application/octet-stream`, `Content-Disposition: attachment`,
`X-Content-Type-Options: nosniff`로 응답해 브라우저가 파일을 열거나 실행하지 않게 한다.
한글 파일명은 `filename*=UTF-8''…`로 넣는다. 프론트엔드는 쿠키를 붙여 fetch한 뒤 Blob으로 저장한다.

## 저장 위치

백엔드 서버 디스크의 `UPLOAD_DIR`(기본 `backend/uploads`, Docker는 `backend_data` 볼륨의 `/data/uploads`)에 저장한다.
팀원은 같은 서버를 통해 파일을 받는다. 저장 처리는 `file-storage.ts`에 모아 두어 S3 등으로 바꿀 때 이 파일만 고친다.

## 삭제와 연쇄 처리

- 개인 과제를 삭제하면 첨부 기록을 같은 트랜잭션에서 지우고, 커밋 뒤 실제 파일을 지운다.
- 팀 과제를 삭제하면 연결된 팀 파일은 지우지 않고 연결만 해제한다(팀 자료로 남는다).
- 팀을 삭제하면 팀 파일 기록과 실제 파일을 모두 지운다.
- 멤버가 탈퇴하거나 내보내져도 그 멤버가 올린 팀 파일은 팀에 남는다. 떠난 멤버는 접근할 수 없다.
- 실제 파일 삭제에 실패하면 요청은 성공으로 두고 서버 로그에 남긴다(DB 기록이 없어 내려받을 수 없다).

스키마: `File.size`(바이트, 기본 0) 컬럼을 추가하는 마이그레이션 `add_file_size`가 있다.

검증: backend에서 `npm run test:files`를 실행한다. 임시 업로드 폴더와 로컬 PostgreSQL 임시 스키마에서
권한(404/403), 한글 파일명, 크기 제한, 실패 시 파일 정리, 과제 연결, 연쇄 삭제와 실제 파일 삭제를 검사한다.
