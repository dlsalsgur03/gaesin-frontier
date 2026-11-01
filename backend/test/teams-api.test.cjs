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
process.env.JWT_SECRET = 'teams-api-integration-test-secret-only';
const { TeamsModule } = require('../dist/teams/teams.module');
const { CalendarModule } = require('../dist/calendar/calendar.module');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { PrismaClient } = require('../dist/generated/prisma/client');

const schema = `teams_test_${randomUUID().replaceAll('-', '')}`;
const range = { from: '2026-11-01', to: '2026-11-30' };
const at = (day) => new Date(`${day}T00:00:00.000Z`);
let setup;
let prisma;
let app;
let server;
let schemaCreated = false;
const users = {};
const cookies = {};
let teamId;
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

  const moduleRef = await Test.createTestingModule({
    imports: [TeamsModule, CalendarModule],
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

const as = (key) => ({
  get: (url) => request(server).get(url).set('Cookie', cookies[key]),
  post: (url) => request(server).post(url).set('Cookie', cookies[key]),
  put: (url) => request(server).put(url).set('Cookie', cookies[key]),
  delete: (url) => request(server).delete(url).set('Cookie', cookies[key]),
});

test('미인증 요청은 401', async () => {
  await request(server).get('/teams').expect(401);
  await request(server).post('/teams').send({ name: '팀' }).expect(401);
  await request(server)
    .post('/teams/join')
    .send({ inviteCode: 'ABC' })
    .expect(401);
});

test('팀 이름 검증', async () => {
  for (const body of [
    {},
    { name: '   ' },
    { name: 'a'.repeat(101) },
    { name: 1 },
    { name: '팀', extra: true },
  ])
    await as('owner').post('/teams').send(body).expect(400);
});

test('팀을 만들면 생성자가 OWNER 멤버가 된다', async () => {
  const { body } = await as('owner')
    .post('/teams')
    .send({ name: '  캡스톤 팀  ' })
    .expect(201);
  teamId = body.team.id;
  inviteCode = body.team.inviteCode;
  assert.equal(body.team.name, '캡스톤 팀');
  assert.match(inviteCode, /^[A-HJKMNP-Z2-9]{10}$/);
  assert.equal(body.team.myRole, 'OWNER');
  assert.deepEqual(
    body.team.members.map(({ nickname, role, isMe }) => ({
      nickname,
      role,
      isMe,
    })),
    [{ nickname: '팀장', role: 'OWNER', isMe: true }],
  );
  const team = await prisma.team.findUnique({
    where: { id: BigInt(teamId) },
    include: { team_members: true },
  });
  assert.equal(team.ownerId, users.owner.id);
  assert.equal(team.team_members[0].role, 'OWNER');

  const list = await as('owner').get('/teams').expect(200);
  assert.equal(list.headers['cache-control'], 'private, no-store');
  assert.deepEqual(list.body.teams, [
    { id: teamId, name: '캡스톤 팀', role: 'OWNER', memberCount: 1 },
  ]);
});

test('초대 코드로 참여하고 중복 참여와 잘못된 코드는 거부한다', async () => {
  const { body } = await as('member')
    .post('/teams/join')
    .send({ inviteCode: ` ${inviteCode.toLowerCase()} ` })
    .expect(201);
  assert.equal(body.team.myRole, 'MEMBER');
  assert.deepEqual(
    body.team.members.map((member) => [member.nickname, member.role]),
    [
      ['팀장', 'OWNER'],
      ['팀원', 'MEMBER'],
    ],
  );
  await as('member').post('/teams/join').send({ inviteCode }).expect(409);
  await as('outsider')
    .post('/teams/join')
    .send({ inviteCode: 'NOTACODE22' })
    .expect(404);
  await as('outsider').post('/teams/join').send({ inviteCode: '' }).expect(400);
  const list = await as('member').get('/teams').expect(200);
  assert.deepEqual(list.body.teams, [
    { id: teamId, name: '캡스톤 팀', role: 'MEMBER', memberCount: 2 },
  ]);
});

test('비멤버는 404, 잘못된 ID는 400', async () => {
  const detail = await as('member').get(`/teams/${teamId}`).expect(200);
  assert.equal(detail.headers['cache-control'], 'private, no-store');
  await as('outsider').get(`/teams/${teamId}`).expect(404);
  await as('outsider').put(`/teams/${teamId}`).send({ name: 'x' }).expect(404);
  await as('outsider').delete(`/teams/${teamId}`).expect(404);
  await as('outsider').get('/teams/999999').expect(404);
  for (const id of ['abc', '0', '01', '9223372036854775808'])
    await as('owner').get(`/teams/${id}`).expect(400);
  assert.deepEqual((await as('outsider').get('/teams')).body.teams, []);
});

test('소유자 전용 작업은 일반 멤버에게 403', async () => {
  const url = `/teams/${teamId}`;
  await as('member').put(url).send({ name: '바꾼 이름' }).expect(403);
  await as('member').post(`${url}/invite-code`).expect(403);
  await as('member')
    .post(`${url}/transfer`)
    .send({ userId: users.member.id.toString() })
    .expect(403);
  await as('member').delete(`${url}/members/${users.owner.id}`).expect(403);
  await as('member').delete(url).expect(403);
  const renamed = await as('owner')
    .put(url)
    .send({ name: '  새 팀 이름 ' })
    .expect(200);
  assert.equal(renamed.body.team.name, '새 팀 이름');
});

test('초대 코드를 재발급하면 이전 코드는 쓸 수 없다', async () => {
  const { body } = await as('owner')
    .post(`/teams/${teamId}/invite-code`)
    .expect(200);
  assert.notEqual(body.team.inviteCode, inviteCode);
  await as('outsider').post('/teams/join').send({ inviteCode }).expect(404);
  inviteCode = body.team.inviteCode;
  await as('outsider').post('/teams/join').send({ inviteCode }).expect(201);
});

test('소유자는 멤버를 내보낼 수 있고 자신은 내보낼 수 없다', async () => {
  const url = `/teams/${teamId}/members`;
  await as('owner').delete(`${url}/${users.owner.id}`).expect(400);
  await as('owner').delete(`${url}/abc`).expect(400);
  const { body } = await as('owner')
    .delete(`${url}/${users.outsider.id}`)
    .expect(200);
  assert.ok(!body.team.members.some((m) => m.nickname === '외부인'));
  await as('owner').delete(`${url}/${users.outsider.id}`).expect(404);
  await as('outsider').get(`/teams/${teamId}`).expect(404);
});

test('소유자는 탈퇴할 수 없고 소유권을 넘긴 뒤 탈퇴한다', async () => {
  const url = `/teams/${teamId}`;
  await prisma.teamAssignment.create({
    data: {
      teamId: BigInt(teamId),
      title: '팀 발표 준비',
      startDate: at('2026-11-10'),
      dueDate: at('2026-11-12'),
    },
  });
  const calendarTitles = async (key) =>
    (
      await as(key).get('/calendar/assignments').query(range).expect(200)
    ).body.assignments.map((task) => task.title);
  assert.deepEqual(await calendarTitles('owner'), ['팀 발표 준비']);

  await as('owner').post(`${url}/leave`).expect(400);
  await as('owner')
    .post(`${url}/transfer`)
    .send({ userId: users.owner.id.toString() })
    .expect(400);
  await as('owner')
    .post(`${url}/transfer`)
    .send({ userId: users.outsider.id.toString() })
    .expect(404);
  await as('owner').post(`${url}/transfer`).send({ userId: 'x' }).expect(400);

  const { body } = await as('owner')
    .post(`${url}/transfer`)
    .send({ userId: users.member.id.toString() })
    .expect(200);
  assert.equal(body.team.myRole, 'MEMBER');
  assert.deepEqual(
    body.team.members.map((member) => [member.nickname, member.role]),
    [
      ['팀원', 'OWNER'],
      ['팀장', 'MEMBER'],
    ],
  );
  const team = await prisma.team.findUnique({ where: { id: BigInt(teamId) } });
  assert.equal(team.ownerId, users.member.id);
  await as('owner').post(`${url}/invite-code`).expect(403);

  const left = await as('owner').post(`${url}/leave`).expect(200);
  assert.deepEqual(left.body, { message: '팀에서 탈퇴했습니다.' });
  await as('owner').get(url).expect(404);
  assert.deepEqual(await calendarTitles('owner'), []);
  assert.deepEqual(await calendarTitles('member'), ['팀 발표 준비']);
});

test('팀을 삭제하면 딸린 데이터만 함께 지운다', async () => {
  const id = BigInt(teamId);
  const other = await prisma.team.create({
    data: {
      name: '다른 팀',
      inviteCode: 'OTHERTEAM2',
      ownerId: users.outsider.id,
      team_members: { create: { userId: users.outsider.id, role: 'OWNER' } },
      messages: {
        create: { userId: users.outsider.id, content: '남아야 함' },
      },
    },
  });
  const assignment = await prisma.teamAssignment.findFirstOrThrow({
    where: { teamId: id },
  });
  await prisma.task.create({
    data: {
      teamAssignmentId: assignment.id,
      assigneeId: users.member.id,
      title: '자료 조사',
    },
  });
  await prisma.schedule.create({
    data: {
      teamId: id,
      title: '회의',
      startAt: at('2026-11-05'),
      endAt: at('2026-11-05'),
    },
  });
  await prisma.message.create({
    data: { teamId: id, userId: users.member.id, content: '안녕하세요' },
  });
  await prisma.file.createMany({
    data: [
      {
        teamId: id,
        userId: users.member.id,
        fileName: 'team.pdf',
        fileUrl: 'https://files.example.test/team.pdf',
      },
      {
        teamAssignmentId: assignment.id,
        userId: users.member.id,
        fileName: 'assignment.pdf',
        fileUrl: 'https://files.example.test/assignment.pdf',
      },
    ],
  });

  const { body } = await as('member').delete(`/teams/${teamId}`).expect(200);
  assert.deepEqual(body, { message: '팀을 삭제했습니다.' });
  await as('member').get(`/teams/${teamId}`).expect(404);
  assert.equal(await prisma.team.count({ where: { id } }), 0);
  assert.equal(await prisma.teamMember.count({ where: { teamId: id } }), 0);
  assert.equal(await prisma.teamAssignment.count({ where: { teamId: id } }), 0);
  assert.equal(await prisma.task.count(), 0);
  assert.equal(await prisma.schedule.count(), 0);
  assert.equal(await prisma.file.count(), 0);
  assert.equal(await prisma.message.count({ where: { teamId: id } }), 0);
  assert.equal(await prisma.message.count({ where: { teamId: other.id } }), 1);
  assert.deepEqual((await as('member').get('/teams')).body.teams, []);
});
