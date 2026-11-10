import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { parseId } from '../common/parse-id';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

const DEFAULT_LIMIT = 50;

const include = { user: { select: { nickname: true } } } as const;
type MessageRow = Prisma.MessageGetPayload<{ include: typeof include }>;

function serialize(message: MessageRow) {
  return {
    id: message.id.toString(),
    teamId: message.teamId.toString(),
    userId: message.userId.toString(),
    nickname: message.user.nickname,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
  };
}

/**
 * 팀 채팅. 현재 팀 멤버만 읽고 쓸 수 있으며 아니면 404다.
 * 메시지 순서는 ID(작성 순서) 기준이고, 목록은 항상 오래된 것 → 최신 순으로 돌려준다.
 * 저장한 메시지는 소켓으로 팀 룸 전체(보낸 사람 포함)에 `message:new`로 보낸다.
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  private async team(userId: string, id: string) {
    const team = await this.prisma.team.findFirst({
      where: {
        id: parseId(id, '유효하지 않은 팀 ID입니다.'),
        team_members: { some: { userId: BigInt(userId) } },
      },
      select: { id: true },
    });
    if (!team) throw new NotFoundException('팀을 찾을 수 없습니다.');
    return team;
  }

  /**
   * 커서가 없으면 최신 limit개, before면 그보다 오래된 limit개, after면 그보다 새로운 limit개.
   * hasMore는 요청한 방향(커서 없음·before는 더 오래된 쪽, after는 더 새로운 쪽)에 남은 메시지가 있는지다.
   */
  async list(
    userId: string,
    teamId: string,
    query: { before?: string; after?: string; limit?: number },
  ) {
    if (query.before && query.after)
      throw new BadRequestException('before와 after는 함께 보낼 수 없습니다.');
    const team = await this.team(userId, teamId);
    const limit = query.limit ?? DEFAULT_LIMIT;
    const newer = !!query.after;
    const boundary = query.after ?? query.before;
    const id = boundary
      ? newer
        ? { gt: parseId(boundary, '유효하지 않은 메시지 ID입니다.') }
        : { lt: parseId(boundary, '유효하지 않은 메시지 ID입니다.') }
      : undefined;

    const rows = await this.prisma.message.findMany({
      where: { teamId: team.id, id },
      include,
      orderBy: { id: newer ? 'asc' : 'desc' },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    if (!newer) page.reverse();
    return { messages: page.map(serialize), hasMore };
  }

  async send(userId: string, teamId: string, content: string) {
    const team = await this.team(userId, teamId);
    const message = serialize(
      await this.prisma.message.create({
        data: { teamId: team.id, userId: BigInt(userId), content },
        include,
      }),
    );
    this.realtime.emitToTeam(team.id, 'message:new', message);
    return { message };
  }
}
