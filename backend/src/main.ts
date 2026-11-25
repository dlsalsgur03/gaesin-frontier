import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { corsOrigins } from './common/cors-origins';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 리버스 프록시(Nginx, 호스팅 서비스의 로드밸런서 등) 뒤에 둘 때 그 단계 수를 TRUST_PROXY에 적는다.
  // 그래야 req.ip가 프록시가 아니라 실제 사용자 IP가 되어 시도 횟수 제한이 사람마다 따로 걸린다.
  // 프록시 없이 직접 받을 때는 비워 둔다(헤더를 믿지 않음 — X-Forwarded-For로 IP를 속일 수 없다).
  const trustProxy = Number(process.env.TRUST_PROXY ?? 0);
  if (Number.isInteger(trustProxy) && trustProxy > 0)
    app.set('trust proxy', trustProxy);

  app.enableCors({
    origin: corsOrigins(),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.use(cookieParser());

  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
