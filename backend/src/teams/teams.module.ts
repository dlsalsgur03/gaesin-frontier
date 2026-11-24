import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RateLimitModule } from '../rate-limit/rate-limit.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';

@Module({
  imports: [AuthModule, PrismaModule, RateLimitModule, RealtimeModule],
  controllers: [TeamsController],
  providers: [TeamsService],
})
export class TeamsModule {}
