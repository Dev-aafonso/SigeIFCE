import { Prisma } from '../../generated/prisma/client';
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
import { effectiveEventStatus, validateEventRules } from './event-rules';
import { isTransactionConflict } from '../../common/transaction-conflict';

type AuthUser = { id?: string; sub?: string; role: UserRole };

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  private lifecycleTimer?: ReturnType<typeof setInterval>;
  onModuleInit() {
    if (process.env.MOCK_MODE === 'true') return;
    // Reconciliacao idempotente, inclusive apos reinicio; nunca ressuscita estados finais.
    this.lifecycleTimer = setInterval(() => {
      void this.synchronizeLifecycle().catch(() => console.error('Falha na reconciliacao do ciclo de eventos.'));
    }, 60000);
    this.lifecycleTimer.unref();
    void this.synchronizeLifecycle().catch(() => console.error('Falha inicial no ciclo de eventos.'));
  }
  onModuleDestroy() { if (this.lifecycleTimer) clearInterval(this.lifecycleTimer); }
  async synchronizeLifecycle(now = new Date()) {
    await this.prisma.event.updateMany({
      where: { status: { in: [EventStatus.PUBLICADO, EventStatus.EM_ANDAMENTO] }, endDate: { lte: now } },
      data: { status: EventStatus.ENCERRADO, closedAt: now },
    });
    await this.prisma.event.updateMany({
      where: { status: EventStatus.PUBLICADO, startDate: { lte: now }, endDate: { gt: now } },
      data: { status: EventStatus.EM_ANDAMENTO },
    });
  }

  private rnFields(dto: CreateEventDto | UpdateEventDto) {
    return {
      ...(dto.category !== undefined ? { category: dto.category.trim() } : {}),
      ...(dto.workloadMinutes !== undefined ? { workloadMinutes: dto.workloadMinutes } : {}),
      ...(dto.totalCapacity !== undefined ? { totalCapacity: dto.totalCapacity } : {}),
      ...(dto.registrationStartDate !== undefined ? { registrationStartDate: new Date(dto.registrationStartDate) } : {}),
      ...(dto.registrationEndDate !== undefined ? { registrationEndDate: new Date(dto.registrationEndDate) } : {}),
    };
  }

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
      user.role !== UserRole.ORGANIZADOR &&
      user.role !== UserRole.PROFESSOR
    ) {
      throw new ForbiddenException(
        'Apenas administradores, organizadores ou professores podem gerenciar eventos.',
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

  private async get(id: string, db: Prisma.TransactionClient | PrismaService = this.prisma) {
    const event = await db.event.findUnique({
      where: { id },
      include: {
        cover: { select: { eventId: true } },
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

    const { cover, ...rest } = event;
    return { ...rest, coverImageUrl: cover ? `/events/${encodeURIComponent(event.id)}/manage/cover` : null, status: effectiveEventStatus(event.status, event.startDate, event.endDate) };
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

  async searchManageable(title: string, user: AuthUser) {
    this.manager(user);
    const term = typeof title === 'string' ? title.trim().slice(0, 100) : '';
    if (!term) return [];
    return this.prisma.event.findMany({
      where: { title: { contains: term, mode: 'insensitive' }, ...(user.role === UserRole.ADMIN ? {} : { organizerId: this.userId(user) }) },
      select: { id: true, title: true, startDate: true },
      orderBy: { startDate: 'desc' },
      take: 100,
    });
  }

  async create(
    dto: CreateEventDto,
    user: AuthUser,
  ) {
    this.manager(user);

    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);

    this.validateDates(start, end);

    validateEventRules({ ...dto, ...this.rnFields(dto), startDate: start, endDate: end,
      registrationStartDate: dto.registrationStartDate ? new Date(dto.registrationStartDate) : null,
      registrationEndDate: dto.registrationEndDate ? new Date(dto.registrationEndDate) : null });

    return this.prisma.event.create({
      data: {
        title: dto.title.trim(),
        description: dto.description.trim(),
        startDate: start,
        endDate: end,
        location: dto.location?.trim() || null,
        ...this.rnFields(dto),
        organizerId: this.userId(user),
      },
      include: {
        actions: true,
      },
    });
  }

  async findPublic(query: EventQueryDto) {
    await this.synchronizeLifecycle();
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    if (page < 1 || limit < 1 || limit > 100) {
      throw new BadRequestException('PaginaÃ§Ã£o invÃ¡lida.');
    }

    if (
      query.status &&
      ![EventStatus.PUBLICADO, EventStatus.EM_ANDAMENTO, EventStatus.ENCERRADO].includes(query.status as never)
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

    const where: Prisma.EventWhereInput = {
      status: query.status ?? { in: [EventStatus.PUBLICADO, EventStatus.EM_ANDAMENTO, EventStatus.ENCERRADO] },
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
          cover: { select: { eventId: true } },
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
      data: data.map(({ cover, ...event }) => ({ ...event, coverImageUrl: cover ? `/events/${encodeURIComponent(event.id)}/cover` : null })),
      meta: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async findPublicById(id: string) {
    await this.synchronizeLifecycle();
    const event = await this.prisma.event.findFirst({
      where: {
        id,
        status: { in: [EventStatus.PUBLICADO, EventStatus.EM_ANDAMENTO, EventStatus.ENCERRADO] },
      },
      include: {
        cover: { select: { eventId: true } },
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

    const { cover, ...rest } = event;
    return { ...rest, coverImageUrl: cover ? `/events/${encodeURIComponent(event.id)}/cover` : null };
  }

  async setCover(id: string, user: AuthUser, file?: { buffer: Buffer; mimetype: string }) {
    this.manager(user);
    const event = await this.get(id);
    this.scope(event, user);
    if ([EventStatus.CANCELADO, EventStatus.ENCERRADO].includes(event.status as never)) {
      throw new ConflictException('Eventos cancelados ou encerrados não podem ser editados.');
    }
    if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0 || file.buffer.length > 5 * 1024 * 1024) {
      throw new BadRequestException('Selecione uma imagem de até 5 MB.');
    }
    const data = file.buffer;
    const type = data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])) ? 'image/png'
      : data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff ? 'image/jpeg'
      : data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp' : null;
    if (!type || type !== file.mimetype) throw new BadRequestException('Use uma imagem JPEG, PNG ou WebP válida.');
    const bytes = Uint8Array.from(data);
    await this.prisma.eventCover.upsert({ where: { eventId: id }, create: { eventId: id, mimeType: type, data: bytes }, update: { mimeType: type, data: bytes } });
    return { coverImageUrl: `/events/${encodeURIComponent(id)}/cover` };
  }

  async getManagedCover(id: string, user: AuthUser) {
    this.manager(user);
    const event = await this.get(id);
    this.scope(event, user);
    const cover = await this.prisma.eventCover.findUnique({ where: { eventId: id } });
    if (!cover) throw new NotFoundException('Capa não encontrada.');
    return cover;
  }

  async getPublicCover(id: string) {
    const cover = await this.prisma.eventCover.findFirst({ where: { eventId: id, event: { status: { in: [EventStatus.PUBLICADO, EventStatus.EM_ANDAMENTO, EventStatus.ENCERRADO] } } } });
    if (!cover) throw new NotFoundException('Capa não encontrada.');
    return cover;
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

    return this.prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${id} FOR UPDATE`;
    const current = await this.get(id, tx);
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

    const merged = { ...current, ...dto, ...this.rnFields(dto), startDate: start, endDate: end,
      registrationStartDate: dto.registrationStartDate ? new Date(dto.registrationStartDate) : current.registrationStartDate,
      registrationEndDate: dto.registrationEndDate ? new Date(dto.registrationEndDate) : current.registrationEndDate };
    validateEventRules(merged);
    if (dto.totalCapacity !== undefined) {
      const participants = await tx.registration.findMany({
        where: { action: { eventId: id }, status: 'ACTIVE' }, select: { userId: true }, distinct: ['userId'],
      });
      if (participants.length > dto.totalCapacity) throw new ConflictException('Vagas inferiores ao total de participantes ativos.');
    }

    // Manter todas as acoes existentes dentro das novas datas do evento.
    // Mesmo uma acao cancelada faz parte do historico do evento.
    if (
      (dto.startDate !== undefined || dto.endDate !== undefined) &&
      current.actions.some((action) =>
        action.startDate < start || action.endDate > end
      )
    ) {
      throw new ConflictException(
        'As novas datas do evento deixariam acoes fora do periodo.',
      );
    }

    return tx.event.update({
      where: { id },
      data: {
        ...this.rnFields(dto),
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
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).catch((error: unknown) => {
      if (isTransactionConflict(error)) throw new ConflictException('Evento alterado simultaneamente. Tente novamente.');
      throw error;
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

    validateEventRules(current, true);

    if (current.endDate <= now) {
      throw new BadRequestException(
        'NÃ£o Ã© possÃ­vel publicar um evento que jÃ¡ terminou.',
      );
    }

    return this.prisma.event.update({
      where: { id },
      data: {
        status: effectiveEventStatus(EventStatus.PUBLICADO, current.startDate, current.endDate, now),
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

    if (![EventStatus.PUBLICADO, EventStatus.EM_ANDAMENTO, EventStatus.ENCERRADO].includes(current.status as never)) {
      throw new ConflictException(
        'Somente eventos PUBLICADOS podem ser encerrados.',
      );
    }

    if (current.endDate > new Date()) {
      throw new ConflictException(
        'Nao e possivel encerrar um evento antes de sua data final.',
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
