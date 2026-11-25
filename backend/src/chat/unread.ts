import type { PrismaService } from '../prisma/prisma.service';

/**
 * 팀 하나의 안 읽은 메시지 수: 마지막으로 읽은 메시지보다 새로운, 다른 사람이 보낸 메시지.
 * 내가 보낸 메시지는 세지 않는다.
 */
export function countUnread(
  prisma: PrismaService,
  teamId: bigint,
  userId: bigint,
  lastReadMessageId: bigint | null,
) {
  return prisma.message.count({
    where: {
      teamId,
      userId: { not: userId },
      ...(lastReadMessageId === null ? {} : { id: { gt: lastReadMessageId } }),
    },
  });
}
