import {
  beforeEach,
  describe,
  expect,
  it,
} from '@jest/globals';

import {
  ActionStatus,
  RegistrationStatus,
} from '../../generated/prisma/client';

import { RegistrationsService } from './registrations.service';

type FakeAction = {
  id: string;
  capacity: number;
  status: ActionStatus;
};

type FakeRegistration = {
  id: string;
  userId: string;
  actionId: string;
  status: RegistrationStatus;
  createdAt: Date;
  updatedAt: Date;
};

type FakeTx = {
  $queryRaw: (...args: unknown[]) => Promise<unknown>;
  action: {
    findUnique: (...args: unknown[]) => Promise<FakeAction | null>;
  };
  registration: {
    findUnique: (
      ...args: unknown[]
    ) => Promise<
      { id: string; status: RegistrationStatus } | null
    >;
    count: (...args: unknown[]) => Promise<number>;
    create: (...args: unknown[]) => Promise<FakeRegistration>;
  };
};

type FakePrisma = {
  $transaction: (
    callback: (client: FakeTx) => Promise<unknown>,
    options?: unknown,
  ) => Promise<unknown>;
};

describe('RegistrationsService', () => {
  let service: RegistrationsService;

  let action: FakeAction;
  let existingRegistration:
    | { id: string; status: RegistrationStatus }
    | null;

  let activeRegistrations: number;

  let createdRegistration: FakeRegistration;

  let createCalls: number;
  let countCalls: number;
  let transactionCalls: number;

  let queryRawCalls: number;

  let createError: unknown;
  let transactionError: unknown;

  let tx: FakeTx;
  let prisma: FakePrisma;

  beforeEach(() => {
    action = {
      id: 'action-1',
      capacity: 2,
      status: ActionStatus.ATIVA,
    };

    existingRegistration = null;
    activeRegistrations = 0;

    createdRegistration = {
      id: 'registration-1',
      userId: 'user-1',
      actionId: 'action-1',
      status: RegistrationStatus.ACTIVE,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    createCalls = 0;
    countCalls = 0;
    transactionCalls = 0;
    queryRawCalls = 0;

    createError = null;
    transactionError = null;

    tx = {
      $queryRaw: async (..._args: unknown[]) => {
        queryRawCalls += 1;
        return [{ id: 'action-1' }];
      },

      action: {
        findUnique: async (
          ..._args: unknown[]
        ): Promise<FakeAction | null> => {
          return action;
        },
      },

      registration: {
        findUnique: async (
          ..._args: unknown[]
        ): Promise<
          { id: string; status: RegistrationStatus } | null
        > => {
          return existingRegistration;
        },

        count: async (..._args: unknown[]): Promise<number> => {
          countCalls += 1;
          return activeRegistrations;
        },

        create: async (
          ..._args: unknown[]
        ): Promise<FakeRegistration> => {
          createCalls += 1;

          if (createError) {
            throw createError;
          }

          return createdRegistration;
        },
      },
    };

    prisma = {
      $transaction: async (
        callback: (client: FakeTx) => Promise<unknown>,
        _options?: unknown,
      ): Promise<unknown> => {
        transactionCalls += 1;

        if (transactionError) {
          const error = transactionError;
          transactionError = null;
          throw error;
        }

        return callback(tx);
      },
    };

    service = new RegistrationsService(
      prisma as never,
    );
  });

  it('deve criar uma inscri\u00e7\u00e3o v\u00e1lida', async () => {
    const result = await service.createForAction(
      'user-1',
      'action-1',
    );

    expect(result).toMatchObject({
      id: 'registration-1',
      userId: 'user-1',
      actionId: 'action-1',
      status: RegistrationStatus.ACTIVE,
    });

    expect(transactionCalls).toBe(1);
    expect(queryRawCalls).toBe(1);
    expect(countCalls).toBe(1);
    expect(createCalls).toBe(1);
  });

  it('deve rejeitar a\u00e7\u00e3o inexistente', async () => {
    action = null as never;

    tx.action.findUnique = async (
      ..._args: unknown[]
    ): Promise<FakeAction | null> => null;

    await expect(
      service.createForAction(
        'user-1',
        'action-404',
      ),
    ).rejects.toThrow('A\u00e7\u00e3o n\u00e3o encontrada.');

    expect(createCalls).toBe(0);
  });

  it('deve rejeitar a\u00e7\u00e3o encerrada', async () => {
    action.status = ActionStatus.ENCERRADA;

    await expect(
      service.createForAction(
        'user-1',
        'action-1',
      ),
    ).rejects.toThrow(
      'A a\u00e7\u00e3o n\u00e3o est\u00e1 dispon\u00edvel para inscri\u00e7\u00f5es.',
    );

    expect(createCalls).toBe(0);
  });

  it('deve rejeitar a\u00e7\u00e3o cancelada', async () => {
    action.status = ActionStatus.CANCELADA;

    await expect(
      service.createForAction(
        'user-1',
        'action-1',
      ),
    ).rejects.toThrow(
      'A a\u00e7\u00e3o n\u00e3o est\u00e1 dispon\u00edvel para inscri\u00e7\u00f5es.',
    );

    expect(createCalls).toBe(0);
  });

  it('deve rejeitar inscri\u00e7\u00e3o duplicada', async () => {
    existingRegistration = {
      id: 'existing-registration',
      status: RegistrationStatus.ACTIVE,
    };

    await expect(
      service.createForAction(
        'user-1',
        'action-1',
      ),
    ).rejects.toThrow(
      'Usu\u00e1rio j\u00e1 possui uma inscri\u00e7\u00e3o para esta a\u00e7\u00e3o.',
    );

    expect(createCalls).toBe(0);
  });

  it('deve rejeitar capacidade esgotada', async () => {
    action.capacity = 1;
    activeRegistrations = 1;

    await expect(
      service.createForAction(
        'user-1',
        'action-1',
      ),
    ).rejects.toThrow(
      'N\u00e3o h\u00e1 vagas dispon\u00edveis para esta a\u00e7\u00e3o.',
    );

    expect(createCalls).toBe(0);
  });

  it('deve permitir inscri\u00e7\u00e3o quando houver vaga', async () => {
    action.capacity = 10;
    activeRegistrations = 9;

    const result = await service.createForAction(
      'user-1',
      'action-1',
    );

    expect(result.id).toBe('registration-1');
    expect(countCalls).toBe(1);
    expect(createCalls).toBe(1);
  });

  it('deve converter P2002 em conflito de duplicidade', async () => {
    createError = {
      code: 'P2002',
    };

    await expect(
      service.createForAction(
        'user-1',
        'action-1',
      ),
    ).rejects.toThrow(
      'Usu\u00e1rio j\u00e1 possui uma inscri\u00e7\u00e3o para esta a\u00e7\u00e3o.',
    );

    expect(createCalls).toBe(1);
  });

  it('deve repetir a transa\u00e7\u00e3o ap\u00f3s P2034', async () => {
    let attempts = 0;

    prisma.$transaction = async (
      callback: (client: FakeTx) => Promise<unknown>,
      _options?: unknown,
    ): Promise<unknown> => {
      attempts += 1;

      if (attempts === 1) {
        throw {
          code: 'P2034',
        };
      }

      return callback(tx);
    };

    const result = await service.createForAction(
      'user-1',
      'action-1',
    );

    expect(result.id).toBe('registration-1');
    expect(attempts).toBe(2);
  });

  it('deve rejeitar capacidade inv\u00e1lida', async () => {
    action.capacity = -1;

    await expect(
      service.createForAction(
        'user-1',
        'action-1',
      ),
    ).rejects.toThrow(
      'A\u00e7\u00e3o possui capacidade inv\u00e1lida.',
    );

    expect(createCalls).toBe(0);
  });

  it('deve executar a verifica\u00e7\u00e3o transacional da a\u00e7\u00e3o antes da cria\u00e7\u00e3o', async () => {
    const result = await service.createForAction(
      'user-1',
      'action-1',
    );

    expect(result.status).toBe(
      RegistrationStatus.ACTIVE,
    );

    expect(transactionCalls).toBe(1);
    expect(queryRawCalls).toBe(1);
    expect(countCalls).toBe(1);
    expect(createCalls).toBe(1);
  });
});