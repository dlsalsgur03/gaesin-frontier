import { Injectable, NotFoundException } from '@nestjs/common';
import { parseId } from '../common/parse-id';
import { PrismaService } from '../prisma/prisma.service';
import { AssignmentDto, toAssignmentData } from './assignment.dto';
import type { Assignment } from '../generated/prisma/client';
import { removeStoredFiles } from '../files/file-storage';

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

  /** 외래 키에 cascade가 없으므로 첨부파일 기록을 먼저 지우고, 커밋 후 실제 파일을 지운다. */
  async remove(userId: string, id: string) {
    const where = this.where(userId, id);
    const keys = await this.prisma.$transaction(async (tx) => {
      const files = await tx.file.findMany({
        where: { assignmentId: where.id, assignment: { userId: where.userId } },
        select: { fileUrl: true },
      });
      await tx.file.deleteMany({
        where: { assignmentId: where.id, assignment: { userId: where.userId } },
      });
      const result = await tx.assignment.deleteMany({ where });
      if (!result.count)
        throw new NotFoundException('과제를 찾을 수 없습니다.');
      return files.map((file) => file.fileUrl);
    });
    await removeStoredFiles(keys);
    return { message: '과제를 삭제했습니다.' };
  }
}
