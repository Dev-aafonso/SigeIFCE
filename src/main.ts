import 'dotenv/config';

import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'path';

import { AppModule } from './app.module';

function normalizeOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try { return new URL(value).origin; } catch { return undefined; }
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const port = Number(process.env.PORT) || 3000;

  // Helmet: cabeÃ§alhos de seguranÃ§a. A polÃ­tica CSP permite inline legado
  // temporariamente para preservar a SPA; remova unsafe-inline apÃ³s migrar para nonce/hash.
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
        formAction: ["'self'"],
        scriptSrc: ["'self'",  'https://cdn.jsdelivr.net', 'https://unpkg.com'],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://unpkg.com', 'https://fonts.googleapis.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:', 'https://cdn.jsdelivr.net', 'https://fonts.gstatic.com'],
        connectSrc: ["'self'"],
        upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
      },
    },
    // HSTS sÃ³ deve ser emitido em implantaÃ§Ã£o HTTPS.
    strictTransportSecurity: process.env.NODE_ENV === 'production' ? undefined : false,
  }));

  app.use(cookieParser());

  const allowedOrigins = new Set<string>();
  for (const raw of (process.env.CORS_ORIGINS || '').split(',')) {
    const origin = normalizeOrigin(raw.trim());
    if (origin) allowedOrigins.add(origin);
  }
  const appOrigin = normalizeOrigin(process.env.APP_URL);
  if (appOrigin) allowedOrigins.add(appOrigin);
  if (process.env.NODE_ENV !== 'production') {
    allowedOrigins.add(`http://localhost:${port}`);
    allowedOrigins.add(`http://127.0.0.1:${port}`);
    allowedOrigins.add('http://localhost:3000');
    allowedOrigins.add('http://127.0.0.1:3000');
  }

  // CORS com allowlist explÃ­cita. Origens desconhecidas nÃ£o recebem permissÃ£o CORS.
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const normalized = normalizeOrigin(origin);
      return callback(null, Boolean(normalized && allowedOrigins.has(normalized)));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'HX-Request', 'HX-Trigger', 'HX-Target'],
    maxAge: 600,
  });

  // ProteÃ§Ã£o CSRF por Fetch Metadata + Origin para mÃ©todos que alteram estado.
  // RequisiÃ§Ãµes nÃ£o-browser sem Origin/Sec-Fetch-Site continuam compatÃ­veis.
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase())) return next();

    const originHeader = request.get('origin');
    const origin = normalizeOrigin(originHeader);
    const fetchSite = (request.get('sec-fetch-site') || '').toLowerCase();
    const requestOrigin = normalizeOrigin(`${request.protocol}://${request.get('host') || ''}`);
    const explicitlyTrusted = Boolean(origin && allowedOrigins.has(origin));
    const sameOrigin = Boolean(origin && requestOrigin && origin === requestOrigin);

    if (fetchSite === 'cross-site' && !explicitlyTrusted) {
      return response.status(403).json({ statusCode: 403, message: 'RequisiÃ§Ã£o bloqueada pela proteÃ§Ã£o CSRF.' });
    }
    if (fetchSite && !['same-origin', 'none'].includes(fetchSite) && !explicitlyTrusted && !sameOrigin) {
      return response.status(403).json({ statusCode: 403, message: 'RequisiÃ§Ã£o bloqueada pela proteÃ§Ã£o CSRF.' });
    }
    if (originHeader && !sameOrigin && !explicitlyTrusted) {
      return response.status(403).json({ statusCode: 403, message: 'Origem nÃ£o autorizada pela proteÃ§Ã£o CSRF.' });
    }
    return next();
  });

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }));

  app.setBaseViewsDir(join(process.cwd(), 'web', 'views'));
  app.setViewEngine('hbs');

  // Expor somente os diretÃ³rios pÃºblicos necessÃ¡rios. Nunca publicar process.cwd().
  app.useStaticAssets(join(process.cwd(), 'web', 'shared'));
  app.useStaticAssets(join(process.cwd(), 'web'), { prefix: '/web/' });
  const assetsDirectory = join(process.cwd(), 'assets');
  if (existsSync(assetsDirectory)) app.useStaticAssets(assetsDirectory, { prefix: '/assets/' });

  // A pÃ¡gina inicial Ã© entregue explicitamente, sem expor package.json, src/, .env,
  // prisma/, storage/ ou backups por meio de um diretÃ³rio estÃ¡tico amplo.
  const expressApp = app.getHttpAdapter().getInstance();
  const sendIndex = (_request: Request, response: Response, next: NextFunction) => {
    response.sendFile(join(process.cwd(), 'index.html'), (error?: Error) => {
      if (error) next(error);
    });
  };
  expressApp.get('/', sendIndex);
  expressApp.get('/index.html', sendIndex);

  await app.listen(port);
  console.log(`SIGE IFCE executando em http://localhost:${port}`);
}

bootstrap();