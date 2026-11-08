#!/bin/sh
# JWT_SECRET이 비어 있으면 처음 시작할 때 무작위 키를 만들어 /data 볼륨에 저장하고 이후 계속 쓴다.
# 설치마다 키가 달라지고, 컨테이너를 다시 만들어도 로그인이 유지된다.
set -eu

if [ -z "${JWT_SECRET:-}" ]; then
  secret_file=/data/jwt_secret
  if [ ! -s "$secret_file" ]; then
    node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))" > "$secret_file"
    chmod 600 "$secret_file"
    echo "JWT_SECRET이 없어 새로 만들었습니다 ($secret_file)."
  fi
  JWT_SECRET=$(cat "$secret_file")
  export JWT_SECRET
fi

exec "$@"
