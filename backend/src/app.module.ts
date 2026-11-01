import { AssignmentsModule } from './assignments/assignments.module';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CalendarModule } from './calendar/calendar.module';
import { TeamsModule } from './teams/teams.module';
import { TeamAssignmentsModule } from './team-assignments/team-assignments.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    CalendarModule,
    AssignmentsModule,
    TeamsModule,
    TeamAssignmentsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
