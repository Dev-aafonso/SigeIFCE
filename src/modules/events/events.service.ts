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
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventQueryDto } from './dto/event-query.dto';

type AuthUser = { id?: string; sub?: string; role: UserRole };

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  private userId(user: AuthUser): string {
    const id = user.sub ?? user.id;

    if (!id) {
      throw new ForbiddenException('UsuÃ¡rio autenticado sem identificador.');
    }

    return id;
  }

  private manager(user: AuthUser) {
    if (
      user.role !== UserRole.ADMIN &&
      user.role !== UserRole.ORGANIZADOR
    ) {
      throw new ForbiddenException(
        'Apenas ADMIN ou ORGANIZADOR podem gerenciar eventos.',
      );
    }
  }

  private validateDates(start: Date, end: Date) {
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

  private parseDate(
    value: string | undefined,
    field: string,
  ): Date | undefined {
    if (!value) return undefined;

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${field} invÃ¡lida.`);
    }

    return date;
  }

  private async get(id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: {
        organizer: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
        actions: {
          orderBy: {
            startDate: 'asc',
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Evento nÃ£o encontrado.');
    }

    return event;
  }

  private scope(
    event: { organizerId: string },
    user: AuthUser,
  ) {
    if (user.role === UserRole.ADMIN) return;

    if (event.organizerId !== this.userId(user)) {
      throw new ForbiddenException(
        'VocÃª nÃ£o possui acesso a este evento.',
      );
    }
  }

  async create(
    dto: CreateEventDto,
    user: AuthUser,
  ) {
    this.manager(user);

    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);

    this.validateDates(start, end);

    return this.prisma.event.create({
      data: {
        title: dto.title.trim(),
        description: dto.description.trim(),
        startDate: start,
        endDate: end,
        location: dto.location?.trim() || null,
        organizerId: this.userId(user),
      },
      include: {
        actions: true,
      },
    });
  }

  async findPublic(query: EventQueryDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    if (page < 1 || limit < 1 || limit > 100) {
      throw new BadRequestException('PaginaÃ§Ã£o invÃ¡lida.');
    }

    if (
      query.status &&
      query.status !== EventStatus.PUBLICADO
    ) {
      throw new BadRequestException(
        'A consulta pÃºblica aceita somente o status PUBLICADO.',
      );
    }

    const from = this.parseDate(
      query.startDateFrom,
      'startDateFrom',
    );

    const to = this.parseDate(
      query.startDateTo,
      'startDateTo',
    );

    if (from && to && to < from) {
      throw new BadRequestException(
        'startDateTo deve ser posterior ou igual a startDateFrom.',
      );
    }

    const where: any = {
      status: EventStatus.PUBLICADO,
    };

    if (query.title?.trim()) {
      where.title = {
        contains: query.title.trim(),
        mode: 'insensitive',
      };
    }

    if (from || to) {
      where.startDate = {};

      if (from) {
        where.startDate.gte = from;
      }

      if (to) {
        where.startDate.lte = to;
      }
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.event.findMany({
        where,
        orderBy: {
          startDate: 'asc',
        },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          organizer: {
            select: {
              id: true,
              email: true,
            },
          },
          actions: {
            where: {
              status: {
                not: ActionStatus.CANCELADA,
              },
            },
            orderBy: {
              startDate: 'asc',
            },
          },
        },
      }),
      this.prisma.event.count({
        where,
      }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async findPublicById(id: string) {
    const event = await this.prisma.event.findFirst({
      where: {
        id,
        status: EventStatus.PUBLICADO,
      },
      include: {
        organizer: {
          select: {
            id: true,
            email: true,
          },
        },
        actions: {
          where: {
            status: {
              not: ActionStatus.CANCELADA,
            },
          },
          orderBy: {
            startDate: 'asc',
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException(
        'Evento publicado nÃ£o encontrado.',
      );
    }

    return event;
  }

  async findManageable(
    id: string,
    user: AuthUser,
  ) {
    this.manager(user);

    const event = await this.get(id);
    this.scope(event, user);

    return event;
  }

  async update(
    id: string,
    dto: UpdateEventDto,
    user: AuthUser,
  ) {
    this.manager(user);

    const current = await this.get(id);
    this.scope(current, user);

    if (
      current.status === EventStatus.CANCELADO ||
      current.status === EventStatus.ENCERRADO
    ) {
      throw new ConflictException(
        'Eventos cancelados ou encerrados nÃ£o podem ser editados.',
      );
    }

    const start = dto.startDate
      ? new Date(dto.startDate)
      : current.startDate;

    const end = dto.endDate
      ? new Date(dto.endDate)
      : current.endDate;

    this.validateDates(start, end);

    return this.prisma.event.update({
      where: { id },
      data: {
        ...(dto.title !== undefined
          ? { title: dto.title.trim() }
          : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() }
          : {}),
        ...(dto.startDate !== undefined
          ? { startDate: start }
          : {}),
        ...(dto.endDate !== undefined
          ? { endDate: end }
          : {}),
        ...(dto.location !== undefined
          ? { location: dto.location.trim() || null }
          : {}),
      },
      include: {
        actions: true,
      },
    });
  }

  async publish(
    id: string,
    user: AuthUser,
  ) {
    this.manager(user);

    const current = await this.get(id);
    this.scope(current, user);

    if (current.status !== EventStatus.RASCUNHO) {
      throw new ConflictException(
        'Somente eventos em RASCUNHO podem ser publicados.',
      );
    }

    const activeActions = current.actions.filter(
      (action) =>
        action.status !== ActionStatus.CANCELADA,
    );

    if (activeActions.length === 0) {
      throw new BadRequestException(
        'O evento precisa ter pelo menos uma aÃ§Ã£o antes da publicaÃ§Ã£o.',
      );
    }

    const now = new Date();

    if (current.endDate <= now) {
      throw new BadRequestException(
        'NÃ£o Ã© possÃ­vel publicar um evento que jÃ¡ terminou.',
      );
    }

    return this.prisma.event.update({
      where: { id },
      data: {
        status: EventStatus.PUBLICADO,
        publishedAt: new Date(),
      },
      include: {
        actions: true,
      },
    });
  }

  async cancel(
    id: string,
    user: AuthUser,
  ) {
    this.manager(user);

    const current = await this.get(id);
    this.scope(current, user);

    if (
      current.status === EventStatus.CANCELADO ||
      current.status === EventStatus.ENCERRADO
    ) {
      throw new ConflictException(
        'Evento jÃ¡ estÃ¡ em estado final.',
      );
    }

    return this.prisma.event.update({
      where: { id },
      data: {
        status: EventStatus.CANCELADO,
        canceledAt: new Date(),
      },
      include: {
        actions: true,
      },
    });
  }

  async close(
    id: string,
    user: AuthUser,
  ) {
    this.manager(user);

    const current = await this.get(id);
    this.scope(current, user);

    if (current.status !== EventStatus.PUBLICADO) {
      throw new ConflictException(
        'Somente eventos PUBLICADOS podem ser encerrados.',
      );
    }

    return this.prisma.event.update({
      where: { id },
      data: {
        status: EventStatus.ENCERRADO,
        closedAt: new Date(),
      },
      include: {
        actions: true,
      },
    });
  }
}