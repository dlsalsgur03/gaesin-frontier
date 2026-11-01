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
process.env.JWT_SECRET = 'team-assignments-integration-test-secret-only';
const {
  TeamAssignmentsModule,
} = require('../dist/team-assignments/team-assignments.module');
const { TeamsModule } = require('../dist/teams/teams.module');
const { CalendarModule } = require('../dist/calendar/calendar.module');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { PrismaClient } = require('../dist/generated/prisma/client');

const schema = `team_assignments_test_${randomUUID().replaceAll('-', '')}`;
const at = (day) => new Date(`${day}T00:00:00.000Z`);
let setup;
let prisma;
let app;
let server;
let schemaCreated = false;
const users = {};
const cookies = {};
let team;
let otherAssignment;
let assignmentId;

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
      inviteCode: 'CAPSTONE22',
      ownerId: users.owner.id,
      team_members: {
        create: [
          { userId: users.owner.id, role: 'OWNER' },
          { userId: users.member.id, role: 'MEMBER' },
        ],
      },
    },
  });
  const other = await prisma.team.create({
    data: {
      name: '다른 팀',
      inviteCode: 'OTHERTEAM2',
      ownerId: users.outsider.id,
      team_members: { create: { userId: users.outsider.id, role: 'OWNER' } },
    },
  });
  otherAssignment = await prisma.teamAssignment.create({
    data: {
      teamId: other.id,
      title: '다른 팀 과제',
      startDate: at('2026-11-01'),
      dueDate: at('2026-11-02'),
      tasks: { create: { title: '다른 팀 할 일' } },
    },
  });

  const moduleRef = await Test.createTestingModule({
    imports: [TeamAssignmentsModule, TeamsModule, CalendarModule],
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
const payload = {
  title: '최종 발표',
  description: '발표 자료와 보고서',
  startDate: '2026-11-03',
  dueDate: '2026-11-20',
  status: 'TODO',
};

test('미인증 요청은 401', async () => {
  await request(server).get(`/teams/${team.id}/assignments`).expect(401);
  await request(server)
    .get(`/team-assignments/${otherAssignment.id}`)
    .expect(401);
  await request(server).put('/tasks/1').send({}).expect(401);
});

test('비멤버는 팀 과제와 할 일에 접근할 수 없다', async () => {
  const url = `/team-assignments/${otherAssignment.id}`;
  await as('owner')
    .get(`/teams/${otherAssignment.teamId}/assignments`)
    .expect(404);
  await as('owner')
    .post(`/teams/${otherAssignment.teamId}/assignments`)
    .send(payload)
    .expect(404);
  await as('owner').get(url).expect(404);
  await as('owner').put(url).send(payload).expect(404);
  await as('owner').delete(url).expect(404);
  await as('owner').get(`${url}/tasks`).expect(404);
  await as('owner')
    .post(`${url}/tasks`)
    .send({ title: '침입', status: 'TODO' })
    .expect(404);
  const otherTask = await prisma.task.findFirstOrThrow({
    where: { teamAssignmentId: otherAssignment.id },
  });
  await as('owner')
    .put(`/tasks/${otherTask.id}`)
    .send({ title: '침입', status: 'DONE' })
    .expect(404);
  await as('owner').delete(`/tasks/${otherTask.id}`).expect(404);
  for (const id of ['abc', '0', '9223372036854775808']) {
    await as('owner').get(`/team-assignments/${id}`).expect(400);
    await as('owner').get(`/teams/${id}/assignments`).expect(400);
    await as('owner').delete(`/tasks/${id}`).expect(400);
  }
});

test('팀 과제 입력 검증', async () => {
  const url = `/teams/${team.id}/assignments`;
  const { startDate: _s, ...noStart } = payload;
  for (const body of [
    noStart,
    { ...payload, title: '   ' },
    { ...payload, startDate: '2026-11-21' },
    { ...payload, dueDate: '2026-02-30' },
    { ...payload, status: 'LATER' },
    { ...payload, teamId: '1' },
  ])
    await as('member').post(url).send(body).expect(400);
});

test('일반 멤버도 팀 과제를 등록·조회·수정하고 캘린더에 반영된다', async () => {
  const created = await as('member')
    .post(`/teams/${team.id}/assignments`)
    .send({ ...payload, title: '  최종 발표  ' })
    .expect(201);
  assignmentId = created.body.assignment.id;
  assert.deepEqual(created.body.assignment, {
    id: assignmentId,
    teamId: team.id.toString(),
    teamName: '캡스톤 팀',
    title: '최종 발표',
    description: '발표 자료와 보고서',
    startDate: '2026-11-03',
    dueDate: '2026-11-20',
    status: 'TODO',
    taskCount: 0,
    doneTaskCount: 0,
  });
  await as('owner')
    .post(`/teams/${team.id}/assignments`)
    .send({ ...payload, title: '중간 점검', dueDate: '2026-11-10' })
    .expect(201);

  const list = await as('owner')
    .get(`/teams/${team.id}/assignments`)
    .expect(200);
  assert.equal(list.headers['cache-control'], 'private, no-store');
  assert.deepEqual(
    list.body.assignments.map((task) => task.title),
    ['중간 점검', '최종 발표'],
  );

  const updated = await as('member')
    .put(`/team-assignments/${assignmentId}`)
    .send({ ...payload, description: '', status: 'IN_PROGRESS' })
    .expect(200);
  assert.equal(updated.body.assignment.description, '');
  assert.equal(updated.body.assignment.status, 'IN_PROGRESS');
  const detail = await as('owner')
    .get(`/team-assignments/${assignmentId}`)
    .expect(200);
  assert.equal(detail.headers['cache-control'], 'private, no-store');
  assert.equal(detail.body.assignment.status, 'IN_PROGRESS');

  const calendar = await as('member')
    .get('/calendar/assignments')
    .query({ from: '2026-11-01', to: '2026-11-30' })
    .expect(200);
  assert.ok(
    calendar.body.assignments.some(
      (task) =>
        task.kind === 'team' &&
        task.id === assignmentId &&
        task.status === 'IN_PROGRESS',
    ),
  );
});

test('할 일은 같은 팀 멤버만 담당자로 지정할 수 있다', async () => {
  const url = `/team-assignments/${assignmentId}/tasks`;
  for (const body of [
    {
      title: '자료 조사',
      status: 'TODO',
      assigneeId: users.outsider.id.toString(),
    },
    { title: '자료 조사', status: 'TODO', assigneeId: '999999' },
    { title: '자료 조사', status: 'TODO', assigneeId: 'x' },
    { title: '자료 조사', status: 'TODO', dueDate: '2026-13-01' },
    { title: '', status: 'TODO' },
    { title: '자료 조사', status: 'TODO', teamAssignmentId: '1' },
  ])
    await as('member').post(url).send(body).expect(400);

  const first = await as('member')
    .post(url)
    .send({
      title: '  PPT 제작 ',
      status: 'TODO',
      assigneeId: users.member.id.toString(),
      dueDate: '2026-11-15',
    })
    .expect(201);
  assert.deepEqual(first.body.task, {
    id: first.body.task.id,
    teamAssignmentId: assignmentId,
    title: 'PPT 제작',
    description: '',
    assigneeId: users.member.id.toString(),
    assigneeNickname: '팀원',
    dueDate: '2026-11-15',
    status: 'TODO',
  });
  const second = await as('owner')
    .post(url)
    .send({ title: '발표 연습', status: 'TODO', dueDate: null })
    .expect(201);
  assert.equal(second.body.task.assigneeId, null);
  assert.equal(second.body.task.dueDate, null);
  await as('owner')
    .post(url)
    .send({ title: '보고서', status: 'TODO', dueDate: '2026-11-12' })
    .expect(201);

  const list = await as('owner').get(url).expect(200);
  assert.equal(list.headers['cache-control'], 'private, no-store');
  assert.deepEqual(
    list.body.tasks.map((task) => task.title),
    ['보고서', 'PPT 제작', '발표 연습'],
  );

  const done = await as('owner')
    .put(`/tasks/${first.body.task.id}`)
    .send({
      title: 'PPT 제작',
      status: 'DONE',
      assigneeId: users.owner.id.toString(),
    })
    .expect(200);
  assert.equal(done.body.task.status, 'DONE');
  assert.equal(done.body.task.assigneeNickname, '팀장');
  // PUT은 전체 수정이므로 생략한 마감일은 지워진다.
  assert.equal(done.body.task.dueDate, null);
  const detail = await as('member')
    .get(`/team-assignments/${assignmentId}`)
    .expect(200);
  assert.equal(detail.body.assignment.taskCount, 3);
  assert.equal(detail.body.assignment.doneTaskCount, 1);

  const removed = await as('member')
    .delete(`/tasks/${second.body.task.id}`)
    .expect(200);
  assert.deepEqual(removed.body, { message: '할 일을 삭제했습니다.' });
  await as('member').delete(`/tasks/${second.body.task.id}`).expect(404);
});

test('멤버가 팀을 떠나면 맡던 할 일은 미배정이 된다', async () => {
  const url = `/team-assignments/${assignmentId}/tasks`;
  const { body } = await as('owner')
    .post(url)
    .send({
      title: '회의록',
      status: 'IN_PROGRESS',
      assigneeId: users.member.id.toString(),
    })
    .expect(201);
  await as('owner')
    .delete(`/teams/${team.id}/members/${users.member.id}`)
    .expect(200);
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: BigInt(body.task.id) },
  });
  assert.equal(task.assigneeId, null);
  assert.equal(task.status, 'IN_PROGRESS');
  // 다른 사람이 맡은 할 일은 그대로다.
  assert.equal(
    await prisma.task.count({ where: { assigneeId: users.owner.id } }),
    1,
  );
  await as('member').get(`/team-assignments/${assignmentId}`).expect(404);
  await as('owner')
    .post(url)
    .send({
      title: '재배정',
      status: 'TODO',
      assigneeId: users.member.id.toString(),
    })
    .expect(400);
});

test('팀 과제를 삭제하면 할 일과 첨부파일도 함께 지운다', async () => {
  const id = BigInt(assignmentId);
  await prisma.file.create({
    data: {
      teamId: team.id,
      teamAssignmentId: id,
      userId: users.owner.id,
      fileName: 'slides.pdf',
      fileUrl: 'https://files.example.test/slides.pdf',
    },
  });
  const { body } = await as('owner')
    .delete(`/team-assignments/${assignmentId}`)
    .expect(200);
  assert.deepEqual(body, { message: '팀 과제를 삭제했습니다.' });
  await as('owner').get(`/team-assignments/${assignmentId}`).expect(404);
  assert.equal(await prisma.task.count({ where: { teamAssignmentId: id } }), 0);
  assert.equal(await prisma.file.count(), 0);
  // 다른 팀 과제와 그 할 일은 남는다.
  assert.equal(
    await prisma.task.count({
      where: { teamAssignmentId: otherAssignment.id },
    }),
    1,
  );
  assert.deepEqual(
    (
      await as('owner').get(`/teams/${team.id}/assignments`)
    ).body.assignments.map((task) => task.title),
    ['중간 점검'],
  );
});
