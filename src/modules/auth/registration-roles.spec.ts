import { jest } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UserRole } from '../../generated/prisma/client';

describe('cadastro de perfis', () => {
  const original = process.env.SIGE_MANAGER_CODE;
  const base = {name:'Pessoa teste',email:'teste@example.test',password:'Senha123!',passwordConfirmation:'Senha123!'};
  afterEach(() => { if (original === undefined) delete process.env.SIGE_MANAGER_CODE; else process.env.SIGE_MANAGER_CODE = original; });
  function create() {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn(async ({data}: any) => ({...data,id:'u1',sessionVersion:0})) } };
    const service = new AuthService(prisma as never, {signAsync: jest.fn().mockResolvedValue('token')} as never);
    return {prisma,service};
  }
  it('cria aluno por padrão e professor quando selecionado', async () => {
    const {service}=create();
    expect((await service.register(base)).user.role).toBe(UserRole.ALUNO);
    expect((await service.register({...base,role:'PROFESSOR'})).user.role).toBe(UserRole.PROFESSOR);
  });
  it('rejeita gestor sem código válido antes de criar usuário', async () => {
    process.env.SIGE_MANAGER_CODE='codigo-de-teste'; const {service,prisma}=create();
    await expect(service.register({...base,role:'ADMIN',managerCode:'invalido'})).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
  it('cria gestor administrativo somente com código configurado e válido', async () => {
    process.env.SIGE_MANAGER_CODE='codigo-de-teste';const {service}=create();
    expect((await service.register({...base,role:'ADMIN',managerCode:'codigo-de-teste'})).user.role).toBe(UserRole.ADMIN);
  });
  it('não cria gestor quando o código não foi configurado', async () => {
    delete process.env.SIGE_MANAGER_CODE;const {service}=create();
    await expect(service.register({...base,role:'ADMIN',managerCode:'qualquer'})).rejects.toBeInstanceOf(ForbiddenException);
  });
});
