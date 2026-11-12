import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RegistrationStatus, UserRole } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreatePresenceDto } from './dto/create-presence.dto';
import { isTransactionConflict } from '../common/transaction-conflict';

export type PresencePrincipal = { id: string; role: UserRole };

@Injectable()
export class PresenceService {
  constructor(private readonly prisma: PrismaService) {}

  private assertManager(requester: PresencePrincipal): void {
    if (!requester.id) throw new ForbiddenException('UsuÃ¡rio autenticado sem identificador.');
    if (requester.role !== UserRole.ADMIN && requester.role !== UserRole.ORGANIZADOR && requester.role !== UserRole.PROFESSOR) {
      throw new ForbiddenException('Perfil sem permissÃ£o para administrar presenÃ§as.');
    }
  }

  private assertOrganizerScope(organizerId: string, requester: PresencePrincipal): void {
    this.assertManager(requester);
    if (requester.role !== UserRole.ADMIN && organizerId !== requester.id) {
      throw new ForbiddenException('VocÃª nÃ£o tem permissÃ£o para consultar ou alterar presenÃ§as desta aÃ§Ã£o.');
    }
  }

  private async assertActionAccess(actionId: string, requester: PresencePrincipal): Promise<void> {
    this.assertManager(requester);
    const action = await this.prisma.action.findUnique({
      where: { id: actionId },
      select: { id: true, event: { select: { organizerId: true } } },
    });
    if (!action) throw new NotFoundException('AÃ§Ã£o nÃ£o encontrada.');
    this.assertOrganizerScope(action.event.organizerId, requester);
  }

  async create(dto: CreatePresenceDto, requester: PresencePrincipal) {
    this.assertManager(requester);
    if (!dto.registrationId) throw new BadRequestException('Inscricao obrigatoria.');

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          // O cancelamento de inscricao utiliza o MESMO lock.
          const locked = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id" FROM "Registration" WHERE "id" = ${dto.registrationId} FOR UPDATE
          `;
          if (locked.length !== 1) throw new NotFoundException('Inscricao nao encontrada.');

          const registration = await tx.registration.findUnique({
            where: { id: dto.registrationId },
            include: {
              action: { include: { event: { select: { organizerId: true } } } },
              presence: true,
            },
          });
          if (!registration) throw new NotFoundException('Inscricao nao encontrada.');
          this.assertOrganizerScope(registration.action.event.organizerId, requester);
          if (registration.status !== RegistrationStatus.ACTIVE) {
            throw new BadRequestException('A inscricao nao esta ativa.');
          }
          if (registration.presence) {
            throw new ConflictException('A presenca deste participante ja foi registrada.');
          }

          // Validar depois do lock e da releitura, inclusive para ADMIN.
          // Sem limite retroativo: manter o lancamento posterior para acoes legadas.
          const startTime = registration.action.startDate.getTime();
          if (!Number.isFinite(startTime) || startTime > Date.now()) {
            throw new BadRequestException('A presenca so pode ser registrada a partir do inicio da acao.');
          }

          return tx.presence.create({
            data: { registrationId: dto.registrationId, responsibleId: requester.id },
            include: {
              registration: {
                include: {
                  user: { select: { id: true, name: true, email: true, enrollmentNumber: true, course: true, campus: true, role: true, isActive: true } },
                  action: true,
                },
              },
            },
          });
        }, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5000,
          timeout: 10000,
        });
      } catch (error) {
        if (isTransactionConflict(error)) {
          if (attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, 50 * 2 ** attempt));
            continue;
          }
          throw new ConflictException('Conflito concorrente. Tente registrar a presenca novamente.');
        }
        if (typeof error === 'object' && error !== null && 'code' in error) {
          const code = (error as { code?: unknown }).code;
          if (code === 'P2002') {
            throw new ConflictException('A presenca deste participante ja foi registrada.');
          }
          if (code === 'P2034' && attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, 50 * 2 ** attempt));
            continue;
          }
        }
        throw error;
      }
    }
    throw new ConflictException('Nao foi possivel registrar a presenca.');
  }

  async findByRegistration(registrationId: string, requester: PresencePrincipal) {
    this.assertManager(requester);
    const registration = await this.prisma.registration.findUnique({
      where: { id: registrationId },
      select: { id: true, actionId: true },
    });
    if (!registration) throw new NotFoundException('InscriÃ§Ã£o nÃ£o encontrada.');
    await this.assertActionAccess(registration.actionId, requester);

    const presence = await this.prisma.presence.findUnique({
      where: { registrationId },
      include: {
        registration: {
          include: {
            user: { select: { id: true, name: true, email: true, enrollmentNumber: true, course: true, campus: true, role: true, isActive: true } },
            action: true,
          },
        },
      },
    });
    if (!presence) throw new NotFoundException('PresenÃ§a nÃ£o encontrada.');
    return presence;
  }

  async findParticipantsByAction(actionId: string, requester: PresencePrincipal) {
    await this.assertActionAccess(actionId, requester);
    const registrations = await this.prisma.registration.findMany({
      where: { actionId, status: 'ACTIVE' },
      include: { user: { select: { id: true, name: true, email: true, enrollmentNumber: true, course: true, campus: true, role: true, isActive: true } }, presence: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return registrations.map((registration) => ({
      registrationId: registration.id,
      createdAt: registration.createdAt,
      user: registration.user,
      present: registration.presence !== null,
      presence: registration.presence,
    }));
  }

  async findPresentByAction(actionId: string, requester: PresencePrincipal) {
    await this.assertActionAccess(actionId, requester);
    return this.prisma.registration.findMany({
      where: { actionId, status: 'ACTIVE', presence: { isNot: null } },
      include: { user: { select: { id: true, name: true, email: true, enrollmentNumber: true, course: true, campus: true, role: true, isActive: true } }, presence: true },
    });
  }

  async findAbsentByAction(actionId: string, requester: PresencePrincipal) {
    await this.assertActionAccess(actionId, requester);
    return this.prisma.registration.findMany({
      where: { actionId, status: 'ACTIVE', presence: null },
      include: { user: { select: { id: true, name: true, email: true, enrollmentNumber: true, course: true, campus: true, role: true, isActive: true } } },
    });
  }
}
