import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { parseId } from '../common/parse-id';
import { PrismaService } from '../prisma/prisma.service';
import { AssignmentDto, toAssignmentData } from '../assignments/assignment.dto';
import { Prisma } from '../generated/prisma/client';
import type { TeamAssignment, Task } from '../generated/prisma/client';
import { TaskDto } from './task.dto';

const day = (value: Date | null) => value?.toISOString().slice(0, 10) ?? '';
const notFound = () => new NotFoundException('팀 과제를 찾을 수 없습니다.');

/** 권한 확인 직후 다른 요청이 같은 행을 지웠다면 500 대신 404로 응답한다. */
async function orNotFound<T>(query: Promise<T>, message: string) {
  try {
    return await query;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    )
      throw new NotFoundException(message);
    throw error;
  }
}

/**
 * 팀 과제와 할 일은 해당 팀의 모든 멤버가 등록·수정·삭제할 수 있다.
 * 멤버가 아니면 자원의 존재 여부를 드러내지 않도록 404로 응답한다.
 */
@Injectable()
export class TeamAssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  private member(userId: string) {
    return { team_members: { some: { userId: BigInt(userId) } } };
  }

  private serialize(
    task: TeamAssignment & {
      team: { id: bigint; name: string };
      tasks: { status: string }[];
    },
  ) {
    return {
      id: task.id.toString(),
      teamId: task.team.id.toString(),
      teamName: task.team.name,
      title: task.title,
      description: task.description ?? '',
      startDate: day(task.startDate),
      dueDate: day(task.dueDate),
      status: task.status,
      taskCount: task.tasks.length,
      doneTaskCount: task.tasks.filter(({ status }) => status === 'DONE')
        .length,
    };
  }

  private serializeTask(task: Task & { user: { nickname: string } | null }) {
    return {
      id: task.id.toString(),
      teamAssignmentId: task.teamAssignmentId.toString(),
      title: task.title,
      description: task.description ?? '',
      assigneeId: task.assigneeId?.toString() ?? null,
      assigneeNickname: task.user?.nickname ?? null,
      dueDate: task.dueDate ? day(task.dueDate) : null,
      status: task.status,
    };
  }

  private readonly include = {
    team: { select: { id: true, name: true } },
    tasks: { select: { status: true } },
  } as const;

  private readonly taskInclude = { user: { select: { nickname: true } } };

  private async assignment(userId: string, id: string) {
    const assignment = await this.prisma.teamAssignment.findFirst({
      where: {
        id: parseId(id, '유효하지 않은 과제 ID입니다.'),
        team: this.member(userId),
      },
    });
    if (!assignment) throw notFound();
    return assignment;
  }

  private async task(userId: string, id: string) {
    const task = await this.prisma.task.findFirst({
      where: {
        id: parseId(id, '유효하지 않은 할 일 ID입니다.'),
        teamAssignment: { team: this.member(userId) },
      },
      include: { teamAssignment: { select: { teamId: true } } },
    });
    if (!task) throw new NotFoundException('할 일을 찾을 수 없습니다.');
    return task;
  }

  /** 담당자는 같은 팀의 현재 멤버만 지정할 수 있다. */
  private async taskData(teamId: bigint, dto: TaskDto) {
    const assigneeId = dto.assigneeId ? BigInt(dto.assigneeId) : null;
    if (
      assigneeId !== null &&
      !(await this.prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId, userId: assigneeId } },
      }))
    )
      throw new BadRequestException(
        '같은 팀 멤버만 담당자로 지정할 수 있습니다.',
      );
    return {
      title: dto.title,
      description: dto.description?.trim() || null,
      assigneeId,
      dueDate: dto.dueDate ? new Date(`${dto.dueDate}T00:00:00.000Z`) : null,
      status: dto.status,
    };
  }

  async list(userId: string, teamId: string) {
    const team = await this.prisma.team.findFirst({
      where: {
        id: parseId(teamId, '유효하지 않은 팀 ID입니다.'),
        ...this.member(userId),
      },
    });
    if (!team) throw new NotFoundException('팀을 찾을 수 없습니다.');
    const assignments = await this.prisma.teamAssignment.findMany({
      where: { teamId: team.id },
      include: this.include,
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
    });
    return { assignments: assignments.map((task) => this.serialize(task)) };
  }

  async create(userId: string, teamId: string, dto: AssignmentDto) {
    const team = await this.prisma.team.findFirst({
      where: {
        id: parseId(teamId, '유효하지 않은 팀 ID입니다.'),
        ...this.member(userId),
      },
    });
    if (!team) throw new NotFoundException('팀을 찾을 수 없습니다.');
    const assignment = await this.prisma.teamAssignment.create({
      data: { ...toAssignmentData(dto), teamId: team.id },
      include: this.include,
    });
    return { assignment: this.serialize(assignment) };
  }

  async get(userId: string, id: string) {
    const { id: assignmentId } = await this.assignment(userId, id);
    const assignment = await this.prisma.teamAssignment.findUniqueOrThrow({
      where: { id: assignmentId },
      include: this.include,
    });
    return { assignment: this.serialize(assignment) };
  }

  async update(userId: string, id: string, dto: AssignmentDto) {
    const data = toAssignmentData(dto);
    const { id: assignmentId } = await this.assignment(userId, id);
    const assignment = await orNotFound(
      this.prisma.teamAssignment.update({
        where: { id: assignmentId },
        data,
        include: this.include,
      }),
      '팀 과제를 찾을 수 없습니다.',
    );
    return { assignment: this.serialize(assignment) };
  }

  async remove(userId: string, id: string) {
    const { id: teamAssignmentId } = await this.assignment(userId, id);
    // 외래 키에 cascade가 없으므로 첨부파일과 할 일을 먼저 지운다.
    await orNotFound(
      this.prisma.$transaction([
        this.prisma.file.deleteMany({ where: { teamAssignmentId } }),
        this.prisma.task.deleteMany({ where: { teamAssignmentId } }),
        this.prisma.teamAssignment.delete({ where: { id: teamAssignmentId } }),
      ]),
      '팀 과제를 찾을 수 없습니다.',
    );
    return { message: '팀 과제를 삭제했습니다.' };
  }

  async listTasks(userId: string, id: string) {
    const { id: teamAssignmentId } = await this.assignment(userId, id);
    const tasks = await this.prisma.task.findMany({
      where: { teamAssignmentId },
      include: this.taskInclude,
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
    });
    return { tasks: tasks.map((task) => this.serializeTask(task)) };
  }

  async createTask(userId: string, id: string, dto: TaskDto) {
    const assignment = await this.assignment(userId, id);
    const data = await this.taskData(assignment.teamId, dto);
    const task = await this.prisma.task.create({
      data: { ...data, teamAssignmentId: assignment.id },
      include: this.taskInclude,
    });
    return { task: this.serializeTask(task) };
  }

  async updateTask(userId: string, id: string, dto: TaskDto) {
    const current = await this.task(userId, id);
    const data = await this.taskData(current.teamAssignment.teamId, dto);
    const task = await orNotFound(
      this.prisma.task.update({
        where: { id: current.id },
        data,
        include: this.taskInclude,
      }),
      '할 일을 찾을 수 없습니다.',
    );
    return { task: this.serializeTask(task) };
  }

  async removeTask(userId: string, id: string) {
    const task = await this.task(userId, id);
    await orNotFound(
      this.prisma.task.delete({ where: { id: task.id } }),
      '할 일을 찾을 수 없습니다.',
    );
    return { message: '할 일을 삭제했습니다.' };
  }
}
