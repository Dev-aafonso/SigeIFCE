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

  // Helmet: cabeÃƒÂ§alhos de seguranÃƒÂ§a. A polÃƒÂ­tica CSP permite inline legado
  // temporariamente para preservar a SPA; remova unsafe-inline apÃƒÂ³s migrar para nonce/hash.
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
    // HSTS sÃƒÂ³ deve ser emitido em implantaÃƒÂ§ÃƒÂ£o HTTPS.
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

  // CORS com allowlist explÃƒÂ­cita. Origens desconhecidas nÃƒÂ£o recebem permissÃƒÂ£o CORS.
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

  // ProteÃƒÂ§ÃƒÂ£o CSRF por Fetch Metadata + Origin para mÃƒÂ©todos que alteram estado.
  // RequisiÃƒÂ§ÃƒÂµes nÃƒÂ£o-browser sem Origin/Sec-Fetch-Site continuam compatÃƒÂ­veis.
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase())) return next();

    const originHeader = request.get('origin');
    const origin = normalizeOrigin(originHeader);
    const fetchSite = (request.get('sec-fetch-site') || '').toLowerCase();
    const requestOrigin = normalizeOrigin(`${request.protocol}://${request.get('host') || ''}`);
    const explicitlyTrusted = Boolean(origin && allowedOrigins.has(origin));
    const sameOrigin = Boolean(origin && requestOrigin && origin === requestOrigin);

    if (fetchSite === 'cross-site' && !explicitlyTrusted) {
      return response.status(403).json({ statusCode: 403, message: 'RequisiÃƒÂ§ÃƒÂ£o bloqueada pela proteÃƒÂ§ÃƒÂ£o CSRF.' });
    }
    if (fetchSite && !['same-origin', 'none'].includes(fetchSite) && !explicitlyTrusted && !sameOrigin) {
      return response.status(403).json({ statusCode: 403, message: 'RequisiÃƒÂ§ÃƒÂ£o bloqueada pela proteÃƒÂ§ÃƒÂ£o CSRF.' });
    }
    if (originHeader && !sameOrigin && !explicitlyTrusted) {
      return response.status(403).json({ statusCode: 403, message: 'Origem nÃƒÂ£o autorizada pela proteÃƒÂ§ÃƒÂ£o CSRF.' });
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

  // Expor somente os diretÃƒÂ³rios pÃƒÂºblicos necessÃƒÂ¡rios. Nunca publicar process.cwd().
  app.useStaticAssets(join(process.cwd(), 'web', 'shared'));
  app.useStaticAssets(join(process.cwd(), 'web'), { prefix: '/web/' });
  const assetsDirectory = join(process.cwd(), 'assets');
  if (existsSync(assetsDirectory)) app.useStaticAssets(assetsDirectory, { prefix: '/assets/' });

  // A pÃƒÂ¡gina inicial ÃƒÂ© entregue explicitamente, sem expor package.json, src/, .env,
  // prisma/, storage/ ou backups por meio de um diretÃƒÂ³rio estÃƒÂ¡tico amplo.
  const expressApp = app.getHttpAdapter().getInstance();
  const sendIndex = (_request: Request, response: Response, next: NextFunction) => {
    response.sendFile(join(process.cwd(), 'index.html'), (error?: Error) => {
      if (error) next(error);
    });
  };
  expressApp.get('/', sendIndex);
  expressApp.get('/index.html', sendIndex);
  expressApp.get('/registrations', sendIndex);

  await app.listen(port);
  console.log(`SIGE IFCE executando em http://localhost:${port}`);
}

bootstrap();
