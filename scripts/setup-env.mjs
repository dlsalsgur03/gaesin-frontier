#!/usr/bin/env node
// Node로 직접 개발할 때 필요한 환경 파일(backend/.env, frontend/.env.local)을 .env.example에서 만든다.
// 이미 있는 파일은 건드리지 않는다. 의존성 없이 Node만으로 동작한다(Windows·macOS·Linux).
// Docker로만 실행할 때는 필요 없다(`docker compose up --build`).
//
//   node scripts/setup-env.mjs

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// compose.yaml의 기본값과 같아야 한다.
const DB_DEFAULTS = {
  POSTGRES_USER: "gaesin",
  POSTGRES_PASSWORD: "gaesin_local",
  POSTGRES_DB: "gaesin_frontier",
};

function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return values;
}

function setValue(text, key, value) {
  const pattern = new RegExp(`^${key}=.*$`, "m");
  return pattern.test(text)
    ? text.replace(pattern, `${key}=${value}`)
    : `${text.trimEnd()}\n${key}=${value}\n`;
}

function create(target, example, transform) {
  const targetPath = join(root, target);
  if (existsSync(targetPath)) {
    console.log(`건너뜀  ${target} (이미 있음)`);
    return;
  }
  writeFileSync(targetPath, transform(readFileSync(join(root, example), "utf8")));
  console.log(`생성    ${target}`);
}

// 루트 .env에 DB 계정을 바꿔 두었다면 그 값을 따른다. 없으면 compose 기본값.
const rootEnvPath = join(root, ".env");
const rootEnv = existsSync(rootEnvPath)
  ? parseEnv(readFileSync(rootEnvPath, "utf8"))
  : {};
const db = Object.fromEntries(
  Object.entries(DB_DEFAULTS).map(([key, value]) => [key, rootEnv[key] || value]),
);

create("backend/.env", "backend/.env.example", (text) => {
  const url = `postgresql://${encodeURIComponent(db.POSTGRES_USER)}:${encodeURIComponent(
    db.POSTGRES_PASSWORD,
  )}@localhost:5433/${encodeURIComponent(db.POSTGRES_DB)}`;
  const next = setValue(text, "DATABASE_URL", url);
  return setValue(next, "JWT_SECRET", randomBytes(32).toString("base64url"));
});

create("frontend/.env.local", "frontend/.env.example", (text) => text);
