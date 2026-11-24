# shellcheck shell=bash
# build_image.sh · start_server.sh · stop_server.sh가 공통으로 불러 쓰는 사전 확인.
# Docker와 Compose v2가 설치되어 있고 Docker 엔진이 켜져 있는지 확인한다.

if ! command -v docker >/dev/null 2>&1; then
  echo "✘ Docker가 설치되어 있지 않습니다."
  echo "  Docker Desktop을 설치하세요: https://www.docker.com/products/docker-desktop/"
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "✘ Docker Compose v2(docker compose 명령)를 찾을 수 없습니다."
  echo "  Docker Desktop을 최신 버전으로 설치하거나 Compose 플러그인을 설치하세요."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "✘ Docker 엔진이 실행 중이 아닙니다. Docker Desktop을 켠 뒤 다시 실행하세요."
  exit 1
fi
