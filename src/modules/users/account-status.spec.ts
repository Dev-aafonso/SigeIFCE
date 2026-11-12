import { jest } from '@jest/globals';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from '../auth/auth.service';
import { UsersService } from './users.service';

describe('account status and last access', () => {
  it('rejects a disabled account after verifying its password', async () => {
    const password = await argon2.hash('secret');
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'u', password, isActive: false }), update: jest.fn() } };
    const service = new AuthService(prisma as never, {} as never);
    await expect(service.login({ email: 'a@example.com', password: 'secret' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
  it('records successful login', async () => {
    const password = await argon2.hash('secret');
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'u', email: 'a@example.com', role: 'ALUNO', sessionVersion: 0, password, isActive: true }), update: jest.fn() } };
    const service = new AuthService(prisma as never, { signAsync: jest.fn().mockResolvedValue('token') } as never);
    await service.login({ email: 'a@example.com', password: 'secret' });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u' }, data: { lastAccessAt: expect.any(Date) } });
  });
  it('prevents an administrator from disabling their own account', async () => {
    const service = new UsersService({} as never);
    await expect(service.updateStatus('u', false, 'u')).rejects.toBeInstanceOf(BadRequestException);
  });
});

