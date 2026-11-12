import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import PDFDocument from 'pdfkit';
import {
  Prisma,
  RegistrationStatus,
  UserRole,
} from '../../generated/prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ReportQueryDto } from './dto/report-query.dto';

export type ReportPrincipal = { id: string; role: UserRole };
export type ReportType = 'events' | 'registrations' | 'attendance' | 'certificates' | 'general';
type ReportRow = Record<string, string | number | boolean | null>;

type ReportPayload = {
  type: ReportType;
  title: string;
  generatedAt: string;
  filters: Record<string, string | null>;
  columns: string[];
  rows: ReportRow[];
  total: number;
  truncated: boolean;
};

const REPORT_LIMIT = 10000;
const REPORT_DEFINITIONS: Record<ReportType, { title: string; columns: string[] }> = {
  general: {
    title: 'Relatório geral por evento',
    columns: ['Evento', 'Status do evento', 'Início', 'Ações', 'Inscrições ativas', 'Presenças', 'Ausências', 'Certificados registrados'],
  },
  events: {
    title: 'Relatório de eventos e ações',
    columns: ['Evento', 'Status do evento', 'Início', 'Término', 'Quantidade de ações', 'Certificados registrados'],
  },
  registrations: {
    title: 'Relatório de inscrições',
    columns: ['Participante', 'E-mail', 'Evento', 'Ação', 'Status da inscrição', 'Data da inscrição', 'Data do cancelamento'],
  },
  attendance: {
    title: 'Relatório de frequência',
    columns: ['Participante', 'E-mail', 'Evento', 'Ação', 'Situação', 'Data da presença', 'Data da inscrição'],
  },
  certificates: {
    title: 'Relatório de certificados',
    columns: ['Participante', 'E-mail', 'Evento', 'Abrangência', 'Ação', 'Código de validação', 'Minutos certificados', 'Frequência (%)', 'Data de emissão', 'Situação'],
  },
};

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private assertPrincipal(principal: ReportPrincipal): void {
    if (!principal.id) {
      throw new ForbiddenException('Usuário autenticado sem identificador.');
    }
    if (principal.role !== UserRole.ADMIN && principal.role !== UserRole.ORGANIZADOR && principal.role !== UserRole.PROFESSOR) {
      throw new ForbiddenException('Perfil sem permissão para consultar relatórios administrativos.');
    }
  }

  private parseDate(value: string | undefined, upperBound = false): Date | undefined {
    if (!value) return undefined;
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const parsed = new Date(dateOnly
      ? `${value}T${upperBound ? '23:59:59.999' : '00:00:00.000'}-03:00`
      : value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Um dos filtros de data é inválido.');
    }
    return parsed;
  }

  private eventWhere(principal: ReportPrincipal, query: ReportQueryDto): Prisma.EventWhereInput {
    this.assertPrincipal(principal);
    const from = this.parseDate(query.startDateFrom);
    const to = this.parseDate(query.startDateTo, true);
    if (from && to && from > to) {
      throw new BadRequestException('A data inicial deve ser anterior ou igual à data final.');
    }

    const where: Prisma.EventWhereInput = {};
    if (principal.role !== UserRole.ADMIN) where.organizerId = principal.id;
    if (query.eventId) where.id = query.eventId;
    if (query.actionId) where.actions = { some: { id: query.actionId } };
    if (from || to) {
      where.startDate = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    }
    return where;
  }

  private actionWhere(principal: ReportPrincipal, query: ReportQueryDto): Prisma.ActionWhereInput {
    return {
      event: { is: this.eventWhere(principal, query) },
      ...(query.actionId ? { id: query.actionId } : {}),
    };
  }

  private date(value: Date | null | undefined): string | null {
    if (!value) return null;
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Fortaleza',
    }).format(value);
  }

  async getReport(typeInput: string, principal: ReportPrincipal, query: ReportQueryDto): Promise<ReportPayload> {
    this.assertPrincipal(principal);
    if (!Object.prototype.hasOwnProperty.call(REPORT_DEFINITIONS, typeInput)) {
      throw new BadRequestException('Tipo de relatório inválido. Use events, registrations, attendance, certificates ou general.');
    }
    const type = typeInput as ReportType;
    const definition = REPORT_DEFINITIONS[type];
    const eventWhere = this.eventWhere(principal, query);
    const actionWhere = this.actionWhere(principal, query);

    let rows: ReportRow[];
    let truncated: boolean;

    if (type === 'general') {
      // Aggregate only the selected event/action scope and count registrations,
      // rather than treating registrations in different actions as unique people.
      const events = await this.prisma.event.findMany({
        where: eventWhere,
        orderBy: { startDate: 'desc' },
        take: REPORT_LIMIT + 1,
        select: {
          id: true, title: true, status: true, startDate: true,
          actions: {
            ...(query.actionId ? { where: { id: query.actionId } } : {}),
            select: { id: true, _count: { select: { registrations: { where: { status: RegistrationStatus.ACTIVE } } } } },
          },
          _count: { select: { certificates: query.actionId ? { where: { actionId: query.actionId, scope: 'ACTION' } } : true } },
        },
      });
      truncated = events.length > REPORT_LIMIT;
      const selected = events.slice(0, REPORT_LIMIT);
      const actionIds = selected.flatMap((event) => event.actions.map((action) => action.id));
      const presences = actionIds.length ? await this.prisma.registration.groupBy({
        by: ['actionId'],
        where: { actionId: { in: actionIds }, status: RegistrationStatus.ACTIVE, presence: { isNot: null } },
        _count: { _all: true },
      }) : [];
      const presentByAction = new Map(presences.map((item) => [item.actionId, item._count._all]));
      rows = selected.map((event) => {
        const active = event.actions.reduce((sum, action) => sum + action._count.registrations, 0);
        const present = event.actions.reduce((sum, action) => sum + (presentByAction.get(action.id) ?? 0), 0);
        return {
          'Evento': event.title, 'Status do evento': event.status, 'Início': this.date(event.startDate),
          'Ações': event.actions.length, 'Inscrições ativas': active, 'Presenças': present,
          'Ausências': active - present, 'Certificados registrados': event._count.certificates,
        };
      });
    } else if (type === 'events') {
      const events = await this.prisma.event.findMany({
        where: eventWhere,
        orderBy: { startDate: 'desc' },
        take: REPORT_LIMIT + 1,
        select: {
          id: true,
          title: true,
          status: true,
          startDate: true,
          endDate: true,
          actions: { ...(query.actionId ? { where: { id: query.actionId } } : {}), select: { id: true } },
          _count: { select: { certificates: query.actionId ? { where: { actionId: query.actionId, scope: 'ACTION' } } : true } },
        },
      });
      truncated = events.length > REPORT_LIMIT;
      rows = events.slice(0, REPORT_LIMIT).map((event) => ({
        'Evento': event.title,
        'Status do evento': event.status,
        'Início': this.date(event.startDate),
        'Término': this.date(event.endDate),
        'Quantidade de ações': event.actions.length,
        'Certificados registrados': event._count.certificates,
      }));
    } else if (type === 'registrations') {
      const items = await this.prisma.registration.findMany({
        where: { action: { is: actionWhere } },
        orderBy: { createdAt: 'desc' },
        take: REPORT_LIMIT + 1,
        select: {
          status: true,
          createdAt: true,
          cancelledAt: true,
          user: { select: { name: true, email: true } },
          action: { select: { title: true, event: { select: { title: true } } } },
        },
      });
      truncated = items.length > REPORT_LIMIT;
      rows = items.slice(0, REPORT_LIMIT).map((item) => ({
        'Participante': item.user.name,
        'E-mail': item.user.email,
        'Evento': item.action.event.title,
        'Ação': item.action.title,
        'Status da inscrição': item.status === RegistrationStatus.ACTIVE ? 'Ativa' : 'Cancelada',
        'Data da inscrição': this.date(item.createdAt),
        'Data do cancelamento': this.date(item.cancelledAt),
      }));
    } else if (type === 'attendance') {
      const items = await this.prisma.registration.findMany({
        where: {
          status: RegistrationStatus.ACTIVE,
          action: { is: actionWhere },
        },
        orderBy: { createdAt: 'desc' },
        take: REPORT_LIMIT + 1,
        select: {
          createdAt: true,
          user: { select: { name: true, email: true } },
          action: { select: { title: true, event: { select: { title: true } } } },
          presence: { select: { registeredAt: true } },
        },
      });
      truncated = items.length > REPORT_LIMIT;
      rows = items.slice(0, REPORT_LIMIT).map((item) => ({
        'Participante': item.user.name,
        'E-mail': item.user.email,
        'Evento': item.action.event.title,
        'Ação': item.action.title,
        'Situação': item.presence ? 'PRESENTE' : 'AUSENTE',
        'Data da presença': this.date(item.presence?.registeredAt),
        'Data da inscrição': this.date(item.createdAt),
      }));
    } else {
      const certificates = await this.prisma.certificate.findMany({
        where: {
          event: { is: eventWhere },
          ...(query.actionId ? { actionId: query.actionId, scope: 'ACTION' } : {}),
        },
        orderBy: { issuedAt: 'desc' },
        take: REPORT_LIMIT + 1,
        select: {
          validationCode: true,
          scope: true,
          certifiedMinutes: true,
          attendancePercent: true,
          issuedAt: true,
          revokedAt: true,
          user: { select: { name: true, email: true } },
          event: { select: { title: true } },
          action: { select: { title: true } },
        },
      });
      truncated = certificates.length > REPORT_LIMIT;
      rows = certificates.slice(0, REPORT_LIMIT).map((certificate) => ({
        'Participante': certificate.user.name,
        'E-mail': certificate.user.email,
        'Evento': certificate.event.title,
        'Abrangência': certificate.scope === 'EVENT' ? 'EVENTO CONSOLIDADO' : 'AÇÃO LEGADA',
        'Ação': certificate.action?.title ?? 'Evento completo',
        'Código de validação': certificate.validationCode,
        'Minutos certificados': certificate.certifiedMinutes,
        'Frequência (%)': certificate.attendancePercent,
        'Data de emissão': this.date(certificate.issuedAt),
        'Situação': certificate.revokedAt ? 'REVOGADO' : 'VÁLIDO',
      }));
    }

    return {
      type,
      title: definition.title,
      generatedAt: new Date().toISOString(),
      filters: {
        startDateFrom: query.startDateFrom ?? null,
        startDateTo: query.startDateTo ?? null,
        eventId: query.eventId ?? null,
        actionId: query.actionId ?? null,
        dateRule: 'O período filtra pela data de início do evento.',
      },
      columns: definition.columns,
      rows,
      total: rows.length,
      truncated,
    };
  }

  /** Exposed for focused unit testing and shared by the CSV exporter. */
  toCsv(rows: ReportRow[], columns: string[]): string {
    const escape = (value: unknown): string => {
      let content = value === null || value === undefined ? '' : String(value);
      // Prevent spreadsheet formula execution when a CSV is opened in Excel/Calc.
      if (/^\s*[=+@-]/.test(content)) content = `'${content}`;
      if (/[";\r\n]/.test(content)) content = `"${content.replace(/"/g, '""')}"`;
      return content;
    };
    const header = columns.map(escape).join(';');
    const body = rows.map((row) => columns.map((column) => escape(row[column])).join(';'));
    return `\uFEFF${[header, ...body].join('\r\n')}`;
  }

  async createCsv(payload: ReportPayload): Promise<Buffer> {
    return Buffer.from(this.toCsv(payload.rows, payload.columns), 'utf8');
  }

  async createPdf(payload: ReportPayload): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: payload.columns.length > 8 ? 'A3' : 'A4',
        layout: 'landscape',
        margins: { top: 38, bottom: 36, left: 38, right: 38 },
        info: {
          Title: payload.title,
          Author: 'SIGE IFCE',
          Subject: 'Relatório administrativo',
          Creator: 'SIGE IFCE - Sprint 8',
        },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer | Uint8Array) => chunks.push(Buffer.from(chunk)));
      doc.on('error', reject);
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      const left = doc.page.margins.left;
      const pageWidth = doc.page.width - left - doc.page.margins.right;
      const bottom = () => doc.page.height - doc.page.margins.bottom;
      const padding = 5;
      const fontSize = 8;
      const weights = payload.columns.map((name) => {
        if (['Participante', 'E-mail', 'Evento', 'Ação', 'Código de validação'].includes(name)) return 1.55;
        if (name.includes('Data') || name === 'Início' || name === 'Término') return 1.15;
        return 1;
      });
      const sum = weights.reduce((a, b) => a + b, 0);
      const widths = weights.map((weight) => pageWidth * weight / sum);
      const pageHeading = (first: boolean) => {
        doc.rect(0, 0, doc.page.width, 7).fill('#2E7D32');
        doc.font('Helvetica-Bold').fontSize(first ? 16 : 11).fillColor('#1B3321')
          .text(payload.title, left, 22, { width: pageWidth });
        if (first) {
          doc.moveDown(.3);
          doc.font('Helvetica').fontSize(8).fillColor('#536457')
            .text(`SIGE IFCE · Gerado em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Fortaleza' }).format(new Date(payload.generatedAt))}`, { width: pageWidth });
          doc.text(`Registros: ${payload.total}${payload.truncated ? ' (limite de exportação atingido; refine os filtros)' : ''}`, { width: pageWidth });
          const filters = [payload.filters.startDateFrom ? `Início: ${payload.filters.startDateFrom}` : '', payload.filters.startDateTo ? `Fim: ${payload.filters.startDateTo}` : '', payload.filters.eventId ? `Evento ID: ${payload.filters.eventId}` : '', payload.filters.actionId ? `Ação ID: ${payload.filters.actionId}` : ''].filter(Boolean).join(' · ');
          if (filters) doc.text(`Filtros: ${filters}`, { width: pageWidth });
          doc.text('O período filtra pela data de início do evento.', { width: pageWidth });
        }
        doc.moveDown(.8);
      };
      const tableHeader = () => {
        doc.font('Helvetica-Bold').fontSize(fontSize);
        const height = Math.max(...payload.columns.map((name, i) => doc.heightOfString(name, { width: widths[i] - padding * 2 }))) + padding * 2;
        const y = doc.y; let x = left;
        payload.columns.forEach((name, i) => {
          doc.rect(x, y, widths[i], height).fillAndStroke('#e8f2e9', '#cbd8cc');
          doc.fillColor('#183b25').text(name, x + padding, y + padding, { width: widths[i] - padding * 2 });
          x += widths[i];
        });
        doc.y = y + height;
      };
      const nextPage = () => { doc.addPage(); pageHeading(false); tableHeader(); };
      pageHeading(true);
      if (payload.rows.length === 0) {
        doc.font('Helvetica').fontSize(10).fillColor('#5B665D').text('Nenhum registro encontrado para os filtros informados.', { width: pageWidth });
      } else {
        tableHeader();
        payload.rows.forEach((row, index) => {
          let pending = payload.columns.map((column) => String(row[column] ?? '—'));
          do {
            if (bottom() - doc.y < 34) nextPage();
            const maxTextHeight = bottom() - doc.y - padding * 2;
            doc.font('Helvetica').fontSize(fontSize);
            // Split unusually long cells across pages instead of clipping data.
            const portions = pending.map((value, i) => {
              if (!value) return '';
              const opts = { width: widths[i] - padding * 2 };
              if (doc.heightOfString(value, opts) <= maxTextHeight) return value;
              let low = 1, high = value.length;
              while (low < high) {
                const mid = Math.ceil((low + high) / 2);
                if (doc.heightOfString(value.slice(0, mid), opts) <= maxTextHeight) low = mid;
                else high = mid - 1;
              }
              return value.slice(0, low);
            });
            const height = Math.max(fontSize * 1.2, ...portions.map((value, i) => value ? doc.heightOfString(value, { width: widths[i] - padding * 2 }) : 0)) + padding * 2;
            const y = doc.y; let x = left;
            portions.forEach((value, i) => {
              doc.rect(x, y, widths[i], height).fillAndStroke(index % 2 ? '#f7faf7' : '#ffffff', '#d9e2d9');
              if (value) doc.fillColor('#202820').text(value, x + padding, y + padding, { width: widths[i] - padding * 2, height: height - padding * 2 });
              x += widths[i];
            });
            doc.y = y + height;
            pending = pending.map((value, i) => value.slice(portions[i].length));
            if (pending.some(Boolean)) nextPage();
          } while (pending.some(Boolean));
        });
      }
      doc.end();
    });
  }
}
