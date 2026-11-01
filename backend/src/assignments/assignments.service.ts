import { Injectable, NotFoundException } from '@nestjs/common';
import { parseId } from '../common/parse-id';
import { PrismaService } from '../prisma/prisma.service';
import { AssignmentDto, toAssignmentData } from './assignment.dto';
import type { Assignment } from '../generated/prisma/client';

@Injectable()
export class AssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  private where(userId: string, id: string) {
    return {
      id: parseId(id, '유효하지 않은 과제 ID입니다.'),
      userId: BigInt(userId),
    };
  }

  private serialize(task: Assignment) {
    return {
      id: task.id.toString(),
      title: task.title,
      description: task.description ?? '',
      startDate: task.startDate?.toISOString().slice(0, 10) ?? '',
      dueDate: task.dueDate?.toISOString().slice(0, 10) ?? '',
      status: task.status,
    };
  }

  async list(userId: string) {
    const tasks = await this.prisma.assignment.findMany({
      where: { userId: BigInt(userId) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return { assignments: tasks.map((task) => this.serialize(task)) };
  }

  async get(userId: string, id: string) {
    const task = await this.prisma.assignment.findFirst({
      where: this.where(userId, id),
    });
    if (!task) throw new NotFoundException('과제를 찾을 수 없습니다.');
    return { assignment: this.serialize(task) };
  }

  async create(userId: string, dto: AssignmentDto) {
    const task = await this.prisma.assignment.create({
      data: { ...toAssignmentData(dto), userId: BigInt(userId) },
    });
    return { assignment: this.serialize(task) };
  }

  async update(userId: string, id: string, dto: AssignmentDto) {
    const tasks = await this.prisma.assignment.updateManyAndReturn({
      where: this.where(userId, id),
      data: toAssignmentData(dto),
    });
    if (!tasks[0]) throw new NotFoundException('과제를 찾을 수 없습니다.');
    return { assignment: this.serialize(tasks[0]) };
  }

  async remove(userId: string, id: string) {
    const result = await this.prisma.assignment.deleteMany({
      where: this.where(userId, id),
    });
    if (!result.count) throw new NotFoundException('과제를 찾을 수 없습니다.');
    return { message: '과제를 삭제했습니다.' };
  }
}
