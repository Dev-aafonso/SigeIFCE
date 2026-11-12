import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const token =
      request.cookies?.access_token ??
      request.cookies?.token ??
      this.extractBearerToken(request.headers?.authorization);

    if (!token) {
      throw new UnauthorizedException('Token nÃ£o informado.');
    }

    try {
      const payload = await this.jwtService.verifyAsync<{
        sub?: unknown;
        sv?: unknown;
        role?: unknown;
        email?: unknown;
      }>(token);
      if (typeof payload.sub !== 'string' || !payload.sub ||
          typeof payload.sv !== 'number' || !Number.isInteger(payload.sv)) {
        throw new UnauthorizedException('Sessao invalida. Faca login novamente.');
      }
      const current = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, role: true, sessionVersion: true, isActive: true },
      });
      if (!current || current.isActive === false || current.sessionVersion !== payload.sv ||
          current.role !== payload.role) {
        throw new UnauthorizedException('Sessao revogada ou perfil alterado.');
      }
      // O perfil e o email nao sao aceitos diretamente do JWT antigo.
      request.user = { sub: current.id, role: current.role, email: current.email };
      return true;
    } catch {
      throw new UnauthorizedException('Token invÃ¡lido ou expirado.');
    }
  }

  private extractBearerToken(authorization?: string): string | undefined {
    if (!authorization?.startsWith('Bearer ')) return undefined;
    return authorization.slice(7).trim() || undefined;
  }
}