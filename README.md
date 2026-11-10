# 개신프론티어

개인·팀 과제, 일정, 파일 공유, 실시간 채팅을 지원하는 협업 웹 서비스.

## 기술 구성

| 영역 | 구성 |
| --- | --- |
| 프론트엔드 | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 — `frontend/` |
| 백엔드 | NestJS 12, TypeScript, Prisma 7, Socket.IO 4 — `backend/` |
| 데이터베이스 | PostgreSQL 17 (Docker) |
| 인증 | Argon2id, JWT HttpOnly 쿠키 |

## 빠르게 실행하기 (Docker만 필요)

[Docker Desktop](https://www.docker.com/products/docker-desktop/)(또는 Docker Engine + Compose v2)만 있으면
운영체제와 관계없이 같은 환경으로 실행된다. 환경 파일을 따로 만들 필요가 없다.

```sh
git clone <fork한 저장소 주소>
cd gaesin-frontier
docker compose up --build
```

http://localhost:3000 에 접속해 회원가입한다.

`docker compose up`은 DB → 마이그레이션 → 백엔드(3001) → 프론트엔드(3000) 순서로 띄운다.
코드를 바꾼 뒤에는 `--build`를 붙여 다시 실행한다. 종료는 `docker compose down`
(데이터까지 지우려면 `docker compose down -v`).

- JWT 서명 키는 백엔드가 처음 시작할 때 무작위로 만들어 Docker 볼륨에 저장한다. 설치마다 다르고 Git에 올라가지 않는다.
- 업로드한 파일도 같은 볼륨(`/data/uploads`)에 저장되어 컨테이너를 다시 만들어도 남는다. `docker compose down -v`로 함께 지워진다.
- DB 계정은 compose 기본값을 쓴다. DB 포트는 이 컴퓨터 안(`127.0.0.1`)에서만 열린다.
- 브라우저 주소는 `localhost`를 쓴다. `127.0.0.1:3000`으로 접속하면 CORS·쿠키 규칙에 막힌다.
  실시간 채팅·알림 연결(Socket.IO)도 백엔드 3001 포트를 함께 쓰며 `CORS_ORIGIN`에 있는 주소에서만 연결된다.

> **로컬 개발용 구성이다.** 서버에 배포할 때는 이 compose를 그대로 쓰지 말고, 루트 `.env`
> (`.env.example` 참고)로 DB 비밀번호와 `JWT_SECRET`을 직접 지정하고 HTTPS를 갖춘 별도 설정을 쓴다.

## 개발 환경 (Node로 직접 실행)

코드를 고치며 바로 반영되는 개발 서버를 쓰려면 Node를 설치한다. 버전은 `.nvmrc`(Node 24)를 따른다.

```sh
nvm use                      # 또는 fnm use, volta 등 — Node 22.12 이상 / 24 권장
node scripts/setup-env.mjs   # backend/.env, frontend/.env.local 생성 (JWT 키 무작위)
docker compose up -d db      # DB만 실행 (호스트 포트 5433)
```

백엔드 (`backend/`):

```sh
npm ci
npx prisma migrate deploy --config prisma7.config.ts
npx prisma generate --config prisma7.config.ts
npm run start:dev
```

프론트엔드 (`frontend/`):

```sh
npm ci
npm run dev
```

Docker로 전체를 실행 중이면 3000·3001 포트가 겹치므로 `docker compose stop frontend backend` 후 개발 서버를 켠다.

## 환경 변수

환경 파일은 Git에 올리지 않는다. 모두 `.env.example`을 바탕으로 만든다.

| 파일 | 필요할 때 | 값 |
| --- | --- | --- |
| `.env` (선택) | Docker 기본값을 바꿀 때 | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `JWT_SECRET` |
| `backend/.env` | 백엔드를 Node로 직접 실행 | `DATABASE_URL`(localhost:5433), `JWT_SECRET`, `PORT`, `CORS_ORIGIN`, `UPLOAD_DIR`(선택, 기본 `backend/uploads`) |
| `frontend/.env.local` | 프론트엔드를 Node로 직접 실행 | `NEXT_PUBLIC_API_URL`(기본 `http://localhost:3001`) |

`node scripts/setup-env.mjs`는 `backend/.env`와 `frontend/.env.local`을 만들고, 이미 있는 파일은 건드리지 않는다.
DB 비밀번호는 DB를 처음 만들 때만 적용되므로, 바꾸려면 `docker compose down -v`로 DB를 지우고 다시 띄운다.

## 검사

| 위치 | 명령 |
| --- | --- |
| `backend/` | `npm run lint`, `npx tsc --noEmit -p tsconfig.json` |
| `backend/` | `npm run test:calendar`, `npm run test:teams`, `npm run test:files`, `npm run test:chat`, `npm run test:schedules` — 로컬 PostgreSQL(`docker compose up -d db`) 필요 |
| `frontend/` | `npm run lint`, `npx tsc --noEmit`, `npm run test:calendar`, `npm run build` |

백엔드 통합 테스트는 `DATABASE_URL`의 로컬 DB에 무작위 스키마를 만들어 쓰고 끝나면 지운다.
테스트가 `dist/`를 다시 빌드하므로 `npm run start:dev`는 멈춘 뒤 실행한다.

API 계약은 `backend/src/{assignments,calendar,teams,team-assignments,files,chat,schedules}/README.md`에,
실시간 연결(소켓 인증·이벤트)은 `backend/src/realtime/README.md`에 있다.
