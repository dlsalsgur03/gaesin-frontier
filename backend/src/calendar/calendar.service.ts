import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CalendarQueryDto } from './dto/calendar-query.dto';

type CalendarAssignmentBase = {
  id: string;
  title: string;
  startDate: string;
  dueDate: string;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE';
};

export type CalendarAssignment = CalendarAssignmentBase &
  ({ kind: 'personal' } | { kind: 'team'; teamId: string; teamName: string });

/** 캘린더용 할 일. 나에게 배정되고 마감일이 있는 것만 마감일 칸에 표시한다. */
export type CalendarTask = {
  id: string;
  title: string;
  description: string;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE';
  dueDate: string;
  /** 완료 체크가 PUT /tasks/:id(전체 수정)를 쓰므로 그대로 돌려보낼 값도 함께 준다. */
  assigneeId: string;
  teamAssignmentId: string;
  teamAssignmentTitle: string;
  teamId: string;
  teamName: string;
};

const DAY_MS = 86_400_000;

/** from~to(YYYY-MM-DD, 양 끝 포함)를 UTC 자정 범위로 바꾼다. 1~62일만 허용한다. */
function dayRange(query: CalendarQueryDto) {
  const from = new Date(`${query.from}T00:00:00.000Z`);
  const to = new Date(`${query.to}T00:00:00.000Z`);
  const days = (to.getTime() - from.getTime()) / DAY_MS + 1;

  if (!Number.isFinite(days) || days < 1 || days > 62) {
    throw new BadRequestException(
      '조회 기간은 from부터 to까지 1~62일이어야 합니다.',
    );
  }
  return { from, to, exclusiveEnd: new Date(to.getTime() + DAY_MS) };
}

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async getAssignments(
    userId: string,
    query: CalendarQueryDto,
  ): Promise<{ assignments: CalendarAssignment[] }> {
    // DateTime 컬럼은 UTC 기준 날짜로 읽고 날짜 문자열로 전달한다.
    const { from, exclusiveEnd } = dayRange(query);
    const period = {
      startDate: { not: null, lt: exclusiveEnd },
      dueDate: { not: null, gte: from },
    };
    const select = {
      id: true,
      title: true,
      startDate: true,
      dueDate: true,
      status: true,
    } as const;
    const ownerId = BigInt(userId);

    const [personal, team] = await this.prisma.$transaction([
      this.prisma.assignment.findMany({
        where: { userId: ownerId, ...period },
        select,
      }),
      this.prisma.teamAssignment.findMany({
        where: {
          ...period,
          team: { team_members: { some: { userId: ownerId } } },
        },
        select: { ...select, team: { select: { id: true, name: true } } },
      }),
    ]);

    const assignments: CalendarAssignment[] = [];
    for (const task of personal) {
      if (!task.startDate || !task.dueDate || task.startDate > task.dueDate)
        continue;
      assignments.push({
        kind: 'personal',
        id: task.id.toString(),
        title: task.title,
        startDate: task.startDate.toISOString().slice(0, 10),
        dueDate: task.dueDate.toISOString().slice(0, 10),
        status: task.status,
      });
    }
    for (const task of team) {
      if (!task.startDate || !task.dueDate || task.startDate > task.dueDate)
        continue;
      assignments.push({
        kind: 'team',
        id: task.id.toString(),
        title: task.title,
        startDate: task.startDate.toISOString().slice(0, 10),
        dueDate: task.dueDate.toISOString().slice(0, 10),
        status: task.status,
        teamId: task.team.id.toString(),
        teamName: task.team.name,
      });
    }
    assignments.sort(
      (a, b) =>
        a.startDate.localeCompare(b.startDate) ||
        `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`),
    );
    return { assignments };
  }

  /** 기간 안에 마감일이 있고 나에게 배정된, 지금 소속된 팀의 할 일. */
  async getTasks(
    userId: string,
    query: CalendarQueryDto,
  ): Promise<{ tasks: CalendarTask[] }> {
    const { from, exclusiveEnd } = dayRange(query);
    const me = BigInt(userId);
    const tasks = await this.prisma.task.findMany({
      where: {
        assigneeId: me,
        dueDate: { not: null, gte: from, lt: exclusiveEnd },
        teamAssignment: { team: { team_members: { some: { userId: me } } } },
      },
      include: {
        teamAssignment: {
          select: {
            id: true,
            title: true,
            team: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
    });
    return {
      tasks: tasks.map((task) => ({
        id: task.id.toString(),
        title: task.title,
        description: task.description ?? '',
        status: task.status,
        dueDate: task.dueDate!.toISOString().slice(0, 10),
        assigneeId: userId,
        teamAssignmentId: task.teamAssignment.id.toString(),
        teamAssignmentTitle: task.teamAssignment.title,
        teamId: task.teamAssignment.team.id.toString(),
        teamName: task.teamAssignment.team.name,
      })),
    };
  }
}
