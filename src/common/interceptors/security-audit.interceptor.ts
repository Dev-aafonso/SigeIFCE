import { HttpException, Injectable, Logger, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

type AuditRequest = Request & {
  user?: { sub?: string; id?: string; role?: string };
  route?: { path?: string };
};

@Injectable()
export class SecurityAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('SecurityAudit');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<AuditRequest>();
    const response = http.getResponse<Response>();
    const method = request.method.toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return next.handle();

    const path = request.route?.path
      ? `${request.baseUrl || ''}${request.route.path}`
      : (request.path || '/').replace(/\?.*$/, '');
    if (path.startsWith('/auth/login') || path.startsWith('/auth/register')) return next.handle();

    const started = Date.now();
    const record = (outcome: 'success' | 'failure', error?: unknown) => {
      const statusCode = outcome === 'failure'
        ? (error instanceof HttpException ? error.getStatus() : 500)
        : response.statusCode;
      this.logger.log(JSON.stringify({
        event: 'critical_operation',
        timestamp: new Date().toISOString(),
        method,
        route: path,
        actorId: request.user?.sub ?? request.user?.id ?? null,
        actorRole: request.user?.role ?? null,
        outcome,
        statusCode,
        durationMs: Date.now() - started,
      }));
    };

    return next.handle().pipe(tap({ next: () => record('success'), error: (error: unknown) => record('failure', error) }));
  }
}