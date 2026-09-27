import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CalendarModule } from './calendar/calendar.module';

@Module({
  imports: [PrismaModule, AuthModule, CalendarModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
