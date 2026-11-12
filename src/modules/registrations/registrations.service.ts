import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  ActionStatus,
  EventStatus,
  Prisma,
  RegistrationStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { RegistrationQueryDto } from './dto/registration-query.dto';
import { isTransactionConflict } from '../../common/transaction-conflict';

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

  /** Histórico paginado e pesquisável, sempre limitado ao titular do token. */
  async listMine(userId: string, query: RegistrationQueryDto) {
    if (!userId?.trim()) {
      throw new BadRequestException('Usuário autenticado não identificado.');
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const search = query.search?.trim();
    const where: Prisma.RegistrationWhereInput = { userId };
    if (query.status) where.status = query.status;
    if (query.eventId) where.action = { eventId: query.eventId };
    if (search) {
      where.AND = [{ OR: [
        { action: { title: { contains: search, mode: 'insensitive' } } },
        { action: { event: { title: { contains: search, mode: 'insensitive' } } } },
      ] }];
    }

    const [data, total, counts, eventRows] = await Promise.all([
      this.prisma.registration.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, actionId: true, status: true,
          createdAt: true, updatedAt: true, cancelledAt: true,
          presence: { select: { id: true, registeredAt: true } },
          certificate: { select: { id: true } },
          action: { select: {
            id: true, title: true, startDate: true, endDate: true,
            location: true, status: true,
            event: { select: { id: true, title: true, status: true } },
          } },
        },
      }),
      this.prisma.registration.count({ where }),
      this.prisma.registration.groupBy({
        by: ['status'], where: { userId }, _count: { _all: true },
      }),
      this.prisma.registration.findMany({
        where: { userId },
        select: { action: { select: { event: { select: { id: true, title: true } } } } },
      }),
    ]);

    const summary = { active: 0, cancelled: 0, total: 0 };
    for (const entry of counts) {
      if (entry.status === RegistrationStatus.ACTIVE) summary.active = entry._count._all;
      if (entry.status === RegistrationStatus.CANCELLED) summary.cancelled = entry._count._all;
    }
    summary.total = summary.active + summary.cancelled;

    const eventMap = new Map<string, string>();
    for (const row of eventRows) {
      eventMap.set(row.action.event.id, row.action.event.title);
    }
    const events = Array.from(eventMap, ([id, title]) => ({ id, title }))
      .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));

    return { data, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)), summary, events };
  }

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
            // Ordem global para novas inscricoes: Event -> Action.
            // Serializa a capacidade de participantes unicos entre acoes distintas.
            const locatedAction = await tx.action.findUnique({ where: { id: actionId }, select: { eventId: true } });
            if (!locatedAction) throw new NotFoundException('A\u00e7\u00e3o n\u00e3o encontrada.');
            await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${locatedAction.eventId} FOR UPDATE`;
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
                startDate: true,
                endDate: true,
                event: {
                  select: { status: true, endDate: true, totalCapacity: true, registrationStartDate: true, registrationEndDate: true },
                },
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

            // A checagem ocorre dentro da transacao que ja bloqueou a Action.
            // Nao permitir inscricoes em eventos indisponiveis ou acoes iniciadas.
            if (![EventStatus.PUBLICADO, EventStatus.EM_ANDAMENTO].includes(action.event.status as never)) {
              throw new ConflictException(
                'O evento nao esta publicado para inscricoes.',
              );
            }

            const now = new Date();
            if ((action.event.registrationStartDate && now < action.event.registrationStartDate) ||
              (action.event.registrationEndDate && now >= action.event.registrationEndDate)) {
              throw new ConflictException('Fora da janela de inscricoes do evento.');
            }
            if (action.event.totalCapacity != null) {
              const participants = await tx.registration.findMany({
                where: { action: { eventId: locatedAction.eventId }, status: RegistrationStatus.ACTIVE },
                select: { userId: true }, distinct: ['userId'],
              });
              if (!participants.some((participant) => participant.userId === userId) && participants.length >= action.event.totalCapacity) {
                throw new ConflictException('Nao ha vagas para novos participantes neste evento.');
              }
            }
            if (
              action.startDate <= now ||
              action.endDate <= now ||
              action.event.endDate <= now
            ) {
              throw new ConflictException(
                'O prazo de inscricao desta acao ja terminou.',
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
        if (isTransactionConflict(error) && attempt < this.maxTransactionRetries - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, 50 * 2 ** attempt),
          );
          continue;
        }

        if (isTransactionConflict(error)) throw new ConflictException('Conflito concorrente. Tente novamente.');
        throw error;
      }
    }

    throw new ConflictException('N\u00e3o foi poss\u00edvel concluir a inscri\u00e7\u00e3o.');
  }
  /**
   * Cancela a inscricao do proprio participante antes do inicio da acao.
   * Inscricoes com presenca registrada ou certificado emitido nao podem ser canceladas.
   */
  async cancelForAction(userId: string, actionId: string): Promise<RegistrationResult> {
    if (!userId || !actionId) {
      throw new BadRequestException('Usuario e acao sao obrigatorios.');
    }

    for (let attempt = 0; attempt < this.maxTransactionRetries; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const located = await tx.registration.findUnique({
            where: { userId_actionId: { userId, actionId } },
            select: { id: true },
          });
          if (!located) {
            throw new NotFoundException('Inscricao nao encontrada para esta acao.');
          }

          // Exatamente a mesma linha bloqueada pelo registro de presenca.
          const locked = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id" FROM "Registration" WHERE "id" = ${located.id} FOR UPDATE
          `;
          if (locked.length !== 1) {
            throw new NotFoundException('Inscricao nao encontrada para esta acao.');
          }

          // Releitura apos lock: nunca usar estado observado antes da transacao.
          const registration = await tx.registration.findUnique({
            where: { id: located.id },
            include: {
              action: { select: { id: true, status: true, startDate: true } },
              presence: { select: { id: true } },
              certificate: { select: { id: true } },
            },
          });
          if (!registration || registration.userId !== userId || registration.actionId !== actionId) {
            throw new NotFoundException('Inscricao nao encontrada para esta acao.');
          }
          if (registration.status !== RegistrationStatus.ACTIVE) {
            throw new ConflictException('A inscricao nao esta ativa.');
          }
          if (registration.action.status !== ActionStatus.ATIVA) {
            throw new ConflictException('A acao nao esta disponivel para cancelamento.');
          }
          const millisecondsBeforeStart = registration.action.startDate.getTime() - Date.now();
          if (millisecondsBeforeStart <= 0) {
            throw new ConflictException('Nao e possivel cancelar a inscricao apos o inicio da acao.');
          }
          if (millisecondsBeforeStart < 24 * 60 * 60 * 1000) {
            throw new ConflictException('O cancelamento exige antecedencia minima de 24 horas do inicio da acao.');
          }
          if (registration.presence) {
            throw new ConflictException('Nao e possivel cancelar uma inscricao com presenca registrada.');
          }
          if (registration.certificate) {
            throw new ConflictException('Nao e possivel cancelar uma inscricao com certificado emitido.');
          }

          return tx.registration.update({
            where: { id: registration.id },
            data: { status: RegistrationStatus.CANCELLED, cancelledAt: new Date() },
            select: {
              id: true, userId: true, actionId: true, status: true,
              createdAt: true, updatedAt: true, cancelledAt: true,
            },
          });
        }, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5000,
          timeout: 10000,
        });
      } catch (error) {
        if (isTransactionConflict(error) && attempt + 1 < this.maxTransactionRetries) {
          await new Promise((resolve) => setTimeout(resolve, 50 * 2 ** attempt));
          continue;
        }
        if (isTransactionConflict(error)) throw new ConflictException('Conflito concorrente. Tente novamente.');
        throw error;
      }
    }
    throw new ConflictException('Nao foi possivel cancelar esta inscricao.');
  }
}
