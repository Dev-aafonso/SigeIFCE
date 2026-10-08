import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  ActionStatus,
  Prisma,
  RegistrationStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';

type RegistrationResult = {
  id: string;
  userId: string;
  actionId: string;
  status: RegistrationStatus;
  createdAt: Date;
  updatedAt: Date;
};

function isPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

@Injectable()
export class RegistrationsService {
  private readonly maxTransactionRetries = 3;

  constructor(private readonly prisma: PrismaService) {}

  async createForAction(
    userId: string,
    actionId: string,
  ): Promise<RegistrationResult> {
    if (!userId || !actionId) {
      throw new BadRequestException('Usu\u00e1rio e a\u00e7\u00e3o s\u00e3o obrigat\u00f3rios.');
    }

    for (let attempt = 0; attempt < this.maxTransactionRetries; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            // Lock da linha da Action: serializa as inscri\u00e7\u00f5es concorrentes
            // da mesma a\u00e7\u00e3o e protege a checagem de capacidade.
            const lockedActionRows = await tx.$queryRaw<Array<{ id: string }>>`
              SELECT "id"
              FROM "Action"
              WHERE "id" = ${actionId}
              FOR UPDATE
            `;

            if (lockedActionRows.length === 0) {
              throw new NotFoundException('A\u00e7\u00e3o n\u00e3o encontrada.');
            }

            const action = await tx.action.findUnique({
              where: { id: actionId },
              select: {
                id: true,
                capacity: true,
                status: true,
              },
            });

            if (!action) {
              throw new NotFoundException('A\u00e7\u00e3o n\u00e3o encontrada.');
            }

            if (action.status !== ActionStatus.ATIVA) {
              throw new ConflictException(
                'A a\u00e7\u00e3o n\u00e3o est\u00e1 dispon\u00edvel para inscri\u00e7\u00f5es.',
              );
            }

            if (!Number.isInteger(action.capacity) || action.capacity < 0) {
              throw new ConflictException('A\u00e7\u00e3o possui capacidade inv\u00e1lida.');
            }

            const existingRegistration = await tx.registration.findUnique({
              where: {
                userId_actionId: {
                  userId,
                  actionId,
                },
              },
              select: {
                id: true,
                status: true,
              },
            });

            if (existingRegistration) {
              throw new ConflictException(
                'Usu\u00e1rio j\u00e1 possui uma inscri\u00e7\u00e3o para esta a\u00e7\u00e3o.',
              );
            }

            const activeRegistrations = await tx.registration.count({
              where: {
                actionId,
                status: RegistrationStatus.ACTIVE,
              },
            });

            if (activeRegistrations >= action.capacity) {
              throw new ConflictException(
                'N\u00e3o h\u00e1 vagas dispon\u00edveis para esta a\u00e7\u00e3o.',
              );
            }

            try {
              return await tx.registration.create({
                data: {
                  userId,
                  actionId,
                  status: RegistrationStatus.ACTIVE,
                },
                select: {
                  id: true,
                  userId: true,
                  actionId: true,
                  status: true,
                  createdAt: true,
                  updatedAt: true,
                },
              });
            } catch (error) {
              if (isPrismaErrorCode(error, 'P2002')) {
                throw new ConflictException(
                  'Usu\u00e1rio j\u00e1 possui uma inscri\u00e7\u00e3o para esta a\u00e7\u00e3o.',
                );
              }

              throw error;
            }
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 5000,
            timeout: 10000,
          },
        );
      } catch (error) {
        if (isPrismaErrorCode(error, 'P2034') && attempt < this.maxTransactionRetries - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, 50 * 2 ** attempt),
          );
          continue;
        }

        throw error;
      }
    }

    throw new ConflictException('N\u00e3o foi poss\u00edvel concluir a inscri\u00e7\u00e3o.');
  }
}
