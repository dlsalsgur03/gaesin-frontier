import { AssignmentsModule } from './assignments/assignments.module';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CalendarModule } from './calendar/calendar.module';
import { TeamsModule } from './teams/teams.module';
import { TeamAssignmentsModule } from './team-assignments/team-assignments.module';
import { FilesModule } from './files/files.module';
import { ChatModule } from './chat/chat.module';
import { SchedulesModule } from './schedules/schedules.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    CalendarModule,
    AssignmentsModule,
    TeamsModule,
    TeamAssignmentsModule,
    FilesModule,
    ChatModule,
    SchedulesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
