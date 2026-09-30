import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AssignmentDto } from './assignment.dto';
import type { Assignment } from '../generated/prisma/client';

@Injectable()
export class AssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  private where(userId: string, id: string) {
    if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n)
      throw new BadRequestException('유효하지 않은 과제 ID입니다.');
    return { id: BigInt(id), userId: BigInt(userId) };
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

  private data(dto: AssignmentDto) {
    if (dto.startDate > dto.dueDate)
      throw new BadRequestException('마감일은 시작일 이후여야 합니다.');
    return {
      title: dto.title,
      description: dto.description?.trim() || null,
      startDate: new Date(`${dto.startDate}T00:00:00.000Z`),
      dueDate: new Date(`${dto.dueDate}T00:00:00.000Z`),
      status: dto.status,
    };
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
      data: { ...this.data(dto), userId: BigInt(userId) },
    });
    return { assignment: this.serialize(task) };
  }

  async update(userId: string, id: string, dto: AssignmentDto) {
    const tasks = await this.prisma.assignment.updateManyAndReturn({
      where: this.where(userId, id),
      data: this.data(dto),
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
