import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { parseId } from '../common/parse-id';

// 혼동하기 쉬운 0/O, 1/I/L을 제외한다.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 10;

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  private inviteCode() {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++)
      code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    return code;
  }

  /** 초대 코드가 우연히 겹치면 새 코드로 다시 시도한다. */
  private async withInviteCode<T>(run: (code: string) => Promise<T>) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await run(this.inviteCode());
      } catch (error) {
        if (!isUniqueViolation(error) || attempt >= 4) throw error;
      }
    }
  }

  /** 멤버가 아니면 팀의 존재 여부를 드러내지 않도록 404로 응답한다. */
  private async team(userId: string, id: string, ownerOnly = false) {
    const teamId = parseId(id, '유효하지 않은 팀 ID입니다.');
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, team_members: { some: { userId: BigInt(userId) } } },
    });
    if (!team) throw new NotFoundException('팀을 찾을 수 없습니다.');
    if (ownerOnly && team.ownerId !== BigInt(userId))
      throw new ForbiddenException('팀 소유자만 할 수 있습니다.');
    return team;
  }

  private async detail(userId: string, teamId: bigint) {
    const team = await this.prisma.team.findUniqueOrThrow({
      where: { id: teamId },
      include: {
        team_members: {
          include: { user: { select: { nickname: true } } },
          orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
    const me = BigInt(userId);
    return {
      team: {
        id: team.id.toString(),
        name: team.name,
        inviteCode: team.inviteCode,
        myRole: team.ownerId === me ? 'OWNER' : 'MEMBER',
        members: team.team_members.map((member) => ({
          userId: member.userId.toString(),
          nickname: member.user.nickname,
          role: member.role,
          joinedAt: member.joinedAt.toISOString(),
          isMe: member.userId === me,
        })),
      },
    };
  }

  async list(userId: string) {
    const memberships = await this.prisma.teamMember.findMany({
      where: { userId: BigInt(userId) },
      include: {
        team: {
          select: {
            id: true,
            name: true,
            _count: { select: { team_members: true } },
          },
        },
      },
      orderBy: [{ joinedAt: 'desc' }, { id: 'desc' }],
    });
    return {
      teams: memberships.map(({ role, team }) => ({
        id: team.id.toString(),
        name: team.name,
        role,
        memberCount: team._count.team_members,
      })),
    };
  }

  async get(userId: string, id: string) {
    const team = await this.team(userId, id);
    return this.detail(userId, team.id);
  }

  async create(userId: string, name: string) {
    const ownerId = BigInt(userId);
    const team = await this.withInviteCode((inviteCode) =>
      this.prisma.team.create({
        data: {
          name,
          inviteCode,
          ownerId,
          team_members: { create: { userId: ownerId, role: 'OWNER' } },
        },
      }),
    );
    return this.detail(userId, team.id);
  }

  async rename(userId: string, id: string, name: string) {
    const team = await this.team(userId, id, true);
    await this.prisma.team.update({ where: { id: team.id }, data: { name } });
    return this.detail(userId, team.id);
  }

  async join(userId: string, inviteCode: string) {
    const team = await this.prisma.team.findUnique({ where: { inviteCode } });
    if (!team) throw new NotFoundException('초대 코드가 올바르지 않습니다.');
    try {
      await this.prisma.teamMember.create({
        data: { teamId: team.id, userId: BigInt(userId), role: 'MEMBER' },
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException('이미 참여한 팀입니다.');
      throw error;
    }
    return this.detail(userId, team.id);
  }

  async regenerateInviteCode(userId: string, id: string) {
    const team = await this.team(userId, id, true);
    await this.withInviteCode((inviteCode) =>
      this.prisma.team.update({ where: { id: team.id }, data: { inviteCode } }),
    );
    return this.detail(userId, team.id);
  }

  async transfer(userId: string, id: string, targetId: string) {
    const team = await this.team(userId, id, true);
    const target = parseId(targetId, '유효하지 않은 사용자 ID입니다.');
    if (target === team.ownerId)
      throw new BadRequestException('이미 팀 소유자입니다.');
    await this.prisma.$transaction(async (tx) => {
      // 동시에 다른 이전 요청이 처리됐다면 소유자 조건에서 걸러진다.
      const moved = await tx.team.updateMany({
        where: { id: team.id, ownerId: team.ownerId },
        data: { ownerId: target },
      });
      const promoted = await tx.teamMember.updateMany({
        where: { teamId: team.id, userId: target, role: 'MEMBER' },
        data: { role: 'OWNER' },
      });
      if (!moved.count || !promoted.count)
        throw new NotFoundException('팀 멤버를 찾을 수 없습니다.');
      await tx.teamMember.updateMany({
        where: { teamId: team.id, userId: team.ownerId },
        data: { role: 'MEMBER' },
      });
    });
    return this.detail(userId, team.id);
  }

  async leave(userId: string, id: string) {
    const team = await this.team(userId, id);
    if (team.ownerId === BigInt(userId))
      throw new BadRequestException(
        '팀 소유자는 소유권을 다른 멤버에게 넘긴 뒤 탈퇴할 수 있습니다.',
      );
    await this.removeMembership(team.id, BigInt(userId));
    return { message: '팀에서 탈퇴했습니다.' };
  }

  async removeMember(userId: string, id: string, memberId: string) {
    const team = await this.team(userId, id, true);
    const target = parseId(memberId, '유효하지 않은 사용자 ID입니다.');
    if (target === team.ownerId)
      throw new BadRequestException('팀 소유자는 내보낼 수 없습니다.');
    if (!(await this.removeMembership(team.id, target)))
      throw new NotFoundException('팀 멤버를 찾을 수 없습니다.');
    return this.detail(userId, team.id);
  }

  /** 팀을 떠난 사용자가 맡던 할 일은 미배정으로 돌린다. 소유자 멤버십은 지우지 않는다. */
  private async removeMembership(teamId: bigint, userId: bigint) {
    return this.prisma.$transaction(async (tx) => {
      const removed = await tx.teamMember.deleteMany({
        where: { teamId, userId, role: 'MEMBER' },
      });
      if (removed.count)
        await tx.task.updateMany({
          where: { assigneeId: userId, teamAssignment: { teamId } },
          data: { assigneeId: null },
        });
      return removed.count;
    });
  }

  async remove(userId: string, id: string) {
    const team = await this.team(userId, id, true);
    // 외래 키에 cascade가 없으므로 팀에 딸린 행을 자식부터 지운다.
    await this.prisma.$transaction(async (tx) => {
      const teamId = team.id;
      await tx.file.deleteMany({
        where: { OR: [{ teamId }, { teamAssignment: { teamId } }] },
      });
      await tx.task.deleteMany({ where: { teamAssignment: { teamId } } });
      await tx.teamAssignment.deleteMany({ where: { teamId } });
      await tx.schedule.deleteMany({ where: { teamId } });
      await tx.message.deleteMany({ where: { teamId } });
      await tx.teamMember.deleteMany({ where: { teamId } });
      const deleted = await tx.team.deleteMany({
        where: { id: teamId, ownerId: BigInt(userId) },
      });
      if (!deleted.count)
        throw new ForbiddenException('팀 소유자만 할 수 있습니다.');
    });
    return { message: '팀을 삭제했습니다.' };
  }
}
