import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { parseId } from '../common/parse-id';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { Prisma } from '../generated/prisma/client';
import type { Schedule } from '../generated/prisma/client';
import {
  CalendarScheduleQueryDto,
  ScheduleDto,
  toScheduleTimes,
} from './schedule.dto';

const DAY_MS = 86_400_000;
const NOT_FOUND = '일정을 찾을 수 없습니다.';

/** 권한 확인 직후 다른 요청이 같은 행을 지웠다면 500 대신 404로 응답한다. */
async function orNotFound<T>(query: Promise<T>) {
  try {
    return await query;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    )
      throw new NotFoundException(NOT_FOUND);
    throw error;
  }
}

/**
 * 팀 일정은 해당 팀의 모든 멤버가 등록·수정·삭제할 수 있다.
 * 멤버가 아니면 자원의 존재 여부를 드러내지 않도록 404로 응답한다.
 */
@Injectable()
export class SchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  private member(userId: string) {
    return { team_members: { some: { userId: BigInt(userId) } } };
  }

  private readonly include = {
    team: { select: { id: true, name: true } },
  } as const;

  private serialize(
    schedule: Schedule & { team: { id: bigint; name: string } },
  ) {
    return {
      id: schedule.id.toString(),
      teamId: schedule.team.id.toString(),
      teamName: schedule.team.name,
      title: schedule.title,
      description: schedule.description ?? '',
      startAt: schedule.startAt.toISOString(),
      endAt: schedule.endAt.toISOString(),
    };
  }

  private async team(userId: string, teamId: string) {
    const team = await this.prisma.team.findFirst({
      where: {
        id: parseId(teamId, '유효하지 않은 팀 ID입니다.'),
        ...this.member(userId),
      },
      select: { id: true },
    });
    if (!team) throw new NotFoundException('팀을 찾을 수 없습니다.');
    return team;
  }

  private async schedule(userId: string, id: string) {
    const schedule = await this.prisma.schedule.findFirst({
      where: {
        id: parseId(id, '유효하지 않은 일정 ID입니다.'),
        team: this.member(userId),
      },
    });
    if (!schedule) throw new NotFoundException(NOT_FOUND);
    return schedule;
  }

  async list(userId: string, teamId: string) {
    const team = await this.team(userId, teamId);
    const schedules = await this.prisma.schedule.findMany({
      where: { teamId: team.id },
      include: this.include,
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
    });
    return { schedules: schedules.map((item) => this.serialize(item)) };
  }

  async create(userId: string, teamId: string, dto: ScheduleDto) {
    const times = toScheduleTimes(dto);
    const team = await this.team(userId, teamId);
    const schedule = await this.prisma.schedule.create({
      data: {
        teamId: team.id,
        title: dto.title,
        description: dto.description?.trim() || null,
        ...times,
      },
      include: this.include,
    });
    this.realtime.teamChanged(team.id, 'schedules');
    return { schedule: this.serialize(schedule) };
  }

  async update(userId: string, id: string, dto: ScheduleDto) {
    const times = toScheduleTimes(dto);
    const current = await this.schedule(userId, id);
    const schedule = await orNotFound(
      this.prisma.schedule.update({
        where: { id: current.id },
        data: {
          title: dto.title,
          description: dto.description?.trim() || null,
          ...times,
        },
        include: this.include,
      }),
    );
    this.realtime.teamChanged(current.teamId, 'schedules');
    return { schedule: this.serialize(schedule) };
  }

  async remove(userId: string, id: string) {
    const current = await this.schedule(userId, id);
    await orNotFound(
      this.prisma.schedule.delete({ where: { id: current.id } }),
    );
    this.realtime.teamChanged(current.teamId, 'schedules');
    return { message: '일정을 삭제했습니다.' };
  }

  /** 캘린더용: 내가 속한 모든 팀의 일정 중 [from, to) 구간에 걸치는 것 */
  async calendar(userId: string, query: CalendarScheduleQueryDto) {
    const from = new Date(query.from);
    const to = new Date(query.to);
    const span = to.getTime() - from.getTime();
    if (!(span > 0 && span <= 62 * DAY_MS))
      throw new BadRequestException(
        '조회 기간은 from 이후 to까지 최대 62일이어야 합니다.',
      );
    const schedules = await this.prisma.schedule.findMany({
      where: {
        team: this.member(userId),
        startAt: { lt: to },
        endAt: { gte: from },
      },
      include: this.include,
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
    });
    return { schedules: schedules.map((item) => this.serialize(item)) };
  }
}
