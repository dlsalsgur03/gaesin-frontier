require('reflect-metadata');
require('dotenv/config');
const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readdir, readFile } = require('node:fs/promises');
const path = require('node:path');
const argon2 = require('argon2');
const { Client } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const { JwtService } = require('@nestjs/jwt');
const cookieParser = require('cookie-parser');
const request = require('supertest');

// 실행 중인 앱의 비밀키나 인증 세션을 사용하지 않는다.
process.env.JWT_SECRET = 'auth-cookie-integration-test-secret-only-not-real';
const { AuthModule } = require('../dist/auth/auth.module');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { PrismaClient } = require('../dist/generated/prisma/client');

const schema = `auth_cookie_test_${randomUUID().replaceAll('-', '')}`;
const PASSWORD = 'correct-password-1234';
const DEPLOYED = 'https://app.example.com';
const LOCAL = 'http://localhost:3000';
let setup;
let prisma;
let app;
let server;
let schemaCreated = false;
let token;

before(async () => {
  const connectionString =
    process.env.CALENDAR_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  assert.ok(connectionString, '로컬 테스트 DB 연결 문자열이 필요합니다.');
  assert.ok(
    ['localhost', '127.0.0.1', '[::1]'].includes(
      new URL(connectionString).hostname,
    ),
    '테스트는 로컬 PostgreSQL에서만 실행합니다.',
  );
  setup = new Client({ connectionString, connectionTimeoutMillis: 5000 });
  await setup.connect();
  await setup.query(`CREATE SCHEMA "${schema}"`);
  schemaCreated = true;
  await setup.query(`SET search_path TO "${schema}"`);
  const migrationRoot = path.join(__dirname, '../prisma/migrations');
  const entries = await readdir(migrationRoot, { withFileTypes: true });
  for (const entry of entries
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))) {
    await setup.query(
      await readFile(
        path.join(migrationRoot, entry.name, 'migration.sql'),
        'utf8',
      ),
    );
  }
  prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }, { schema }),
  });
  await prisma.$connect();

  const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
  const user = await prisma.user.create({
    data: { email: 'me@example.test', nickname: '나', passwordHash },
  });

  const moduleRef = await Test.createTestingModule({ imports: [AuthModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();
  app = moduleRef.createNestApplication({ logger: false });
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(0, '127.0.0.1');
  server = app.getHttpServer();
  token = moduleRef.get(JwtService).sign({ sub: user.id.toString() });
});

after(async () => {
  try {
    await app?.close();
  } finally {
    try {
      await prisma?.$disconnect();
    } finally {
      try {
        if (schemaCreated) {
          await setup.query('SET search_path TO public');
          // 이 테스트가 생성한 무작위 스키마만 정리한다. public 데이터는 건드리지 않는다.
          await setup.query(`DROP SCHEMA "${schema}" CASCADE`);
        }
      } finally {
        await setup?.end();
      }
    }
  }
});

/** Set-Cookie 한 줄을 { name, value, attrs } 로 나눈다. attrs 키는 소문자. */
function parseSetCookie(line) {
  const [pair, ...rest] = line.split(';').map((part) => part.trim());
  const index = pair.indexOf('=');
  const attrs = {};
  for (const part of rest) {
    const [key, ...value] = part.split('=');
    attrs[key.toLowerCase()] = value.join('=') || true;
  }
  return { name: pair.slice(0, index), value: pair.slice(index + 1), attrs };
}

async function loginCookies(origin, host) {
  let req = request(server)
    .post('/auth/login')
    .send({ email: 'me@example.test', password: PASSWORD });
  if (origin) req = req.set('Origin', origin);
  if (host) req = req.set('Host', host);
  const res = await req.expect(200);
  return (res.headers['set-cookie'] ?? []).map(parseSetCookie);
}

function assertDeployedCookie(cookies) {
  assert.equal(cookies.length, 1);
  const [cookie] = cookies;
  assert.equal(cookie.name, '__Host-access_token');
  assert.equal(cookie.attrs.secure, true);
  assert.equal(cookie.attrs.httponly, true);
  assert.equal(cookie.attrs.samesite, 'Strict');
  assert.equal(cookie.attrs.path, '/');
  assert.equal(cookie.attrs.domain, undefined);
  assert.equal(cookie.attrs['max-age'], '3600');
}

test('배포 주소에서 로그인하면 __Host- 쿠키에 Secure·HttpOnly·SameSite=Strict', async () => {
  assertDeployedCookie(await loginCookies(DEPLOYED));
});

test('Origin이 없어도(같은 주소 배포·직접 호출) 배포용 쿠키를 쓴다', async () => {
  assertDeployedCookie(await loginCookies());
});

test('프록시가 Host를 localhost로 바꿔도 배포 주소면 Secure가 켜진다', async () => {
  assertDeployedCookie(await loginCookies(DEPLOYED, 'localhost:3001'));
});

test('localhost처럼 보이는 다른 주소는 로컬로 보지 않는다', async () => {
  // 로그인 시도 제한(같은 IP·이메일 1분 5번)에 걸리지 않도록 이 테스트에서 2번만 로그인한다.
  assertDeployedCookie(await loginCookies('http://localhost.evil.example'));
  assertDeployedCookie(await loginCookies('http://192.168.0.5:3000'));
});

test('로컬 개발 주소(http://localhost)에서만 Secure 없는 access_token을 쓴다', async () => {
  // 앞에서 이 IP·이메일로 5번 로그인했으므로 다른 계정을 쓴다.
  await prisma.user.create({
    data: {
      email: 'dev@example.test',
      nickname: '개발',
      passwordHash: await argon2.hash(PASSWORD, { type: argon2.argon2id }),
    },
  });
  for (const origin of [LOCAL, 'http://127.0.0.1:3000']) {
    const res = await request(server)
      .post('/auth/login')
      .set('Origin', origin)
      .send({ email: 'dev@example.test', password: PASSWORD })
      .expect(200);
    const [cookie, ...others] = res.headers['set-cookie'].map(parseSetCookie);
    assert.equal(others.length, 0);
    assert.equal(cookie.name, 'access_token');
    assert.equal(cookie.attrs.secure, undefined);
    assert.equal(cookie.attrs.httponly, true);
    assert.equal(cookie.attrs.samesite, 'Strict');
  }
});

const me = (cookie, origin) => {
  let req = request(server).get('/auth/me').set('Cookie', cookie);
  if (origin) req = req.set('Origin', origin);
  return req;
};

test('__Host- 쿠키는 어느 주소에서 와도 받는다', async () => {
  for (const origin of [DEPLOYED, LOCAL, undefined])
    await me(`__Host-access_token=${token}`, origin).expect(200);
});

test('접두사 없는 쿠키는 로컬 개발 주소에서 온 요청만 받는다', async () => {
  await me(`access_token=${token}`, LOCAL).expect(200);
  // 배포 환경에서 다른 서브도메인이 심은 쿠키일 수 있으므로 받지 않는다.
  await me(`access_token=${token}`, DEPLOYED).expect(401);
  await me(`access_token=${token}`).expect(401);
});

test('로그아웃하면 두 쿠키를 모두 같은 속성으로 지운다', async () => {
  const res = await request(server)
    .post('/auth/logout')
    .set('Origin', DEPLOYED)
    .expect(200);
  const cookies = Object.fromEntries(
    res.headers['set-cookie'].map(parseSetCookie).map((c) => [c.name, c]),
  );
  const secure = cookies['__Host-access_token'];
  const local = cookies.access_token;
  assert.ok(secure && local);
  for (const cookie of [secure, local]) {
    assert.equal(cookie.value, '');
    assert.ok(new Date(cookie.attrs.expires) < new Date());
    assert.equal(cookie.attrs.path, '/');
  }
  assert.equal(secure.attrs.secure, true);
  assert.equal(local.attrs.secure, undefined);
});
