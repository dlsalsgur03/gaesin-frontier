#!/usr/bin/env bash
# 실행 중인 개신프론티어 서버를 종료한다. 데이터(DB, 업로드 파일)는 남는다.
#   bash stop_server.sh            # 종료
#   bash stop_server.sh --reset    # 종료하고 데이터까지 모두 삭제
set -euo pipefail
cd "$(dirname "$0")"
source scripts/docker-check.sh

case "${1:-}" in
  "")
    docker compose down
    echo "✔ 서버를 종료했습니다. 데이터는 남아 있으며 bash start_server.sh로 다시 켤 수 있습니다."
    ;;
  --reset)
    # 입력을 받을 수 없는 환경(파이프, CI 등)에서는 지우지 않고 취소한다.
    read -r -p "DB와 업로드 파일을 모두 지웁니다. 계속할까요? [y/N] " answer || answer=""
    case "$answer" in
      [yY]*) docker compose down -v && echo "✔ 종료하고 데이터를 삭제했습니다." ;;
      *) echo "취소했습니다." ;;
    esac
    ;;
  *)
    echo "✘ 알 수 없는 옵션: $1"
    echo "  사용법: bash stop_server.sh [--reset]"
    exit 1
    ;;
esac
