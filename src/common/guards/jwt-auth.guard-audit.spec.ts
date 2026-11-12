import { describe, expect, it, jest } from '@jest/globals';
import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard - sessao e perfis do banco', () => {
  function setup(current: { id: string; email: string; role: string; sessionVersion: number } | null, payload: object) {
    const jwt = { verifyAsync: jest.fn(async () => payload) };
    const reflector = { getAllAndOverride: jest.fn(() => false) };
    const prisma = { user: { findUnique: jest.fn(async () => current) } };
    const guard = new JwtAuthGuard(jwt as never, reflector as never, prisma as never);
    const request: { cookies: { access_token: string }; user?: unknown } = { cookies: { access_token: 'signed' } };
    const context = { getHandler: () => undefined, getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => request }) };
    return { guard, context, request, prisma };
  }
  const user = { id: 'u1', email: 'u@test.invalid', role: 'ALUNO', sessionVersion: 2 };

  it('aceita sessao atual e privilegios consultados no banco', async () => {
    const t = setup(user, { sub: 'u1', sv: 2, role: 'ALUNO' });
    await expect(t.guard.canActivate(t.context as never)).resolves.toBe(true);
    expect(t.request.user).toEqual({ sub: 'u1', role: 'ALUNO', email: user.email });
  });
  it('rejeita token apos logout ou troca de senha', async () => {
    const t = setup(user, { sub: 'u1', sv: 1, role: 'ALUNO' });
    await expect(t.guard.canActivate(t.context as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('rejeita token com perfil antigo', async () => {
    const t = setup(user, { sub: 'u1', sv: 2, role: 'ADMIN' });
    await expect(t.guard.canActivate(t.context as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('rejeita usuario removido', async () => {
    const t = setup(null, { sub: 'u1', sv: 2, role: 'ALUNO' });
    await expect(t.guard.canActivate(t.context as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('rejeita JWT legado sem versao', async () => {
    const t = setup(user, { sub: 'u1', role: 'ALUNO' });
    await expect(t.guard.canActivate(t.context as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
