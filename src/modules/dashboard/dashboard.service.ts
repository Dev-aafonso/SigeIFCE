import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  Prisma,
  RegistrationStatus,
  UserRole,
} from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

export type DashboardPrincipal = {
  id: string;
  role: UserRole;
};

type DateBounds = { from?: Date; to?: Date };

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private assertPrincipal(principal: DashboardPrincipal): void {
    if (!principal.id) {
      throw new ForbiddenException('Usuário autenticado sem identificador.');
    }
    if (principal.role !== UserRole.ADMIN && principal.role !== UserRole.ORGANIZADOR && principal.role !== UserRole.PROFESSOR) {
      throw new ForbiddenException('Perfil sem permissão para consultar o painel administrativo.');
    }
  }

  private parseDate(value: string | undefined, upperBound = false): Date | undefined {
    if (!value) return undefined;
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const date = new Date(dateOnly
      ? `${value}T${upperBound ? '23:59:59.999' : '00:00:00.000'}Z`
      : value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Um dos filtros de data é inválido.');
    }
    return date;
  }

  private bounds(query: DashboardQueryDto): DateBounds {
    const from = this.parseDate(query.startDateFrom);
    const to = this.parseDate(query.startDateTo, true);
    if (from && to && from > to) {
      throw new BadRequestException('A data inicial deve ser anterior ou igual à data final.');
    }
    return { from, to };
  }

  private eventWhere(
    principal: DashboardPrincipal,
    query: DashboardQueryDto,
    includeSelectedEvent = true,
  ): Prisma.EventWhereInput {
    this.assertPrincipal(principal);
    const { from, to } = this.bounds(query);
    const where: Prisma.EventWhereInput = {};

    if (principal.role !== UserRole.ADMIN) {
      where.organizerId = principal.id;
    }
    if (includeSelectedEvent && query.eventId) {
      where.id = query.eventId;
    }
    if (query.actionId) {
      where.actions = { some: { id: query.actionId } };
    }
    if (from || to) {
      where.startDate = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    }
    return where;
  }

  private actionWhere(
    principal: DashboardPrincipal,
    query: DashboardQueryDto,
    includeSelectedAction = true,
  ): Prisma.ActionWhereInput {
    const where: Prisma.ActionWhereInput = {
      event: { is: this.eventWhere(principal, query) },
    };
    if (includeSelectedAction && query.actionId) {
      where.id = query.actionId;
    }
    return where;
  }

  private registrationWhere(
    principal: DashboardPrincipal,
    query: DashboardQueryDto,
  ): Prisma.RegistrationWhereInput {
    return {
      status: RegistrationStatus.ACTIVE,
      action: { is: this.actionWhere(principal, query) },
    };
  }

  async getSummary(principal: DashboardPrincipal) {
    const eventWhere = this.eventWhere(principal, {});
    const registrationScope = { action: { is: { event: { is: eventWhere } } } };
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    monthStart.setUTCMonth(monthStart.getUTCMonth() - 5);
    const [upcoming, events, registrations, presences, recentRegistrations, recentPresences] = await Promise.all([
      this.prisma.event.findMany({
        where: { ...eventWhere, startDate: { gte: new Date() }, status: { in: ['PUBLICADO', 'EM_ANDAMENTO'] } },
        orderBy: { startDate: 'asc' }, take: 5,
        select: { id: true, title: true, startDate: true, location: true, status: true },
      }),
      this.prisma.event.findMany({
        where: eventWhere, orderBy: { startDate: 'desc' }, take: 100,
        select: { id: true, title: true, totalCapacity: true, actions: { select: {
          capacity: true, _count: { select: { registrations: { where: { status: RegistrationStatus.ACTIVE } } } },
        } } },
      }),
      this.prisma.registration.findMany({ where: { ...registrationScope, status: RegistrationStatus.ACTIVE, createdAt: { gte: monthStart } }, select: { createdAt: true, userId: true } }),
      this.prisma.presence.findMany({ where: { registeredAt: { gte: monthStart }, registration: { is: { ...registrationScope, status: RegistrationStatus.ACTIVE } } }, select: { registeredAt: true, registration: { select: { userId: true } } } }),
      this.prisma.registration.findMany({ where: registrationScope, orderBy: { updatedAt: 'desc' }, take: 5,
        select: { status: true, createdAt: true, cancelledAt: true, user: { select: { name: true } }, action: { select: { event: { select: { title: true } } } } } }),
      this.prisma.presence.findMany({ where: { registration: { is: registrationScope } }, orderBy: { registeredAt: 'desc' }, take: 5,
        select: { registeredAt: true, registration: { select: { user: { select: { name: true } }, action: { select: { event: { select: { title: true } } } } } } } }),
    ]);
    const monthKey = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    const trend = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(monthStart); date.setUTCMonth(monthStart.getUTCMonth() + index);
      const month = monthKey(date);
      return { month, label: new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' }).format(date),
        registrations: new Set(registrations.filter(row => monthKey(row.createdAt) === month).map(row => row.userId)).size,
        presences: new Set(presences.filter(row => monthKey(row.registeredAt) === month).map(row => row.registration.userId)).size };
    });
    const activity = [
      ...recentRegistrations.map(row => ({ name: row.user.name, event: row.action.event.title,
        kind: row.status === RegistrationStatus.CANCELLED ? 'cancelou a inscrição em' : 'inscreveu-se em',
        date: row.status === RegistrationStatus.CANCELLED && row.cancelledAt ? row.cancelledAt : row.createdAt })),
      ...recentPresences.map(row => ({ name: row.registration.user.name, event: row.registration.action.event.title,
        kind: 'confirmou presença em', date: row.registeredAt })),
    ].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 5);
    return { upcoming, events: events.map(event => ({ id: event.id, title: event.title,
      capacity: event.totalCapacity ?? event.actions.reduce((sum, action) => sum + action.capacity, 0),
      registrations: event.actions.reduce((sum, action) => sum + action._count.registrations, 0) })), trend, activity };
  }

  async getFilters(principal: DashboardPrincipal, query: DashboardQueryDto) {
    this.assertPrincipal(principal);
    const eventWhere = this.eventWhere(principal, query);
    const actionWhere = this.actionWhere(principal, query, false);

    const [events, actions] = await Promise.all([
      this.prisma.event.findMany({
        where: eventWhere,
        orderBy: { startDate: 'desc' },
        take: 250,
        select: { id: true, title: true, status: true, startDate: true },
      }),
      this.prisma.action.findMany({
        where: actionWhere,
        orderBy: { startDate: 'desc' },
        take: 1500,
        select: { id: true, title: true, eventId: true, status: true },
      }),
    ]);

    return {
      events,
      actions,
      limits: { events: 250, actions: 1500 },
    };
  }

  async getOverview(principal: DashboardPrincipal, query: DashboardQueryDto) {
    this.assertPrincipal(principal);
    const eventWhere = this.eventWhere(principal, query);
    const actionWhere = this.actionWhere(principal, query);
    const registrationWhere = this.registrationWhere(principal, query);
    const certificateWhere: Prisma.CertificateWhereInput = {
      event: { is: eventWhere },
      ...(query.actionId ? { actionId: query.actionId, scope: 'ACTION' } : {}),
    };

    const [
      eventCount,
      eventStatusGroups,
      actionCount,
      actionStatusGroups,
      activeRegistrations,
      presentRegistrations,
      participants,
      certificatesIssued,
      certificatesValid,
      certificatesConsolidated,
      certificatesLegacy,
    ] = await Promise.all([
      this.prisma.event.count({ where: eventWhere }),
      this.prisma.event.groupBy({
        by: ['status'], where: eventWhere, _count: { _all: true },
      }),
      this.prisma.action.count({ where: actionWhere }),
      this.prisma.action.groupBy({
        by: ['status'], where: actionWhere, _count: { _all: true },
      }),
      this.prisma.registration.count({ where: registrationWhere }),
      this.prisma.registration.count({
        where: { ...registrationWhere, presence: { isNot: null } },
      }),
      this.prisma.registration.findMany({
        where: registrationWhere,
        distinct: ['userId'],
        select: { userId: true },
      }),
      this.prisma.certificate.count({ where: certificateWhere }),
      this.prisma.certificate.count({
        where: { ...certificateWhere, revokedAt: null },
      }),
      this.prisma.certificate.count({ where: { ...certificateWhere, scope: 'EVENT', revokedAt: null } }),
      this.prisma.certificate.count({ where: { ...certificateWhere, scope: 'ACTION', revokedAt: null } }),
    ]);

    const sixMonthStart = new Date();
    sixMonthStart.setUTCDate(1);
    sixMonthStart.setUTCHours(0, 0, 0, 0);
    sixMonthStart.setUTCMonth(sixMonthStart.getUTCMonth() - 5);

    const trendRows = await this.prisma.registration.findMany({
      where: {
        ...registrationWhere,
        createdAt: { gte: sixMonthStart },
      },
      select: { createdAt: true },
    });

    const countsByMonth = new Map<string, number>();
    for (const registration of trendRows) {
      const date = registration.createdAt;
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
      countsByMonth.set(key, (countsByMonth.get(key) ?? 0) + 1);
    }

    const registrationTrend = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(sixMonthStart);
      date.setUTCMonth(sixMonthStart.getUTCMonth() + index);
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
      return {
        month: key,
        label: new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' })
          .format(new Date(`${key}-01T12:00:00.000Z`)),
        registrations: countsByMonth.get(key) ?? 0,
      };
    });

    const attendanceRate = activeRegistrations > 0
      ? Math.round((presentRegistrations / activeRegistrations) * 1000) / 10
      : 0;

    return {
      generatedAt: new Date().toISOString(),
      filters: {
        startDateFrom: query.startDateFrom ?? null,
        startDateTo: query.startDateTo ?? null,
        eventId: query.eventId ?? null,
        actionId: query.actionId ?? null,
        dateRule: 'O período filtra pela data de início do evento; as métricas consolidam as ações relacionadas.',
      },
      totals: {
        events: eventCount,
        actions: actionCount,
        activeRegistrations,
        uniqueParticipants: participants.length,
        presentRegistrations,
        absentRegistrations: Math.max(0, activeRegistrations - presentRegistrations),
        attendanceRate,
        certificatesIssued,
        certificatesValid,
        certificatesConsolidated,
        certificatesLegacy,
      },
      eventStatuses: eventStatusGroups.map((item) => ({
        status: item.status,
        count: item._count._all,
      })),
      actionStatuses: actionStatusGroups.map((item) => ({
        status: item.status,
        count: item._count._all,
      })),
      registrationTrend,
    };
  }

  async getEventBreakdown(principal: DashboardPrincipal, query: DashboardQueryDto) {
    this.assertPrincipal(principal);
    const events = await this.prisma.event.findMany({
      where: this.eventWhere(principal, query),
      orderBy: { startDate: 'desc' },
      take: 100,
      select: {
        id: true,
        title: true,
        status: true,
        startDate: true,
        endDate: true,
        _count: { select: { actions: true } },
      },
    });

    return events.map((event) => ({
      id: event.id,
      title: event.title,
      status: event.status,
      startDate: event.startDate,
      endDate: event.endDate,
      actionCount: event._count.actions,
    }));
  }

  async getActionBreakdown(principal: DashboardPrincipal, query: DashboardQueryDto) {
    this.assertPrincipal(principal);
    const actions = await this.prisma.action.findMany({
      where: this.actionWhere(principal, query),
      orderBy: { startDate: 'desc' },
      take: 150,
      select: {
        id: true,
        title: true,
        eventId: true,
        startDate: true,
        endDate: true,
        durationMinutes: true,
        capacity: true,
        status: true,
        event: { select: { title: true } },
      },
    });

    const actionIds = actions.map((action) => action.id);
    const registrationGroups = actionIds.length
      ? await this.prisma.registration.groupBy({
          by: ['actionId'],
          where: { actionId: { in: actionIds }, status: RegistrationStatus.ACTIVE },
          _count: { _all: true },
        })
      : [];
    const presenceGroups = actionIds.length
      ? await this.prisma.registration.groupBy({
          by: ['actionId'],
          where: {
            actionId: { in: actionIds },
            status: RegistrationStatus.ACTIVE,
            presence: { isNot: null },
          },
          _count: { _all: true },
        })
      : [];

    const registrationCounts = new Map<string, number>(
      registrationGroups.map((item): [string, number] => [item.actionId, item._count._all]),
    );
    const presenceCounts = new Map<string, number>(
      presenceGroups.map((item): [string, number] => [item.actionId, item._count._all]),
    );

    return actions.map((action) => {
      const registrations = registrationCounts.get(action.id) ?? 0;
      const present = presenceCounts.get(action.id) ?? 0;
      return {
        id: action.id,
        title: action.title,
        eventTitle: action.event.title,
        eventId: action.eventId,
        status: action.status,
        startDate: action.startDate,
        durationMinutes: action.durationMinutes,
        capacity: action.capacity,
        activeRegistrations: registrations,
        presentRegistrations: present,
        absentRegistrations: Math.max(0, registrations - present),
        occupancyPercent: action.capacity > 0
          ? Math.min(100, Math.round((registrations / action.capacity) * 1000) / 10)
          : 0,
      };
    });
  }
}
