require('reflect-metadata');
require('dotenv/config');
const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { mkdtemp, readdir, readFile, rm } = require('node:fs/promises');
const os = require('node:os');
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
process.env.JWT_SECRET = 'chat-integration-test-secret-only-not-real';
const ORIGIN = 'http://localhost:3000';
process.env.CORS_ORIGIN = ORIGIN;
const { ChatModule } = require('../dist/chat/chat.module');
const { TeamsModule } = require('../dist/teams/teams.module');
const {
  TeamAssignmentsModule,
} = require('../dist/team-assignments/team-assignments.module');
const { FilesModule } = require('../dist/files/files.module');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { PrismaClient } = require('../dist/generated/prisma/client');

const schema = `chat_test_${randomUUID().replaceAll('-', '')}`;
let setup;
let prisma;
let app;
let server;
let baseUrl;
let jwt;
let schemaCreated = false;
let uploadDir;
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

  uploadDir = await mkdtemp(path.join(os.tmpdir(), 'gaesin-chat-test-'));
  process.env.UPLOAD_DIR = uploadDir;

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
    ['joiner', '새 팀원'],
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
      inviteCode: 'CHATTEAM22',
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
      inviteCode: 'OTHERCHAT2',
      ownerId: users.outsider.id,
      team_members: { create: { userId: users.outsider.id, role: 'OWNER' } },
    },
  });

  const moduleRef = await Test.createTestingModule({
    imports: [ChatModule, TeamsModule, TeamAssignmentsModule, FilesModule],
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
  jwt = moduleRef.get(JwtService);
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
        if (uploadDir) await rm(uploadDir, { recursive: true, force: true });
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

/** 연결되면 소켓을, 거부되면 connect_error의 오류를 돌려준다. origin이 null이면 Origin 헤더를 보내지 않는다. */
function connect({ cookie, origin = ORIGIN, transports = ['websocket'] }) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (origin) headers.Origin = origin;
  const socket = io(baseUrl, {
    transports,
    extraHeaders: headers,
    reconnection: false,
    forceNew: true,
  });
  sockets.push(socket);
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (error) => {
      socket.disconnect();
      reject(error);
    });
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

/** 일정 시간 동안 이벤트를 받지 않았는지 확인한다. */
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

test('쿠키가 없거나 잘못되면 소켓 연결을 거부한다', async () => {
  for (const cookie of [
    undefined,
    'access_token=not-a-jwt',
    `access_token=${jwt.sign({ sub: users.owner.id.toString() }, { secret: 'x'.repeat(40) })}`,
    `access_token=${jwt.sign({ sub: users.owner.id.toString() }, { expiresIn: -10 })}`,
  ]) {
    const error = await connect({ cookie }).then(
      () => assert.fail('연결되면 안 됩니다.'),
      (error) => error,
    );
    assert.equal(error.data?.code, 'UNAUTHENTICATED');
  }
});

test('허용되지 않은 출처나 출처 없는 연결은 거부한다', async () => {
  for (const origin of ['http://evil.example', null])
    for (const transports of [['websocket'], ['polling']])
      await assert.rejects(
        connect({ cookie: cookies.owner, origin, transports }),
      );
});

test('미인증 요청은 401, 팀원이 아니면 404', async () => {
  await request(server).get(`/teams/${team.id}/messages`).expect(401);
  await request(server)
    .post(`/teams/${team.id}/messages`)
    .send({ content: '안녕' })
    .expect(401);
  await as('outsider').get(`/teams/${team.id}/messages`).expect(404);
  await as('outsider')
    .post(`/teams/${team.id}/messages`)
    .send({ content: '안녕' })
    .expect(404);
  await as('owner').get('/teams/999999/messages').expect(404);
  await as('owner').get('/teams/abc/messages').expect(400);
  await as('owner').get('/teams/9223372036854775808/messages').expect(400);
});

test('메시지 입력 검증', async () => {
  for (const body of [
    {},
    { content: '' },
    { content: '   \n ' },
    { content: 'a'.repeat(2001) },
    { content: 1 },
    { content: '안녕', userId: users.member.id.toString() },
  ])
    await as('owner').post(`/teams/${team.id}/messages`).send(body).expect(400);
  assert.equal(await prisma.message.count(), 0);
});

test('보낸 메시지를 저장하고 같은 팀 연결에만 실시간으로 보낸다', async () => {
  const owner = await connect({ cookie: cookies.owner });
  const member = await connect({
    cookie: cookies.member,
    transports: ['polling'],
  });
  const outsider = await connect({ cookie: cookies.outsider });
  await settle();

  const received = Promise.all([
    nextEvent(owner, 'message:new'),
    nextEvent(member, 'message:new'),
  ]);
  const silent = noEvent(outsider, 'message:new');
  const { body } = await as('member')
    .post(`/teams/${team.id}/messages`)
    .send({ content: '  자료 올렸어요\n확인 부탁해요  ' })
    .expect(201);

  assert.deepEqual(Object.keys(body.message).sort(), [
    'content',
    'createdAt',
    'id',
    'nickname',
    'teamId',
    'userId',
  ]);
  assert.equal(body.message.content, '자료 올렸어요\n확인 부탁해요');
  assert.equal(body.message.nickname, '팀원');
  assert.equal(body.message.userId, users.member.id.toString());
  assert.equal(body.message.teamId, team.id.toString());
  for (const payload of await received) assert.deepEqual(payload, body.message);
  await silent;

  await as('member')
    .post(`/teams/${team.id}/messages`)
    .send({ content: 'a'.repeat(2000) })
    .expect(201);
  owner.disconnect();
  member.disconnect();
  outsider.disconnect();
});

test('내역은 오래된 순이며 before·after로 이어서 조회한다', async () => {
  await prisma.message.deleteMany();
  const ids = [];
  for (let i = 1; i <= 5; i++) {
    const { body } = await as(i % 2 ? 'owner' : 'member')
      .post(`/teams/${team.id}/messages`)
      .send({ content: `메시지 ${i}` })
      .expect(201);
    ids.push(body.message.id);
  }
  // 다른 팀 메시지는 섞이지 않는다.
  await as('outsider')
    .post(`/teams/${otherTeam.id}/messages`)
    .send({ content: '다른 팀' })
    .expect(201);

  const all = await as('member').get(`/teams/${team.id}/messages`).expect(200);
  assert.equal(all.headers['cache-control'], 'private, no-store');
  assert.deepEqual(
    all.body.messages.map((message) => message.id),
    ids,
  );
  assert.equal(all.body.hasMore, false);

  const latest = await as('member')
    .get(`/teams/${team.id}/messages?limit=2`)
    .expect(200);
  assert.deepEqual(
    latest.body.messages.map((message) => message.content),
    ['메시지 4', '메시지 5'],
  );
  assert.equal(latest.body.hasMore, true);

  const older = await as('member')
    .get(`/teams/${team.id}/messages?limit=2&before=${ids[3]}`)
    .expect(200);
  assert.deepEqual(
    older.body.messages.map((message) => message.id),
    [ids[1], ids[2]],
  );
  assert.equal(older.body.hasMore, true);

  const oldest = await as('member')
    .get(`/teams/${team.id}/messages?limit=2&before=${ids[1]}`)
    .expect(200);
  assert.deepEqual(
    oldest.body.messages.map((message) => message.id),
    [ids[0]],
  );
  assert.equal(oldest.body.hasMore, false);

  const newer = await as('member')
    .get(`/teams/${team.id}/messages?limit=2&after=${ids[1]}`)
    .expect(200);
  assert.deepEqual(
    newer.body.messages.map((message) => message.id),
    [ids[2], ids[3]],
  );
  assert.equal(newer.body.hasMore, true);

  const none = await as('member')
    .get(`/teams/${team.id}/messages?after=${ids[4]}`)
    .expect(200);
  assert.deepEqual(none.body, { messages: [], hasMore: false });

  for (const query of [
    `before=${ids[3]}&after=${ids[1]}`,
    'limit=0',
    'limit=101',
    'limit=abc',
    'before=0',
    'after=-1',
    'before=9223372036854775808',
    'page=2',
  ])
    await as('member').get(`/teams/${team.id}/messages?${query}`).expect(400);
});

test('연결 중에 팀에 참여하면 바로 그 팀 메시지를 받는다', async () => {
  const joiner = await connect({ cookie: cookies.joiner });
  await settle();
  await as('joiner')
    .post('/teams/join')
    .send({ inviteCode: 'CHATTEAM22' })
    .expect(201);

  const received = nextEvent(joiner, 'message:new');
  await as('owner')
    .post(`/teams/${team.id}/messages`)
    .send({ content: '환영해요' })
    .expect(201);
  assert.equal((await received).content, '환영해요');
  joiner.disconnect();
});

test('팀 데이터가 바뀌면 팀원에게 team:changed로 범위를 알린다', async () => {
  const member = await connect({ cookie: cookies.member });
  const outsider = await connect({ cookie: cookies.outsider });
  await settle();
  const silent = noEvent(outsider, 'team:changed', 1500);
  const expectChange = async (scopes, run) => {
    const changed = nextEvent(member, 'team:changed');
    const result = await run();
    assert.deepEqual(await changed, { teamId: team.id.toString(), scopes });
    return result;
  };

  await expectChange(['team'], () =>
    as('owner')
      .put(`/teams/${team.id}`)
      .send({ name: '새 팀 이름' })
      .expect(200),
  );
  const { body: created } = await expectChange(['assignments'], () =>
    as('owner')
      .post(`/teams/${team.id}/assignments`)
      .send({
        title: '중간 발표',
        startDate: '2026-11-10',
        dueDate: '2026-11-20',
        status: 'TODO',
      })
      .expect(201),
  );
  const assignmentId = created.assignment.id;
  const { body: task } = await expectChange(['assignments'], () =>
    as('owner')
      .post(`/team-assignments/${assignmentId}/tasks`)
      .send({ title: '자료 조사', status: 'TODO' })
      .expect(201),
  );
  await expectChange(['assignments'], () =>
    as('owner')
      .put(`/tasks/${task.task.id}`)
      .send({ title: '자료 조사', status: 'DONE' })
      .expect(200),
  );
  const { body: file } = await expectChange(['files'], () =>
    as('owner')
      .post(`/teams/${team.id}/files`)
      .field('teamAssignmentId', assignmentId)
      .attach('file', Buffer.from('발표 자료'), 'slides.txt')
      .expect(201),
  );
  await expectChange(['assignments', 'files'], () =>
    as('owner').delete(`/team-assignments/${assignmentId}`).expect(200),
  );
  await expectChange(['files'], () =>
    as('owner').delete(`/files/${file.file.id}`).expect(200),
  );
  await silent;
  member.disconnect();
  outsider.disconnect();
});

test('탈퇴·내보내기 후에는 알림을 받고 더 이상 메시지를 받지 않는다', async () => {
  const joiner = await connect({ cookie: cookies.joiner });
  const member = await connect({ cookie: cookies.member });
  await settle();

  const left = nextEvent(joiner, 'team:removed');
  const memberSeesLeave = nextEvent(member, 'team:changed');
  await as('joiner').post(`/teams/${team.id}/leave`).expect(200);
  assert.deepEqual(await left, { teamId: team.id.toString() });
  // 남은 멤버는 멤버 목록과 할 일 담당자가 바뀌었다는 알림을 받는다.
  assert.deepEqual(await memberSeesLeave, {
    teamId: team.id.toString(),
    scopes: ['team', 'assignments'],
  });

  const kicked = nextEvent(member, 'team:removed');
  await as('owner')
    .delete(`/teams/${team.id}/members/${users.member.id}`)
    .expect(200);
  assert.deepEqual(await kicked, { teamId: team.id.toString() });

  const silent = Promise.all([
    noEvent(joiner, 'message:new'),
    noEvent(member, 'message:new'),
  ]);
  await as('owner')
    .post(`/teams/${team.id}/messages`)
    .send({ content: '떠난 사람은 못 봐요' })
    .expect(201);
  await silent;
  await as('member').get(`/teams/${team.id}/messages`).expect(404);
  await as('member')
    .post(`/teams/${team.id}/messages`)
    .send({ content: '보낼 수 없음' })
    .expect(404);

  // 떠난 멤버의 메시지는 팀에 남는다.
  const { body } = await as('owner')
    .get(`/teams/${team.id}/messages?limit=100`)
    .expect(200);
  assert.ok(body.messages.some((message) => message.nickname === '팀원'));
  joiner.disconnect();
  member.disconnect();
});

test('팀을 삭제하면 연결에 알리고 메시지도 지운다', async () => {
  const owner = await connect({ cookie: cookies.owner });
  await settle();
  const removed = nextEvent(owner, 'team:removed');
  // 내가 지운 팀이어도 같은 팀을 연 다른 탭에 알리기 위해 보낸다.
  await as('owner').delete(`/teams/${team.id}`).expect(200);
  assert.deepEqual(await removed, { teamId: team.id.toString() });
  assert.equal(await prisma.message.count({ where: { teamId: team.id } }), 0);
  assert.equal(
    await prisma.message.count({ where: { teamId: otherTeam.id } }),
    1,
  );
  owner.disconnect();
});

test('토큰이 만료되는 시각에 서버가 연결을 끊는다', async () => {
  const token = jwt.sign(
    { sub: users.outsider.id.toString() },
    { expiresIn: 1 },
  );
  const socket = await connect({ cookie: `access_token=${token}` });
  const reason = await nextEvent(socket, 'disconnect', 3000);
  assert.equal(reason, 'io server disconnect');
});
