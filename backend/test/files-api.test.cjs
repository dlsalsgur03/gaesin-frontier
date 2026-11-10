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

// 실행 중인 앱의 비밀키나 업로드 폴더를 사용하지 않는다.
process.env.JWT_SECRET = 'files-integration-test-secret-only-not-real';
const { FilesModule } = require('../dist/files/files.module');
const { AssignmentsModule } = require('../dist/assignments/assignments.module');
const { TeamsModule } = require('../dist/teams/teams.module');
const {
  TeamAssignmentsModule,
} = require('../dist/team-assignments/team-assignments.module');
const { PrismaService } = require('../dist/prisma/prisma.service');
const { PrismaClient } = require('../dist/generated/prisma/client');

const schema = `files_test_${randomUUID().replaceAll('-', '')}`;
const at = (day) => new Date(`${day}T00:00:00.000Z`);
let setup;
let prisma;
let app;
let server;
let uploadDir;
let schemaCreated = false;
const users = {};
const cookies = {};
let team;
let teamAssignment;
let otherTeam;
let otherTeamAssignment;
let personal;
let otherPersonal;

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
  uploadDir = await mkdtemp(path.join(os.tmpdir(), 'gaesin-files-test-'));
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
      inviteCode: 'FILESTEAM2',
      ownerId: users.owner.id,
      team_members: {
        create: [
          { userId: users.owner.id, role: 'OWNER' },
          { userId: users.member.id, role: 'MEMBER' },
        ],
      },
    },
  });
  teamAssignment = await prisma.teamAssignment.create({
    data: {
      teamId: team.id,
      title: '최종 발표',
      startDate: at('2026-11-01'),
      dueDate: at('2026-11-20'),
    },
  });
  otherTeam = await prisma.team.create({
    data: {
      name: '다른 팀',
      inviteCode: 'OTHERFILE2',
      ownerId: users.outsider.id,
      team_members: { create: { userId: users.outsider.id, role: 'OWNER' } },
    },
  });
  otherTeamAssignment = await prisma.teamAssignment.create({
    data: {
      teamId: otherTeam.id,
      title: '다른 팀 과제',
      startDate: at('2026-11-01'),
      dueDate: at('2026-11-02'),
    },
  });
  personal = await prisma.assignment.create({
    data: {
      userId: users.owner.id,
      title: '운영체제 과제',
      startDate: at('2026-11-01'),
      dueDate: at('2026-11-10'),
    },
  });
  otherPersonal = await prisma.assignment.create({
    data: {
      userId: users.outsider.id,
      title: '남의 과제',
      startDate: at('2026-11-01'),
      dueDate: at('2026-11-10'),
    },
  });

  const moduleRef = await Test.createTestingModule({
    imports: [
      FilesModule,
      AssignmentsModule,
      TeamsModule,
      TeamAssignmentsModule,
    ],
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
const storedCount = async () => (await readdir(uploadDir)).length;
const binary = (req) =>
  req.buffer(true).parse((res, callback) => {
    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('end', () => callback(null, Buffer.concat(chunks)));
  });

test('미인증 요청은 401이고 파일을 저장하지 않는다', async () => {
  await request(server).get(`/assignments/${personal.id}/files`).expect(401);
  await request(server)
    .post(`/teams/${team.id}/files`)
    .attach('file', Buffer.from('x'), 'a.txt')
    .expect(401);
  await request(server).get('/files/1/download').expect(401);
  await request(server).delete('/files/1').expect(401);
  assert.equal(await storedCount(), 0);
});

test('개인 과제 첨부: 한글 파일명 업로드·목록·다운로드', async () => {
  const content = Buffer.from('운영체제 답안 내용');
  const created = await as('owner')
    .post(`/assignments/${personal.id}/files`)
    .attach('file', content, '운영체제 답안 (최종).pdf')
    .expect(201);
  const file = created.body.file;
  assert.equal(file.fileName, '운영체제 답안 (최종).pdf');
  assert.equal(file.size, content.length);
  assert.equal(file.uploaderNickname, '팀장');
  assert.equal(file.isMine, true);
  assert.equal(file.teamAssignmentId, null);
  assert.equal(await storedCount(), 1);
  // 저장소 키나 경로는 응답에 노출하지 않는다.
  assert.equal(JSON.stringify(created.body).includes(uploadDir), false);
  assert.equal('fileUrl' in file, false);

  const list = await as('owner')
    .get(`/assignments/${personal.id}/files`)
    .expect(200);
  assert.equal(list.headers['cache-control'], 'private, no-store');
  assert.deepEqual(list.body.files, [file]);

  const download = await binary(
    as('owner').get(`/files/${file.id}/download`),
  ).expect(200);
  assert.deepEqual(download.body, content);
  assert.equal(download.headers['content-type'], 'application/octet-stream');
  assert.equal(download.headers['x-content-type-options'], 'nosniff');
  assert.equal(download.headers['cache-control'], 'private, no-store');
  assert.match(download.headers['content-disposition'], /^attachment;/);
  const encoded = encodeURIComponent('운영체제 답안 (최종).pdf').replace(
    /[()]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  assert.equal(
    download.headers['content-disposition'],
    `attachment; filename="____ __ (__).pdf"; filename*=UTF-8''${encoded}`,
  );
});

test('다른 사용자의 개인 과제 첨부에는 접근할 수 없다', async () => {
  const file = await prisma.file.findFirstOrThrow({
    where: { assignmentId: personal.id },
  });
  for (const key of ['member', 'outsider']) {
    await as(key).get(`/assignments/${personal.id}/files`).expect(404);
    await as(key).get(`/files/${file.id}/download`).expect(404);
    await as(key).delete(`/files/${file.id}`).expect(404);
  }
  const before = await storedCount();
  await as('owner')
    .post(`/assignments/${otherPersonal.id}/files`)
    .attach('file', Buffer.from('침입'), 'x.txt')
    .expect(404);
  assert.equal(await storedCount(), before);
});

test('업로드 입력 검증과 크기 제한', async () => {
  const url = `/assignments/${personal.id}/files`;
  const before = await storedCount();
  await as('owner').post(url).expect(400);
  await as('owner')
    .post(url)
    .attach('file', Buffer.alloc(0), 'empty.txt')
    .expect(400);
  await as('owner')
    .post(url)
    .attach('file', Buffer.from('a'), 'a.txt')
    .attach('file', Buffer.from('b'), 'b.txt')
    .expect(400);
  await as('owner')
    .post(url)
    .attach('other', Buffer.from('a'), 'a.txt')
    .expect(400);
  for (const id of ['abc', '0', '9223372036854775808']) {
    await as('owner')
      .post(`/assignments/${id}/files`)
      .attach('file', Buffer.from('a'), 'a.txt')
      .expect(400);
    await as('owner').get(`/files/${id}/download`).expect(400);
  }
  const tooLarge = await as('owner')
    .post(url)
    .attach('file', Buffer.alloc(20 * 1024 * 1024 + 1, 1), 'big.bin')
    .expect(413);
  assert.equal(tooLarge.body.message, '파일은 20MB까지 올릴 수 있습니다.');
  assert.equal(await storedCount(), before);

  // 정확히 20MB는 허용하고, 형식은 제한하지 않는다.
  const exact = await as('owner')
    .post(url)
    .attach('file', Buffer.alloc(20 * 1024 * 1024, 1), 'setup.exe')
    .expect(201);
  assert.equal(exact.body.file.size, 20 * 1024 * 1024);
  await as('owner').delete(`/files/${exact.body.file.id}`).expect(200);
  assert.equal(await storedCount(), before);
});

let taggedId;
let untaggedId;

test('팀 파일: 팀원 누구나 올리고 팀 과제에 연결할 수 있다', async () => {
  const url = `/teams/${team.id}/files`;
  const untagged = await as('member')
    .post(url)
    .attach('file', Buffer.from('회의록'), '회의록.md')
    .expect(201);
  untaggedId = untagged.body.file.id;
  assert.equal(untagged.body.file.teamAssignmentId, null);

  const tagged = await as('owner')
    .post(url)
    .field('teamAssignmentId', teamAssignment.id.toString())
    .attach('file', Buffer.from('slides'), '발표.pptx')
    .expect(201);
  taggedId = tagged.body.file.id;
  assert.equal(tagged.body.file.teamAssignmentId, teamAssignment.id.toString());
  assert.equal(tagged.body.file.teamAssignmentTitle, '최종 발표');

  const list = await as('member').get(url).expect(200);
  assert.deepEqual(
    list.body.files.map((file) => [file.fileName, file.isMine]),
    [
      ['발표.pptx', false],
      ['회의록.md', true],
    ],
  );
  const download = await binary(
    as('member').get(`/files/${taggedId}/download`),
  ).expect(200);
  assert.equal(download.body.toString(), 'slides');
});

test('팀 파일 입력 검증: 다른 팀 과제나 알 수 없는 필드는 거부하고 파일을 남기지 않는다', async () => {
  const url = `/teams/${team.id}/files`;
  const before = await storedCount();
  for (const field of [
    ['teamAssignmentId', otherTeamAssignment.id.toString()],
    ['teamAssignmentId', 'abc'],
    ['teamId', otherTeam.id.toString()],
  ])
    await as('owner')
      .post(url)
      .field(field[0], field[1])
      .attach('file', Buffer.from('x'), 'x.txt')
      .expect(400);
  assert.equal(await storedCount(), before);
});

test('비멤버는 팀 파일을 보거나 올릴 수 없다', async () => {
  const before = await storedCount();
  await as('outsider').get(`/teams/${team.id}/files`).expect(404);
  await as('outsider')
    .post(`/teams/${team.id}/files`)
    .attach('file', Buffer.from('x'), 'x.txt')
    .expect(404);
  await as('outsider').get(`/files/${taggedId}/download`).expect(404);
  await as('outsider')
    .put(`/files/${taggedId}`)
    .send({ teamAssignmentId: null })
    .expect(404);
  await as('outsider').delete(`/files/${taggedId}`).expect(404);
  assert.equal(await storedCount(), before);
});

test('과제 연결 변경과 삭제는 업로더 본인만 할 수 있다', async () => {
  await as('member')
    .put(`/files/${taggedId}`)
    .send({ teamAssignmentId: null })
    .expect(403);
  await as('member').delete(`/files/${taggedId}`).expect(403);

  const moved = await as('member')
    .put(`/files/${untaggedId}`)
    .send({ teamAssignmentId: teamAssignment.id.toString() })
    .expect(200);
  assert.equal(moved.body.file.teamAssignmentTitle, '최종 발표');
  await as('member')
    .put(`/files/${untaggedId}`)
    .send({ teamAssignmentId: otherTeamAssignment.id.toString() })
    .expect(400);
  await as('member')
    .put(`/files/${untaggedId}`)
    .send({ teamAssignmentId: 1 })
    .expect(400);
  await as('member')
    .put(`/files/${untaggedId}`)
    .send({ teamAssignmentId: null, teamId: '1' })
    .expect(400);
  const cleared = await as('member')
    .put(`/files/${untaggedId}`)
    .send({})
    .expect(200);
  assert.equal(cleared.body.file.teamAssignmentId, null);

  // 개인 과제 첨부는 과제 연결 대상이 아니다.
  const personalFile = await prisma.file.findFirstOrThrow({
    where: { assignmentId: personal.id },
  });
  await as('owner')
    .put(`/files/${personalFile.id}`)
    .send({ teamAssignmentId: teamAssignment.id.toString() })
    .expect(400);

  const before = await storedCount();
  const { body } = await as('member')
    .delete(`/files/${untaggedId}`)
    .expect(200);
  assert.deepEqual(body, { message: '파일을 삭제했습니다.' });
  assert.equal(await storedCount(), before - 1);
  await as('member').get(`/files/${untaggedId}/download`).expect(404);
});

test('탈퇴한 멤버는 자신이 올린 팀 파일에도 접근할 수 없고 파일은 팀에 남는다', async () => {
  const uploaded = await as('member')
    .post(`/teams/${team.id}/files`)
    .attach('file', Buffer.from('자료'), '자료.txt')
    .expect(201);
  await as('member').post(`/teams/${team.id}/leave`).expect(200);
  await as('member')
    .get(`/files/${uploaded.body.file.id}/download`)
    .expect(404);
  const list = await as('owner').get(`/teams/${team.id}/files`).expect(200);
  assert.ok(list.body.files.some((file) => file.id === uploaded.body.file.id));
});

test('팀 과제를 삭제하면 연결된 파일은 남고 연결만 해제된다', async () => {
  await as('owner')
    .delete(`/team-assignments/${teamAssignment.id}`)
    .expect(200);
  const file = await prisma.file.findUniqueOrThrow({
    where: { id: BigInt(taggedId) },
  });
  assert.equal(file.teamAssignmentId, null);
  assert.equal(file.teamId, team.id);
});

test('개인 과제를 삭제하면 첨부파일 기록과 실제 파일을 함께 지운다', async () => {
  const before = await storedCount();
  const count = await prisma.file.count({
    where: { assignmentId: personal.id },
  });
  assert.ok(count > 0);
  await as('owner').delete(`/assignments/${personal.id}`).expect(200);
  assert.equal(
    await prisma.file.count({ where: { assignmentId: personal.id } }),
    0,
  );
  assert.equal(await storedCount(), before - count);
});

test('팀을 삭제하면 팀 파일 기록과 실제 파일을 함께 지운다', async () => {
  const count = await prisma.file.count({ where: { teamId: team.id } });
  assert.ok(count > 0);
  const before = await storedCount();
  await as('owner').delete(`/teams/${team.id}`).expect(200);
  assert.equal(await prisma.file.count({ where: { teamId: team.id } }), 0);
  assert.equal(await storedCount(), before - count);
});
