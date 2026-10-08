import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import { CreatePresenceDto } from './dto/create-presence.dto';

@Injectable()
export class PresenceService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async create(
    dto: CreatePresenceDto,
    responsibleId: string,
  ) {
    const registration =
      await this.prisma.registration.findUnique({
        where: {
          id: dto.registrationId,
        },
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
          action: true,
        },
      });

    if (!registration) {
      throw new NotFoundException(
        'Inscrição não encontrada.',
      );
    }

    if (registration.status !== 'ACTIVE') {
      throw new BadRequestException(
        'A inscrição não está ativa.',
      );
    }

    const existingPresence =
      await this.prisma.presence.findUnique({
        where: {
          registrationId: dto.registrationId,
        },
      });

    if (existingPresence) {
      throw new ConflictException(
        'A presença deste participante já foi registrada.',
      );
    }

    return this.prisma.presence.create({
      data: {
        registrationId: dto.registrationId,
        responsibleId,
      },
      include: {
        registration: {
          include: {
            user: { select: { id: true, name: true, email: true, role: true } },
            action: true,
          },
        },
      },
    });
  }

  async findByRegistration(
    registrationId: string,
  ) {
    const presence =
      await this.prisma.presence.findUnique({
        where: {
          registrationId,
        },
        include: {
          registration: {
            include: {
              user: { select: { id: true, name: true, email: true, role: true } },
              action: true,
            },
          },
        },
      });

    if (!presence) {
      throw new NotFoundException(
        'Presença não encontrada.',
      );
    }

    return presence;
  }

  async findParticipantsByAction(
    actionId: string,
  ) {
    const registrations =
      await this.prisma.registration.findMany({
        where: {
          actionId,
          status: 'ACTIVE',
        },
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
          presence: true,
        },
      });

    return registrations.map((registration) => ({
      registrationId: registration.id,
      user: registration.user,
      present: registration.presence !== null,
      presence: registration.presence,
    }));
  }

  async findPresentByAction(
    actionId: string,
  ) {
    return this.prisma.registration.findMany({
      where: {
        actionId,
        status: 'ACTIVE',
        presence: {
          isNot: null,
        },
      },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        presence: true,
      },
    });
  }

  async findAbsentByAction(
    actionId: string,
  ) {
    return this.prisma.registration.findMany({
      where: {
        actionId,
        status: 'ACTIVE',
        presence: null,
      },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    });
  }
}

