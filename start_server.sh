#!/usr/bin/env bash
# 개신프론티어 서버(DB · 백엔드 · 프론트엔드)를 백그라운드로 실행한다.
#   bash start_server.sh
# 종료: bash stop_server.sh
set -euo pipefail
cd "$(dirname "$0")"
source scripts/docker-check.sh

URL="http://localhost:3000"
TIMEOUT=180

for image in $(docker compose config --images); do
  if ! docker image inspect "$image" >/dev/null 2>&1; then
    echo "ℹ 아직 없는 이미지가 있어 먼저 빌드·다운로드합니다. 처음에는 몇 분 걸릴 수 있습니다."
    break
  fi
done

echo "▶ 서버를 실행합니다. (DB → 마이그레이션 → 백엔드 → 프론트엔드)"
# up -d는 마이그레이션이 끝날 때까지 기다리고, 실패하면 백엔드를 띄우지 않고 오류로 끝난다.
if ! docker compose up -d; then
  echo
  if docker compose ps -a migrate --format '{{.State}} {{.ExitCode}}' 2>/dev/null |
    grep -Eq '^exited [1-9]'; then
    echo "✘ DB 마이그레이션에 실패했습니다. 로그:"
    docker compose logs --tail 40 migrate
  else
    echo "✘ 서버를 실행하지 못했습니다. 상태와 최근 로그:"
    docker compose ps -a
    docker compose logs --tail 30
  fi
  echo
  echo "  원인을 고친 뒤 다시 실행: bash start_server.sh"
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "✔ 실행을 시작했습니다. 1~2분 뒤 $URL 에 접속하세요. (curl이 없어 준비 상태는 확인하지 않았습니다)"
  echo "  종료: bash stop_server.sh"
  exit 0
fi

printf "▶ 준비될 때까지 기다리는 중"
for ((i = 0; i < TIMEOUT; i += 2)); do
  if curl -fsS -o /dev/null "$URL" 2>/dev/null &&
    curl -fsS -o /dev/null "http://localhost:3001" 2>/dev/null; then
    echo
    echo
    echo "✔ 서버가 실행되었습니다 → $URL"
    echo "  회원가입 후 사용하세요. 브라우저 주소는 127.0.0.1이 아니라 localhost로 입력합니다."
    echo
    echo "  로그 보기: docker compose logs -f"
    echo "  종료:      bash stop_server.sh"
    exit 0
  fi
  printf "."
  sleep 2
done

echo
echo "✘ ${TIMEOUT}초 안에 서버가 준비되지 않았습니다. 최근 로그:"
docker compose ps -a
docker compose logs --tail 30 backend frontend
exit 1
