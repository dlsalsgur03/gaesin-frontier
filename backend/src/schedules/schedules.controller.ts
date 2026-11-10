import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { CalendarScheduleQueryDto, ScheduleDto } from './schedule.dto';
import { SchedulesService } from './schedules.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class SchedulesController {
  constructor(private readonly service: SchedulesService) {}

  @Get('teams/:teamId/schedules')
  @Header('Cache-Control', 'private, no-store')
  list(@Req() req: AuthenticatedRequest, @Param('teamId') teamId: string) {
    return this.service.list(req.userId, teamId);
  }

  @Post('teams/:teamId/schedules')
  create(
    @Req() req: AuthenticatedRequest,
    @Param('teamId') teamId: string,
    @Body() dto: ScheduleDto,
  ) {
    return this.service.create(req.userId, teamId, dto);
  }

  @Put('schedules/:id')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ScheduleDto,
  ) {
    return this.service.update(req.userId, id, dto);
  }

  @Delete('schedules/:id')
  remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.remove(req.userId, id);
  }

  @Get('calendar/schedules')
  @Header('Cache-Control', 'private, no-store')
  calendar(
    @Req() req: AuthenticatedRequest,
    @Query() query: CalendarScheduleQueryDto,
  ) {
    return this.service.calendar(req.userId, query);
  }
}
