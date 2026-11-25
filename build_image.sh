#!/usr/bin/env bash
# 개신프론티어 Docker 이미지를 빌드한다. 처음 한 번, 그리고 코드를 바꾼 뒤에 실행한다.
#   bash build_image.sh
set -euo pipefail
cd "$(dirname "$0")"
source scripts/docker-check.sh

echo "▶ 이미지를 빌드합니다. 처음에는 의존성을 내려받느라 몇 분 걸릴 수 있습니다."
docker compose build
echo
echo "✔ 빌드가 끝났습니다. 서버 실행: bash start_server.sh"
