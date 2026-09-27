require('reflect-metadata');
require('dotenv/config');
const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readdir, readFile } = require('node:fs/promises');
const path = require('node:path');
const { Client } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const { JwtService } = require('@nestjs/jwt');
const cookieParser = require('cookie-parser');
const request = require('supertest');

// 실행 중인 앱의 비밀키나 인증 세션을 사용하지 않는다.
process.env.JWT_SECRET = 'calendar-api-integration-test-secret-only';
const { CalendarModule } = require('../dist/calendar/calendar.module');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { PrismaClient } = require('../dist/generated/prisma/client');

const schema = `calendar_test_${randomUUID().replaceAll('-', '')}`;
const endpoint = '/calendar/assignments';
const range = { from: '2026-08-30', to: '2026-10-10' };
const at = (day) => new Date(`${day}T00:00:00.000Z`);
let setup;
let prisma;
let app;
let schemaCreated = false;
let cookie;
let otherCookie;
let jwt;
let userId;

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

  const user = await prisma.user.create({
    data: {
      email: 'calendar@example.test',
      nickname: '테스트 사용자',
      passwordHash: 'not-a-login-password',
    },
  });
  const other = await prisma.user.create({
    data: {
      email: 'other@example.test',
      nickname: '다른 사용자',
      passwordHash: 'not-a-login-password',
    },
  });
  userId = user.id;
  const joined = await prisma.team.create({
    data: {
      name: '참여 팀',
      inviteCode: 'joined',
      ownerId: other.id,
      team_members: { create: { userId: user.id, role: 'MEMBER' } },
    },
  });
  const hidden = await prisma.team.create({
    data: {
      name: '미참여 팀',
      inviteCode: 'hidden',
      ownerId: other.id,
      team_members: { create: { userId: other.id, role: 'OWNER' } },
    },
  });
  await prisma.assignment.createMany({
    data: [
      {
        userId: user.id,
        title: '시작 경계에 종료',
        startDate: at('2026-08-28'),
        dueDate: at(range.from),
      },
      {
        userId: user.id,
        title: '끝 경계의 늦은 시간',
        startDate: new Date('2026-10-10T23:59:59.999Z'),
        dueDate: at('2026-10-12'),
      },
      {
        userId: user.id,
        title: '여러 달에 걸친 과제',
        startDate: at('2026-07-01'),
        dueDate: at('2026-12-31'),
      },
      {
        userId: user.id,
        title: '하루짜리 완료 과제',
        startDate: at('2026-09-19'),
        dueDate: at('2026-09-19'),
        status: 'DONE',
      },
      { userId: user.id, title: '시작일 없음', dueDate: at('2026-09-19') },
      { userId: user.id, title: '마감일 없음', startDate: at('2026-09-19') },
      {
        userId: user.id,
        title: '기간 역전',
        startDate: at('2026-09-21'),
        dueDate: at('2026-09-20'),
      },
      {
        userId: user.id,
        title: '기간 이전',
        startDate: at('2026-08-01'),
        dueDate: new Date('2026-08-29T23:59:59.999Z'),
      },
      {
        userId: user.id,
        title: '기간 이후',
        startDate: at('2026-10-11'),
        dueDate: at('2026-10-12'),
      },
      {
        userId: other.id,
        title: '다른 사람의 비공개 과제',
        startDate: at('2026-09-19'),
        dueDate: at('2026-09-19'),
      },
    ],
  });
  await prisma.teamAssignment.createMany({
    data: [
      {
        teamId: joined.id,
        title: '참여 팀 과제',
        startDate: at('2026-09-18'),
        dueDate: at('2026-09-22'),
        status: 'DONE',
      },
      {
        teamId: hidden.id,
        title: '미참여 팀 과제',
        startDate: at('2026-09-19'),
        dueDate: at('2026-09-19'),
      },
      { teamId: joined.id, title: '팀 시작일 없음', dueDate: at('2026-09-19') },
      {
        teamId: joined.id,
        title: '팀 마감일 없음',
        startDate: at('2026-09-19'),
      },
    ],
  });

  const moduleRef = await Test.createTestingModule({
    imports: [CalendarModule],
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
  jwt = moduleRef.get(JwtService);
  cookie = `access_token=${jwt.sign({ sub: user.id.toString() })}`;
  otherCookie = `access_token=${jwt.sign({ sub: other.id.toString() })}`;
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
          await setup.query('ROLLBACK');
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

test('미인증·변조·만료된 쿠키는 401', async () => {
  await request(app.getHttpServer()).get(endpoint).query(range).expect(401);
  await request(app.getHttpServer())
    .get(endpoint)
    .query(range)
    .set('Cookie', 'access_token=invalid')
    .expect(401);
  const expired = jwt.sign({ sub: userId.toString() }, { expiresIn: -1 });
  await request(app.getHttpServer())
    .get(endpoint)
    .query(range)
    .set('Cookie', `access_token=${expired}`)
    .expect(401);
});

test('개인 소유권·팀 멤버십·기간·NULL 필터를 실제 PostgreSQL에서 적용한다', async () => {
  const { body, headers } = await request(app.getHttpServer())
    .get(endpoint)
    .query(range)
    .set('Cookie', cookie)
    .expect(200);
  assert.deepEqual(
    body.assignments.map((task) => task.title).sort(),
    [
      '시작 경계에 종료',
      '끝 경계의 늦은 시간',
      '여러 달에 걸친 과제',
      '하루짜리 완료 과제',
      '참여 팀 과제',
    ].sort(),
  );
  assert.equal(headers['cache-control'], 'private, no-store');
  for (const task of body.assignments) {
    assert.equal(typeof task.id, 'string');
    assert.match(task.startDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(task.dueDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal('userId' in task, false);
    assert.equal('passwordHash' in task, false);
  }
  const team = body.assignments.find((task) => task.kind === 'team');
  assert.equal(team.teamName, '참여 팀');
  assert.equal(typeof team.teamId, 'string');
  assert.equal(team.status, 'DONE');
  assert.equal(
    body.assignments.find((task) => task.title === '끝 경계의 늦은 시간')
      .startDate,
    '2026-10-10',
  );
  assert.equal(
    body.assignments.find((task) => task.title === '하루짜리 완료 과제').status,
    'DONE',
  );
});

test('다른 로그인 사용자는 자기 과제와 자기 참여 팀만 조회한다', async () => {
  const { body } = await request(app.getHttpServer())
    .get(endpoint)
    .query(range)
    .set('Cookie', otherCookie)
    .expect(200);
  assert.deepEqual(
    body.assignments.map((task) => task.title).sort(),
    ['다른 사람의 비공개 과제', '미참여 팀 과제'].sort(),
  );
});

test('한 날짜 조회도 양 끝 포함 규칙을 적용한다', async () => {
  const { body } = await request(app.getHttpServer())
    .get(endpoint)
    .query({ from: '2026-09-19', to: '2026-09-19' })
    .set('Cookie', cookie)
    .expect(200);
  assert.deepEqual(
    body.assignments.map((task) => task.title).sort(),
    ['여러 달에 걸친 과제', '하루짜리 완료 과제', '참여 팀 과제'].sort(),
  );
});

test('빈 기간은 빈 배열을 반환한다', async () => {
  const { body } = await request(app.getHttpServer())
    .get(endpoint)
    .query({ from: '2027-01-01', to: '2027-01-31' })
    .set('Cookie', cookie)
    .expect(200);
  assert.deepEqual(body, { assignments: [] });
});

test('잘못된 날짜·누락·역전·과도한 기간·추가 파라미터는 400', async () => {
  for (const query of [
    {},
    { from: range.from },
    { ...range, from: '2026-02-30' },
    { ...range, from: '2026-2-01' },
    { ...range, from: '2026-09-01T00:00:00Z' },
    { from: '2026-10-10', to: '2026-09-01' },
    { from: '2026-01-01', to: '2026-12-31' },
    { ...range, userId: '2' },
    { ...range, teamId: '2' },
    { from: ['2026-09-01', '2026-09-02'], to: range.to },
  ]) {
    await request(app.getHttpServer())
      .get(endpoint)
      .query(query)
      .set('Cookie', cookie)
      .expect(400);
  }
});

test('윤년 날짜와 최대 62일 조회는 허용한다', async () => {
  await request(app.getHttpServer())
    .get(endpoint)
    .query({ from: '2024-02-29', to: '2024-02-29' })
    .set('Cookie', cookie)
    .expect(200);
  await request(app.getHttpServer())
    .get(endpoint)
    .query({ from: '2026-07-01', to: '2026-08-31' })
    .set('Cookie', cookie)
    .expect(200);
});

test('팀 탈퇴가 다음 조회에 반영된다', async () => {
  await prisma.teamMember.deleteMany({ where: { userId } });
  const { body } = await request(app.getHttpServer())
    .get(endpoint)
    .query(range)
    .set('Cookie', cookie)
    .expect(200);
  assert.equal(
    body.assignments.some((task) => task.kind === 'team'),
    false,
  );
});
