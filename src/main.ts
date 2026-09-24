import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.setBaseViewsDir(
    join(process.cwd(), 'web', 'views'),
  );

  app.setViewEngine('hbs');

  app.useStaticAssets(
    join(process.cwd(), 'web', 'shared'),
  );

  app.useStaticAssets(process.cwd());

  app.enableCors({
    origin: true,
    credentials: true,
  });

  const port = Number(process.env.PORT) || 3000;

  await app.listen(port);

  console.log(`SIGE IFCE executando em http://localhost:${port}`);
}

bootstrap();
