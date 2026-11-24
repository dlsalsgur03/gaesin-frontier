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
process.env.JWT_SECRET = 'rate-limit-integration-test-secret-only-not-real';
delete process.env.TRUST_PROXY;
const { AuthModule } = require('../dist/auth/auth.module');
const { TeamsModule } = require('../dist/teams/teams.module');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { PrismaClient } = require('../dist/generated/prisma/client');

const schema = `rate_limit_test_${randomUUID().replaceAll('-', '')}`;
const PASSWORD = 'correct-password-1234';
let setup;
let prisma;
let app;
let server;
let schemaCreated = false;
const users = {};
const cookies = {};
let inviteCode;

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
  for (const key of ['victim', 'other', 'owner', 'guesser', 'friend'])
    users[key] = await prisma.user.create({
      data: { email: `${key}@example.test`, nickname: key, passwordHash },
    });
  inviteCode = 'ABCDEFGH23';
  await prisma.team.create({
    data: {
      name: '팀',
      inviteCode,
      ownerId: users.owner.id,
      team_members: { create: { userId: users.owner.id, role: 'OWNER' } },
    },
  });

  const moduleRef = await Test.createTestingModule({
    imports: [AuthModule, TeamsModule],
  })
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
  const jwt = moduleRef.get(JwtService);
  for (const [key, user] of Object.entries(users))
    cookies[key] = `access_token=${jwt.sign({ sub: user.id.toString() })}`;
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

const login = (email, password, ip) => {
  const req = request(server).post('/auth/login').send({ email, password });
  return ip ? req.set('X-Forwarded-For', ip) : req;
};
const join = (key, code) =>
  request(server)
    .post('/teams/join')
    .set('Cookie', cookies[key])
    .send({ inviteCode: code });

test('같은 IP·이메일로 5번 넘게 로그인하면 5분간 429', async () => {
  for (let i = 0; i < 5; i++)
    await login('victim@example.test', 'wrong-password').expect(401);

  const blocked = await login('victim@example.test', 'wrong-password').expect(
    429,
  );
  assert.match(blocked.body.message, /^로그인 시도가 너무 많습니다\. \d+분 후에/);
  const retryAfter = Number(blocked.headers['retry-after']);
  assert.ok(retryAfter > 240 && retryAfter <= 300, `Retry-After ${retryAfter}`);

  // 막힌 동안에는 비밀번호가 맞아도 막는다. 이메일 대소문자·공백을 바꿔도 같은 계정으로 센다.
  await login(' VICTIM@example.test ', PASSWORD).expect(429);
});

test('프록시 설정이 없으면 X-Forwarded-For로 IP를 바꿔도 피할 수 없다', async () => {
  await login('victim@example.test', PASSWORD, '203.0.113.7').expect(429);
});

test('다른 이메일은 따로 센다', async () => {
  const ok = await login('other@example.test', PASSWORD).expect(200);
  assert.ok(String(ok.headers['set-cookie']).includes('access_token='));
});

test('한 IP의 로그인 요청은 계정과 관계없이 1분에 30번까지', async () => {
  // 앞 테스트에서 이 IP로 9번 요청했다.
  let status = 0;
  let count = 9;
  while (count < 40) {
    const res = await login(`user${count}@example.test`, 'wrong-password');
    count += 1;
    status = res.status;
    if (status === 429) {
      assert.match(res.body.message, /^로그인 시도가 너무 많습니다\./);
      break;
    }
    assert.equal(status, 401);
  }
  assert.equal(status, 429);
  assert.equal(count, 31);
});

test('초대 코드는 한 사용자당 10분에 10번까지, 막히면 맞는 코드도 거부', async () => {
  for (let i = 0; i < 10; i++)
    await join('guesser', `WRONGCODE${i}`).expect(404);

  const blocked = await join('guesser', 'WRONGCODEX').expect(429);
  assert.match(
    blocked.body.message,
    /^초대 코드 입력 시도가 너무 많습니다\. \d+분 후에/,
  );
  await join('guesser', inviteCode).expect(429);
  assert.equal(
    await prisma.teamMember.count({ where: { userId: users.guesser.id } }),
    0,
  );
});

test('다른 사용자의 초대 코드 입력은 영향을 받지 않는다', async () => {
  await join('friend', 'WRONGCODE0').expect(404);
  await join('friend', inviteCode.toLowerCase()).expect(201);
});

test('로그인 제한과 초대 코드 제한은 서로 섞이지 않는다', async () => {
  // 이 IP는 로그인이 막혔지만 초대 코드 참여는 사용자 기준이라 그대로 된다.
  await join('other', inviteCode).expect(201);
});
