import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActionStatus,
  EventStatus,
  UserRole,
} from '../../generated/prisma/enums';
import { PrismaService } from '../../database/prisma.service';
import { CreateActionDto } from './dto/create-action.dto';
import { UpdateActionDto } from './dto/update-action.dto';

type AuthUser = { id?: string; sub?: string; role: UserRole };

@Injectable()
export class ActionsService {
  constructor(private readonly prisma: PrismaService) {}

  private userId(user: AuthUser): string {
    const id = user.sub ?? user.id;

    if (!id) {
      throw new ForbiddenException(
        'UsuÃ¡rio autenticado sem identificador.',
      );
    }

    return id;
  }

  private manager(user: AuthUser) {
    if (
      user.role !== UserRole.ADMIN &&
      user.role !== UserRole.ORGANIZADOR
    ) {
      throw new ForbiddenException(
        'Apenas ADMIN ou ORGANIZADOR podem gerenciar aÃ§Ãµes.',
      );
    }
  }

  private validateDates(
    start: Date,
    end: Date,
  ) {
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime())
    ) {
      throw new BadRequestException('Datas invÃ¡lidas.');
    }

    if (end <= start) {
      throw new BadRequestException(
        'A data de tÃ©rmino deve ser posterior Ã  data de inÃ­cio.',
      );
    }
  }

  private validateDuration(
    start: Date,
    end: Date,
    minutes: number,
  ) {
    const actualMs =
      end.getTime() - start.getTime();

    const expectedMs =
      minutes * 60_000;

    if (actualMs !== expectedMs) {
      throw new BadRequestException(
        'durationMinutes deve corresponder exatamente ao intervalo entre inÃ­cio e tÃ©rmino.',
      );
    }
  }

  private validateInsideEvent(
    start: Date,
    end: Date,
    eventStart: Date,
    eventEnd: Date,
  ) {
    if (
      start < eventStart ||
      end > eventEnd
    ) {
      throw new BadRequestException(
        'A aÃ§Ã£o deve ocorrer integralmente dentro do perÃ­odo do evento.',
      );
    }
  }

  private scope(
    organizerId: string,
    user: AuthUser,
  ) {
    if (user.role === UserRole.ADMIN) return;

    if (
      organizerId !== this.userId(user)
    ) {
      throw new ForbiddenException(
        'VocÃª nÃ£o possui acesso ao evento.',
      );
    }
  }

  private async getEvent(
    eventId: string,
  ) {
    const event =
      await this.prisma.event.findUnique({
        where: {
          id: eventId,
        },
      });

    if (!event) {
      throw new NotFoundException(
        'Evento nÃ£o encontrado.',
      );
    }

    return event;
  }

  private async getAction(id: string) {
    const action =
      await this.prisma.action.findUnique({
        where: {
          id,
        },
        include: {
          event: true,
        },
      });

    if (!action) {
      throw new NotFoundException(
        'AÃ§Ã£o nÃ£o encontrada.',
      );
    }

    return action;
  }

  async create(
    eventId: string,
    dto: CreateActionDto,
    user: AuthUser,
  ) {
    this.manager(user);

    const event =
      await this.getEvent(eventId);

    this.scope(
      event.organizerId,
      user,
    );

    if (
      event.status === EventStatus.CANCELADO ||
      event.status === EventStatus.ENCERRADO
    ) {
      throw new ConflictException(
        'NÃ£o Ã© possÃ­vel adicionar aÃ§Ãµes a evento cancelado ou encerrado.',
      );
    }

    const start =
      new Date(dto.startDate);

    const end =
      new Date(dto.endDate);

    this.validateDates(start, end);

    this.validateInsideEvent(
      start,
      end,
      event.startDate,
      event.endDate,
    );

    this.validateDuration(
      start,
      end,
      dto.durationMinutes,
    );

    if (dto.capacity < 1) {
      throw new BadRequestException(
        'A capacidade deve ser maior que zero.',
      );
    }

    return this.prisma.action.create({
      data: {
        eventId,
        title: dto.title.trim(),
        description: dto.description.trim(),
        startDate: start,
        endDate: end,
        durationMinutes:
          dto.durationMinutes,
        capacity: dto.capacity,
        location:
          dto.location?.trim() || null,
      },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
      },
    });
  }

  async findPublicByEvent(
    eventId: string,
  ) {
    const event =
      await this.getEvent(eventId);

    if (
      event.status !== EventStatus.PUBLICADO
    ) {
      throw new NotFoundException(
        'As aÃ§Ãµes ficam pÃºblicas somente apÃ³s a publicaÃ§Ã£o do evento.',
      );
    }

    return this.prisma.action.findMany({
      where: {
        eventId,
        status: {
          not: ActionStatus.CANCELADA,
        },
      },
      orderBy: {
        startDate: 'asc',
      },
    });
  }

  async findPublicById(id: string) {
    const action =
      await this.prisma.action.findFirst({
        where: {
          id,
          status: {
            not: ActionStatus.CANCELADA,
          },
          event: {
            status: EventStatus.PUBLICADO,
          },
        },
        include: {
          event: {
            select: {
              id: true,
              title: true,
              status: true,
            },
          },
        },
      });

    if (!action) {
      throw new NotFoundException(
        'AÃ§Ã£o pÃºblica nÃ£o encontrada.',
      );
    }

    return action;
  }

  async update(
    id: string,
    dto: UpdateActionDto,
    user: AuthUser,
  ) {
    this.manager(user);

    const current =
      await this.getAction(id);

    this.scope(
      current.event.organizerId,
      user,
    );

    if (
      current.status === ActionStatus.CANCELADA ||
      current.status === ActionStatus.ENCERRADA
    ) {
      throw new ConflictException(
        'AÃ§Ãµes canceladas ou encerradas nÃ£o podem ser editadas.',
      );
    }

    if (
      current.event.status === EventStatus.CANCELADO ||
      current.event.status === EventStatus.ENCERRADO
    ) {
      throw new ConflictException(
        'O evento estÃ¡ em estado final.',
      );
    }

    const start = dto.startDate
      ? new Date(dto.startDate)
      : current.startDate;

    const end = dto.endDate
      ? new Date(dto.endDate)
      : current.endDate;

    const durationMinutes =
      dto.durationMinutes ??
      current.durationMinutes;

    const capacity =
      dto.capacity ??
      current.capacity;

    this.validateDates(
      start,
      end,
    );

    this.validateInsideEvent(
      start,
      end,
      current.event.startDate,
      current.event.endDate,
    );

    this.validateDuration(
      start,
      end,
      durationMinutes,
    );

    if (capacity < 1) {
      throw new BadRequestException(
        'A capacidade deve ser maior que zero.',
      );
    }

    return this.prisma.action.update({
      where: { id },
      data: {
        ...(dto.title !== undefined
          ? {
              title: dto.title.trim(),
            }
          : {}),
        ...(dto.description !== undefined
          ? {
              description:
                dto.description.trim(),
            }
          : {}),
        ...(dto.startDate !== undefined
          ? {
              startDate: start,
            }
          : {}),
        ...(dto.endDate !== undefined
          ? {
              endDate: end,
            }
          : {}),
        ...(dto.durationMinutes !== undefined
          ? {
              durationMinutes,
            }
          : {}),
        ...(dto.capacity !== undefined
          ? {
              capacity,
            }
          : {}),
        ...(dto.location !== undefined
          ? {
              location:
                dto.location.trim() || null,
            }
          : {}),
      },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
      },
    });
  }

  async cancel(
    id: string,
    user: AuthUser,
  ) {
    this.manager(user);

    const current =
      await this.getAction(id);

    this.scope(
      current.event.organizerId,
      user,
    );

    if (
      current.status === ActionStatus.CANCELADA ||
      current.status === ActionStatus.ENCERRADA
    ) {
      throw new ConflictException(
        'AÃ§Ã£o jÃ¡ estÃ¡ em estado final.',
      );
    }

    return this.prisma.action.update({
      where: {
        id,
      },
      data: {
        status: ActionStatus.CANCELADA,
        canceledAt: new Date(),
      },
    });
  }

  async close(
    id: string,
    user: AuthUser,
  ) {
    this.manager(user);

    const current =
      await this.getAction(id);

    this.scope(
      current.event.organizerId,
      user,
    );

    if (
      current.status !== ActionStatus.ATIVA
    ) {
      throw new ConflictException(
        'Somente aÃ§Ãµes ATIVAS podem ser encerradas.',
      );
    }

    return this.prisma.action.update({
      where: {
        id,
      },
      data: {
        status: ActionStatus.ENCERRADA,
        closedAt: new Date(),
      },
    });
  }
}