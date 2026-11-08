# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS base
# Prisma 마이그레이션 엔진이 openssl을 쓴다.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# 의존성 설치 + Prisma 클라이언트 생성 + 빌드. compose의 migrate 서비스도 이 단계를 쓴다.
FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate --config prisma7.config.ts && npm run build

FROM build AS prune
RUN npm prune --omit=dev

FROM base AS runtime
COPY --from=prune /app/package.json ./package.json
COPY --from=prune /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/backend-entrypoint
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3001
ENTRYPOINT ["backend-entrypoint"]
CMD ["node", "dist/main"]
