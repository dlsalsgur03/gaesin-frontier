import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { JoinTeamDto, TeamNameDto, TransferTeamDto } from './team.dto';
import { TeamsService } from './teams.service';

@Controller('teams')
@UseGuards(JwtAuthGuard)
export class TeamsController {
  constructor(private readonly service: TeamsService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(@Req() req: AuthenticatedRequest) {
    return this.service.list(req.userId);
  }

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() dto: TeamNameDto) {
    return this.service.create(req.userId, dto.name);
  }

  @Post('join')
  join(@Req() req: AuthenticatedRequest, @Body() dto: JoinTeamDto) {
    return this.service.join(req.userId, dto.inviteCode);
  }

  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.get(req.userId, id);
  }

  @Put(':id')
  rename(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: TeamNameDto,
  ) {
    return this.service.rename(req.userId, id, dto.name);
  }

  @Delete(':id')
  remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.remove(req.userId, id);
  }

  @Post(':id/invite-code')
  @HttpCode(200)
  regenerateInviteCode(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.service.regenerateInviteCode(req.userId, id);
  }

  @Post(':id/transfer')
  @HttpCode(200)
  transfer(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: TransferTeamDto,
  ) {
    return this.service.transfer(req.userId, id, dto.userId);
  }

  @Post(':id/leave')
  @HttpCode(200)
  leave(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.service.leave(req.userId, id);
  }

  @Delete(':id/members/:userId')
  removeMember(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.service.removeMember(req.userId, id, userId);
  }
}
