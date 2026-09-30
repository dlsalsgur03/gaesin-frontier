import { Controller, Get, Header, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { CalendarService } from './calendar.service';
import { CalendarQueryDto } from './dto/calendar-query.dto';

@Controller('calendar')
@UseGuards(JwtAuthGuard)
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get('assignments')
  @Header('Cache-Control', 'private, no-store')
  getAssignments(
    @Req() request: AuthenticatedRequest,
    @Query() query: CalendarQueryDto,
  ) {
    return this.calendarService.getAssignments(request.userId, query);
  }
}
