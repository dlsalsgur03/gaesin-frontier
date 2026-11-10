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
const { io } = require('socket.io-client');

// 실행 중인 앱의 비밀키·허용 출처를 사용하지 않는다.
process.env.JWT_SECRET = 'schedules-integration-test-secret-only-not-real';
const ORIGIN = 'http://localhost:3000';
process.env.CORS_ORIGIN = ORIGIN;
const { SchedulesModule } = require('../dist/schedules/schedules.module');
const { TeamsModule } = require('../dist/teams/teams.module');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { PrismaClient } = require('../dist/generated/prisma/client');

const schema = `schedules_test_${randomUUID().replaceAll('-', '')}`;
let setup;
let prisma;
let app;
let server;
let baseUrl;
let schemaCreated = false;
const users = {};
const cookies = {};
const sockets = [];
let team;
let otherTeam;

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

  for (const [key, nickname] of [
    ['owner', '팀장'],
    ['member', '팀원'],
    ['outsider', '외부인'],
  ]) {
    users[key] = await prisma.user.create({
      data: {
        email: `${key}@example.test`,
        nickname,
        passwordHash: 'not-a-login-password',
      },
    });
  }
  team = await prisma.team.create({
    data: {
      name: '캡스톤 팀',
      inviteCode: 'SCHEDTEAM2',
      ownerId: users.owner.id,
      team_members: {
        create: [
          { userId: users.owner.id, role: 'OWNER' },
          { userId: users.member.id, role: 'MEMBER' },
        ],
      },
    },
  });
  otherTeam = await prisma.team.create({
    data: {
      name: '다른 팀',
      inviteCode: 'OTHERSCHED',
      ownerId: users.outsider.id,
      team_members: { create: { userId: users.outsider.id, role: 'OWNER' } },
    },
  });

  const moduleRef = await Test.createTestingModule({
    imports: [SchedulesModule, TeamsModule],
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
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const jwt = moduleRef.get(JwtService);
  for (const [key, user] of Object.entries(users))
    cookies[key] = `access_token=${jwt.sign({ sub: user.id.toString() })}`;
});

after(async () => {
  for (const socket of sockets) socket.disconnect();
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

const as = (key) => ({
  get: (url) => request(server).get(url).set('Cookie', cookies[key]),
  post: (url) => request(server).post(url).set('Cookie', cookies[key]),
  put: (url) => request(server).put(url).set('Cookie', cookies[key]),
  delete: (url) => request(server).delete(url).set('Cookie', cookies[key]),
});

function connect(key) {
  const socket = io(baseUrl, {
    transports: ['websocket'],
    extraHeaders: { Cookie: cookies[key], Origin: ORIGIN },
    reconnection: false,
    forceNew: true,
  });
  sockets.push(socket);
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

/** 서버가 팀 룸 입장을 마칠 때까지 잠시 기다린다. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

function nextEvent(socket, event, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${event} 이벤트를 받지 못했습니다.`)),
      timeout,
    );
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function noEvent(socket, event, wait = 300) {
  return new Promise((resolve, reject) => {
    const listener = (payload) =>
      reject(new Error(`${event} 이벤트를 받으면 안 됩니다: ${payload}`));
    socket.on(event, listener);
    setTimeout(() => {
      socket.off(event, listener);
      resolve();
    }, wait);
  });
}

const base = {
  title: '중간 발표 리허설',
  startAt: '2026-11-12T15:00:00+09:00',
};

test('미인증 요청은 401, 팀원이 아니면 404, 잘못된 ID는 400', async () => {
  await request(server).get(`/teams/${team.id}/schedules`).expect(401);
  await request(server).get('/calendar/schedules').expect(401);
  await as('outsider').get(`/teams/${team.id}/schedules`).expect(404);
  await as('outsider')
    .post(`/teams/${team.id}/schedules`)
    .send(base)
    .expect(404);
  await as('owner').get('/teams/999999/schedules').expect(404);
  await as('owner').get('/teams/abc/schedules').expect(400);
  await as('owner').put('/schedules/0').send(base).expect(400);
  await as('owner').delete('/schedules/9223372036854775808').expect(400);
  await as('owner').put('/schedules/999999').send(base).expect(404);
  await as('owner').delete('/schedules/999999').expect(404);
});

test('일정 입력 검증', async () => {
  for (const body of [
    {},
    { startAt: base.startAt },
    { ...base, title: '   ' },
    { ...base, title: 'a'.repeat(101) },
    { ...base, description: 'a'.repeat(10001) },
    { ...base, startAt: '2026-11-12' },
    { ...base, startAt: '2026-11-12T15:00:00' },
    { ...base, startAt: '2026-02-30T15:00:00Z' },
    { ...base, startAt: '2026-11-12 15:00:00Z' },
    { ...base, endAt: '2026-11-12T14:59:00+09:00' },
    { ...base, endAt: '' },
    // 일정에는 완료 표시가 없다.
    { ...base, completed: true },
    { ...base, teamId: otherTeam.id.toString() },
  ])
    await as('owner')
      .post(`/teams/${team.id}/schedules`)
      .send(body)
      .expect(400);
  assert.equal(await prisma.schedule.count(), 0);
});

test('등록: 종료를 비우면 시작과 같고, 같은 팀 연결에만 알린다', async () => {
  const owner = await connect('owner');
  const outsider = await connect('outsider');
  await settle();
  const changed = nextEvent(owner, 'team:changed');
  const silent = noEvent(outsider, 'team:changed');

  const { body } = await as('member')
    .post(`/teams/${team.id}/schedules`)
    .send({ ...base, title: `  ${base.title}  ` })
    .expect(201);
  assert.deepEqual(Object.keys(body.schedule).sort(), [
    'description',
    'endAt',
    'id',
    'startAt',
    'teamId',
    'teamName',
    'title',
  ]);
  assert.equal(body.schedule.title, base.title);
  assert.equal(body.schedule.startAt, '2026-11-12T06:00:00.000Z');
  assert.equal(body.schedule.endAt, '2026-11-12T06:00:00.000Z');
  assert.equal(body.schedule.description, '');
  assert.equal(body.schedule.teamName, '캡스톤 팀');
  assert.deepEqual(await changed, {
    teamId: team.id.toString(),
    scopes: ['schedules'],
  });
  await silent;

  const withEnd = await as('owner')
    .post(`/teams/${team.id}/schedules`)
    .send({
      title: '자료 조사',
      description: '  도서관  ',
      startAt: '2026-11-10T01:00:00Z',
      endAt: '2026-11-11T03:30:00Z',
    })
    .expect(201);
  assert.equal(withEnd.body.schedule.endAt, '2026-11-11T03:30:00.000Z');
  assert.equal(withEnd.body.schedule.description, '도서관');
  owner.disconnect();
  outsider.disconnect();
});

test('목록은 시작 시각 순이며 다른 팀 일정은 섞이지 않는다', async () => {
  await as('outsider')
    .post(`/teams/${otherTeam.id}/schedules`)
    .send({ ...base, title: '다른 팀 회의' })
    .expect(201);
  const res = await as('member').get(`/teams/${team.id}/schedules`).expect(200);
  assert.equal(res.headers['cache-control'], 'private, no-store');
  assert.deepEqual(
    res.body.schedules.map((item) => item.title),
    ['자료 조사', base.title],
  );
});

test('수정은 전체 수정이며 모든 멤버가 할 수 있다', async () => {
  const created = await as('owner')
    .post(`/teams/${team.id}/schedules`)
    .send({
      ...base,
      title: '회의',
      description: '안건',
      endAt: '2026-11-12T08:00:00Z',
    })
    .expect(201);
  const id = created.body.schedule.id;

  const member = await connect('member');
  await settle();
  const changed = nextEvent(member, 'team:changed');
  const updated = await as('member')
    .put(`/schedules/${id}`)
    .send({ ...base, title: '회의(장소 변경)' })
    .expect(200);
  assert.deepEqual((await changed).scopes, ['schedules']);
  assert.equal(updated.body.schedule.title, '회의(장소 변경)');
  // 생략한 설명·종료 시각은 비우거나 시작 시각으로 맞춘다.
  assert.equal(updated.body.schedule.description, '');
  assert.equal(updated.body.schedule.endAt, updated.body.schedule.startAt);

  const moved = await as('owner')
    .put(`/schedules/${id}`)
    .send({
      title: '회의',
      startAt: '2026-11-13T10:00:00+09:00',
      endAt: '2026-11-13T12:00:00+09:00',
    })
    .expect(200);
  assert.equal(moved.body.schedule.startAt, '2026-11-13T01:00:00.000Z');
  assert.equal(moved.body.schedule.endAt, '2026-11-13T03:00:00.000Z');
  await as('owner')
    .put(`/schedules/${id}`)
    .send({ ...base, completed: false })
    .expect(400);

  await as('owner')
    .put(`/schedules/${id}`)
    .send({ ...base, endAt: '2026-11-11T00:00:00Z' })
    .expect(400);
  await as('outsider').put(`/schedules/${id}`).send(base).expect(404);
  await as('outsider').delete(`/schedules/${id}`).expect(404);
  member.disconnect();
});

test('캘린더는 내 모든 팀의 일정 중 기간에 걸치는 것만 준다', async () => {
  await prisma.schedule.deleteMany();
  const add = (key, teamId, title, startAt, endAt) =>
    as(key)
      .post(`/teams/${teamId}/schedules`)
      .send({ title, startAt, endAt })
      .expect(201);
  await add(
    'owner',
    team.id,
    '이전',
    '2026-10-31T14:00:00Z',
    '2026-10-31T14:59:59Z',
  );
  await add(
    'owner',
    team.id,
    '걸침',
    '2026-10-31T10:00:00Z',
    '2026-10-31T15:00:00Z',
  );
  await add('member', team.id, '안쪽', '2026-11-20T03:00:00Z');
  await add('owner', team.id, '끝 경계', '2026-12-12T15:00:00Z');
  await add('outsider', otherTeam.id, '다른 팀', '2026-11-20T03:00:00Z');

  const query =
    'from=2026-11-01T00:00:00%2B09:00&to=2026-12-13T00:00:00%2B09:00';
  const res = await as('member')
    .get(`/calendar/schedules?${query}`)
    .expect(200);
  assert.equal(res.headers['cache-control'], 'private, no-store');
  assert.deepEqual(
    res.body.schedules.map((item) => item.title),
    ['걸침', '안쪽'],
  );
  const outsider = await as('outsider')
    .get(`/calendar/schedules?${query}`)
    .expect(200);
  assert.deepEqual(
    outsider.body.schedules.map((item) => item.title),
    ['다른 팀'],
  );

  for (const bad of [
    '',
    'from=2026-11-01&to=2026-12-01',
    'from=2026-11-01T00:00:00Z',
    'from=2026-11-02T00:00:00Z&to=2026-11-01T00:00:00Z',
    'from=2026-11-01T00:00:00Z&to=2026-11-01T00:00:00Z',
    'from=2026-11-01T00:00:00Z&to=2027-01-03T00:00:00Z',
    'from=2026-11-01T00:00:00Z&to=2026-11-02T00:00:00Z&teamId=1',
  ])
    await as('member').get(`/calendar/schedules?${bad}`).expect(400);
});

test('삭제는 모든 멤버가 할 수 있고, 팀 삭제 시 일정도 지운다', async () => {
  const { body } = await as('owner')
    .post(`/teams/${team.id}/schedules`)
    .send(base)
    .expect(201);
  const owner = await connect('owner');
  await settle();
  const changed = nextEvent(owner, 'team:changed');
  const removed = await as('member')
    .delete(`/schedules/${body.schedule.id}`)
    .expect(200);
  assert.deepEqual(removed.body, { message: '일정을 삭제했습니다.' });
  assert.deepEqual((await changed).scopes, ['schedules']);
  await as('member').delete(`/schedules/${body.schedule.id}`).expect(404);
  owner.disconnect();

  assert.ok((await prisma.schedule.count({ where: { teamId: team.id } })) > 0);
  await as('owner').delete(`/teams/${team.id}`).expect(200);
  assert.equal(await prisma.schedule.count({ where: { teamId: team.id } }), 0);
  assert.equal(
    await prisma.schedule.count({ where: { teamId: otherTeam.id } }),
    1,
  );
});
