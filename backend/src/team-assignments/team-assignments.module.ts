import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { TeamAssignmentsController } from './team-assignments.controller';
import { TeamAssignmentsService } from './team-assignments.service';

@Module({
  imports: [AuthModule, PrismaModule, RealtimeModule],
  controllers: [TeamAssignmentsController],
  providers: [TeamAssignmentsService],
})
export class TeamAssignmentsModule {}
