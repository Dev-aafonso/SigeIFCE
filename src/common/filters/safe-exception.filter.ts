import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SafeExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : 500;
    const path = request.path || '/';

    let body: Record<string, unknown>;
    if (status >= 500) {
      body = { statusCode: status, message: 'Erro interno do servidor.' };
      const detail = exception instanceof Error ? exception.stack || exception.message : 'Erro desconhecido';
      this.logger.error(`${request.method} ${path} retornou HTTP ${status}`, detail);
    } else {
      const payload = isHttp ? exception.getResponse() : 'RequisiÃ§Ã£o invÃ¡lida.';
      body = typeof payload === 'string'
        ? { statusCode: status, message: payload }
        : { ...(payload as Record<string, unknown>), statusCode: status };
    }

    body.path = path;
    body.timestamp = new Date().toISOString();
    response.status(status).json(body);
  }
}