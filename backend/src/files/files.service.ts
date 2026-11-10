import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { stat } from 'node:fs/promises';
import { parseId } from '../common/parse-id';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { removeStoredFiles, storagePath } from './file-storage';

/** 저장소 엔진이 디스크에 쓴 업로드 파일 정보 */
export type StoredUpload = {
  originalname: string;
  /** 저장소 키 */
  filename: string;
  size: number;
};

const notFound = () => new NotFoundException('파일을 찾을 수 없습니다.');

const include = {
  user: { select: { nickname: true } },
  teamAssignment: { select: { title: true } },
} as const;

type FileRow = Prisma.FileGetPayload<{ include: typeof include }>;

/** 경로 구분자와 제어 문자를 빼고 표시용 원본 파일명만 남긴다. */
function displayName(name: string) {
  const base = [...(name.split(/[\\/]/).pop() ?? '')]
    .filter((char) => char.charCodeAt(0) > 0x1f && char.charCodeAt(0) !== 0x7f)
    .join('')
    .trim();
  if (!base) throw new BadRequestException('파일 이름이 비어 있습니다.');
  if (base.length > 255)
    throw new BadRequestException('파일 이름은 255자까지 가능합니다.');
  return base;
}

/**
 * 개인 과제 첨부는 과제 소유자만, 팀 파일은 그 팀의 현재 멤버만 볼 수 있다.
 * 팀 파일은 팀 과제 하나에 연결(태그)하거나 연결하지 않을 수 있다.
 * 파일 삭제와 연결 변경은 업로더 본인만 할 수 있다(다른 멤버는 403).
 * 접근 권한이 없거나 없는 자원은 404로 통일한다.
 */
@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  private serialize(file: FileRow, userId: string) {
    return {
      id: file.id.toString(),
      fileName: file.fileName,
      size: file.size,
      createdAt: file.createdAt.toISOString(),
      uploaderNickname: file.user.nickname,
      isMine: file.userId === BigInt(userId),
      teamAssignmentId: file.teamAssignmentId?.toString() ?? null,
      teamAssignmentTitle: file.teamAssignment?.title ?? null,
    };
  }

  private async assignment(userId: string, id: string) {
    const assignment = await this.prisma.assignment.findFirst({
      where: {
        id: parseId(id, '유효하지 않은 과제 ID입니다.'),
        userId: BigInt(userId),
      },
    });
    if (!assignment) throw new NotFoundException('과제를 찾을 수 없습니다.');
    return assignment;
  }

  private async team(userId: string, id: string) {
    const team = await this.prisma.team.findFirst({
      where: {
        id: parseId(id, '유효하지 않은 팀 ID입니다.'),
        team_members: { some: { userId: BigInt(userId) } },
      },
    });
    if (!team) throw new NotFoundException('팀을 찾을 수 없습니다.');
    return team;
  }

  /** 연결할 팀 과제는 같은 팀의 과제여야 한다. */
  private async teamAssignmentId(teamId: bigint, value?: string | null) {
    if (value === undefined || value === null || value === '') return null;
    const id = parseId(value, '유효하지 않은 과제 ID입니다.');
    const assignment = await this.prisma.teamAssignment.findFirst({
      where: { id, teamId },
    });
    if (!assignment)
      throw new BadRequestException('같은 팀의 과제에만 연결할 수 있습니다.');
    return id;
  }

  private async file(userId: string, id: string) {
    const me = BigInt(userId);
    const file = await this.prisma.file.findFirst({
      where: {
        id: parseId(id, '유효하지 않은 파일 ID입니다.'),
        OR: [
          { teamId: null, assignment: { userId: me } },
          { team: { team_members: { some: { userId: me } } } },
        ],
      },
      include,
    });
    if (!file) throw notFound();
    return file;
  }

  /** 업로드 직후 과제·팀이 삭제됐다면(외래 키 위반) 404로 응답한다. */
  private async create(data: Prisma.FileUncheckedCreateInput) {
    try {
      return await this.prisma.file.create({ data, include });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      )
        throw notFound();
      throw error;
    }
  }

  private checkUpload(upload: StoredUpload) {
    if (upload.size <= 0)
      throw new BadRequestException('빈 파일은 올릴 수 없습니다.');
    return {
      fileName: displayName(upload.originalname),
      fileUrl: upload.filename,
      size: upload.size,
    };
  }

  async listForAssignment(userId: string, id: string) {
    const assignment = await this.assignment(userId, id);
    const files = await this.prisma.file.findMany({
      where: { assignmentId: assignment.id },
      include,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return { files: files.map((file) => this.serialize(file, userId)) };
  }

  async uploadToAssignment(userId: string, id: string, upload: StoredUpload) {
    const assignment = await this.assignment(userId, id);
    const file = await this.create({
      ...this.checkUpload(upload),
      userId: BigInt(userId),
      assignmentId: assignment.id,
    });
    return { file: this.serialize(file, userId) };
  }

  async listForTeam(userId: string, id: string) {
    const team = await this.team(userId, id);
    const files = await this.prisma.file.findMany({
      where: { teamId: team.id },
      include,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return { files: files.map((file) => this.serialize(file, userId)) };
  }

  async uploadToTeam(
    userId: string,
    id: string,
    upload: StoredUpload,
    teamAssignmentId?: string,
  ) {
    const team = await this.team(userId, id);
    const data = this.checkUpload(upload);
    const file = await this.create({
      ...data,
      userId: BigInt(userId),
      teamId: team.id,
      teamAssignmentId: await this.teamAssignmentId(team.id, teamAssignmentId),
    });
    this.realtime.teamChanged(team.id, 'files');
    return { file: this.serialize(file, userId) };
  }

  /** 팀 파일이 연결된 팀 과제를 바꾸거나 연결을 해제한다(null). */
  async updateTag(userId: string, id: string, value: string | null) {
    const file = await this.file(userId, id);
    if (file.teamId === null)
      throw new BadRequestException('팀 파일만 과제 연결을 바꿀 수 있습니다.');
    if (file.userId !== BigInt(userId))
      throw new ForbiddenException('직접 올린 파일만 바꿀 수 있습니다.');
    const teamAssignmentId = await this.teamAssignmentId(file.teamId, value);
    const updated = await this.prisma.file.updateManyAndReturn({
      where: { id: file.id },
      data: { teamAssignmentId },
      include,
    });
    if (!updated[0]) throw notFound();
    this.realtime.teamChanged(file.teamId, 'files');
    return { file: this.serialize(updated[0], userId) };
  }

  async download(userId: string, id: string) {
    const file = await this.file(userId, id);
    const target = storagePath(file.fileUrl);
    // DB 기록은 있지만 실제 파일이 사라진 경우다.
    const info = target ? await stat(target).catch(() => null) : null;
    if (!target || !info?.isFile()) throw notFound();
    return { fileName: file.fileName, path: target, size: info.size };
  }

  async remove(userId: string, id: string) {
    const file = await this.file(userId, id);
    if (file.userId !== BigInt(userId))
      throw new ForbiddenException('직접 올린 파일만 삭제할 수 있습니다.');
    const deleted = await this.prisma.file.deleteMany({
      where: { id: file.id },
    });
    if (!deleted.count) throw notFound();
    await removeStoredFiles([file.fileUrl]);
    if (file.teamId !== null) this.realtime.teamChanged(file.teamId, 'files');
    return { message: '파일을 삭제했습니다.' };
  }
}
