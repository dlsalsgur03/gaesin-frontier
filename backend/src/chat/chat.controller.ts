import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { ChatService } from './chat.service';
import { MessageDto, MessagesQueryDto } from './message.dto';

@Controller('teams/:teamId/messages')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly service: ChatService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(
    @Req() req: AuthenticatedRequest,
    @Param('teamId') teamId: string,
    @Query() query: MessagesQueryDto,
  ) {
    return this.service.list(req.userId, teamId, query);
  }

  @Post()
  send(
    @Req() req: AuthenticatedRequest,
    @Param('teamId') teamId: string,
    @Body() dto: MessageDto,
  ) {
    return this.service.send(req.userId, teamId, dto.content);
  }
}
