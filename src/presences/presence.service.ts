import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreatePresenceDto } from './dto/create-presence.dto';

export type PresencePrincipal = { id: string; role: UserRole };

@Injectable()
export class PresenceService {
  constructor(private readonly prisma: PrismaService) {}

  private assertManager(requester: PresencePrincipal): void {
    if (!requester.id) throw new ForbiddenException('UsuÃ¡rio autenticado sem identificador.');
    if (requester.role !== UserRole.ADMIN && requester.role !== UserRole.ORGANIZADOR) {
      throw new ForbiddenException('Perfil sem permissÃ£o para administrar presenÃ§as.');
    }
  }

  private assertOrganizerScope(organizerId: string, requester: PresencePrincipal): void {
    this.assertManager(requester);
    if (requester.role === UserRole.ORGANIZADOR && organizerId !== requester.id) {
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
    const registration = await this.prisma.registration.findUnique({
      where: { id: dto.registrationId },
      include: {
        action: { include: { event: { select: { organizerId: true } } } },
        presence: true,
      },
    });
    if (!registration) throw new NotFoundException('InscriÃ§Ã£o nÃ£o encontrada.');
    this.assertOrganizerScope(registration.action.event.organizerId, requester);
    if (registration.status !== 'ACTIVE') throw new BadRequestException('A inscriÃ§Ã£o nÃ£o estÃ¡ ativa.');
    if (registration.presence) throw new ConflictException('A presenÃ§a deste participante jÃ¡ foi registrada.');

    return this.prisma.presence.create({
      data: { registrationId: dto.registrationId, responsibleId: requester.id },
      include: {
        registration: {
          include: {
            user: { select: { id: true, name: true, email: true } },
            action: true,
          },
        },
      },
    });
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
            user: { select: { id: true, name: true, email: true } },
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
      include: { user: { select: { id: true, name: true, email: true } }, presence: true },
    });
    return registrations.map((registration) => ({
      registrationId: registration.id,
      user: registration.user,
      present: registration.presence !== null,
      presence: registration.presence,
    }));
  }

  async findPresentByAction(actionId: string, requester: PresencePrincipal) {
    await this.assertActionAccess(actionId, requester);
    return this.prisma.registration.findMany({
      where: { actionId, status: 'ACTIVE', presence: { isNot: null } },
      include: { user: { select: { id: true, name: true, email: true } }, presence: true },
    });
  }

  async findAbsentByAction(actionId: string, requester: PresencePrincipal) {
    await this.assertActionAccess(actionId, requester);
    return this.prisma.registration.findMany({
      where: { actionId, status: 'ACTIVE', presence: null },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  }
}