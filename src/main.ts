import 'reflect-metadata';
import 'dotenv/config';

import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  /*
   * Servir tanto a raiz do projeto (onde está o index.html) 
   * quanto a pasta /web (para carregar shared, vendor e views)
   */
  app.useStaticAssets(process.cwd());

  /*
   * Templates Handlebars
   */
  app.setBaseViewsDir(join(process.cwd(), 'web', 'views'));
  app.setViewEngine('hbs');

  /*
   * Segurança básica
   */
  app.enableCors();

  const port = process.env.PORT || 3000;

  await app.listen(port);

  console.log(`SIGE IFCE executando em http://localhost:${port}`);
}

bootstrap();