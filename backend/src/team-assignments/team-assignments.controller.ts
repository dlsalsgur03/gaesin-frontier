import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { AssignmentDto } from '../assignments/assignment.dto';
import { TaskDto } from './task.dto';
import { TeamAssignmentsService } from './team-assignments.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class TeamAssignmentsController {
  constructor(private readonly service: TeamAssignmentsService) {}

  @Get('teams/:teamId/assignments')
  @Header('Cache-Control', 'private, no-store')
  list(@Req() req: AuthenticatedRequest, @Param('teamId') teamId: string) {
    return this.service.list(req.userId, teamId);
  }

  @Post('teams/:teamId/assignments')
  create(
    @Req() req: AuthenticatedRequest,
    @Param('teamId') teamId: string,
    @Body() dto: AssignmentDto,
  ) {
    return this.service.create(req.userId, teamId, dto);
  }

  @Get('team-assignments/:id')
  @Header('Cache-Control', 'private, no-store')
  get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.get(req.userId, id);
  }

  @Put('team-assignments/:id')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: AssignmentDto,
  ) {
    return this.service.update(req.userId, id, dto);
  }

  @Delete('team-assignments/:id')
  remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.remove(req.userId, id);
  }

  @Get('team-assignments/:id/tasks')
  @Header('Cache-Control', 'private, no-store')
  listTasks(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.listTasks(req.userId, id);
  }

  @Post('team-assignments/:id/tasks')
  createTask(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: TaskDto,
  ) {
    return this.service.createTask(req.userId, id, dto);
  }

  @Put('tasks/:id')
  updateTask(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: TaskDto,
  ) {
    return this.service.updateTask(req.userId, id, dto);
  }

  @Delete('tasks/:id')
  removeTask(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.removeTask(req.userId, id);
  }
}
