import { describe, expect, it } from '@jest/globals';
import { RegistrationsController } from './registrations.controller';
import { RegistrationQueryDto } from './dto/registration-query.dto';

/** Garante que nenhum identificador informado pelo cliente é usado como titular. */
describe('RegistrationsController.listMine', () => {
  const calls: string[] = [];
  const serviceMock = {
    listMine: (userId: string, _query: RegistrationQueryDto) => {
      calls.push(userId);
      return Promise.resolve({ data: [] });
    },
  };
  const controller = new RegistrationsController(serviceMock as never);

  it('consulta com o identificador sub fornecido pela sessão', async () => {
    calls.length = 0;
    await controller.listMine({ user: { sub: 'real-user' } } as never, new RegistrationQueryDto());
    expect(calls).toEqual(['real-user']);
  });

  it('recusa requisição sem usuário autenticado', () => {
    expect(() => controller.listMine({} as never, new RegistrationQueryDto())).toThrow();
  });
});
