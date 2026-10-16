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
export type ReportType = 'events' | 'registrations' | 'attendance' | 'certificates';
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
    columns: ['Participante', 'E-mail', 'Evento', 'Ação', 'Código de validação', 'Minutos certificados', 'Frequência (%)', 'Data de emissão', 'Situação'],
  },
};

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private assertPrincipal(principal: ReportPrincipal): void {
    if (!principal.id) {
      throw new ForbiddenException('Usuário autenticado sem identificador.');
    }
    if (principal.role !== UserRole.ADMIN && principal.role !== UserRole.ORGANIZADOR) {
      throw new ForbiddenException('Perfil sem permissão para consultar relatórios administrativos.');
    }
  }

  private parseDate(value: string | undefined, upperBound = false): Date | undefined {
    if (!value) return undefined;
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const parsed = new Date(dateOnly
      ? `${value}T${upperBound ? '23:59:59.999' : '00:00:00.000'}Z`
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
    if (principal.role === UserRole.ORGANIZADOR) where.organizerId = principal.id;
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
      throw new BadRequestException('Tipo de relatório inválido. Use events, registrations, attendance ou certificates.');
    }
    const type = typeInput as ReportType;
    const definition = REPORT_DEFINITIONS[type];
    const eventWhere = this.eventWhere(principal, query);
    const actionWhere = this.actionWhere(principal, query);

    let rows: ReportRow[];
    let truncated: boolean;

    if (type === 'events') {
      const events = await this.prisma.event.findMany({
        where: eventWhere,
        orderBy: { startDate: 'desc' },
        take: REPORT_LIMIT,
        select: {
          id: true,
          title: true,
          status: true,
          startDate: true,
          endDate: true,
          actions: { select: { id: true } },
          _count: { select: { certificates: true } },
        },
      });
      truncated = events.length === REPORT_LIMIT;
      rows = events.map((event) => ({
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
        take: REPORT_LIMIT,
        select: {
          status: true,
          createdAt: true,
          cancelledAt: true,
          user: { select: { name: true, email: true } },
          action: { select: { title: true, event: { select: { title: true } } } },
        },
      });
      truncated = items.length === REPORT_LIMIT;
      rows = items.map((item) => ({
        'Participante': item.user.name,
        'E-mail': item.user.email,
        'Evento': item.action.event.title,
        'Ação': item.action.title,
        'Status da inscrição': item.status,
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
        take: REPORT_LIMIT,
        select: {
          createdAt: true,
          user: { select: { name: true, email: true } },
          action: { select: { title: true, event: { select: { title: true } } } },
          presence: { select: { registeredAt: true } },
        },
      });
      truncated = items.length === REPORT_LIMIT;
      rows = items.map((item) => ({
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
          ...(query.actionId ? { actionId: query.actionId } : {}),
        },
        orderBy: { issuedAt: 'desc' },
        take: REPORT_LIMIT,
        select: {
          validationCode: true,
          certifiedMinutes: true,
          attendancePercent: true,
          issuedAt: true,
          revokedAt: true,
          user: { select: { name: true, email: true } },
          event: { select: { title: true } },
          action: { select: { title: true } },
        },
      });
      truncated = certificates.length === REPORT_LIMIT;
      rows = certificates.map((certificate) => ({
        'Participante': certificate.user.name,
        'E-mail': certificate.user.email,
        'Evento': certificate.event.title,
        'Ação': certificate.action?.title ?? 'Não vinculada',
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
        size: 'A4',
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

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      doc.rect(0, 0, doc.page.width, 9).fill('#2E7D32');
      doc.fillColor('#1B3321').font('Helvetica-Bold').fontSize(17).text(payload.title, { width: pageWidth });
      doc.moveDown(0.35);
      doc.font('Helvetica').fontSize(8).fillColor('#5B665D')
        .text(`SIGE IFCE • Gerado em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Fortaleza' }).format(new Date(payload.generatedAt))}`);
      doc.text(`Registros: ${payload.total}${payload.truncated ? ' (limite de exportação atingido; refine os filtros)' : ''}`);
      const filterText = [
        payload.filters.startDateFrom ? `Início: ${payload.filters.startDateFrom}` : '',
        payload.filters.startDateTo ? `Fim: ${payload.filters.startDateTo}` : '',
        payload.filters.eventId ? `Evento ID: ${payload.filters.eventId}` : '',
        payload.filters.actionId ? `Ação ID: ${payload.filters.actionId}` : '',
      ].filter(Boolean).join(' • ');
      if (filterText) doc.text(`Filtros: ${filterText}`);
      doc.moveDown(0.6);
      doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).lineWidth(0.8).strokeColor('#B8C7BA').stroke();
      doc.moveDown(0.5);

      if (payload.rows.length === 0) {
        doc.fontSize(10).fillColor('#5B665D').text('Nenhum registro encontrado para os filtros informados.');
      } else {
        payload.rows.forEach((row, index) => {
          const content = payload.columns.map((column) => `${column}: ${row[column] ?? '—'}`).join('   |   ');
          doc.font('Helvetica-Bold').fontSize(7).fillColor('#2E7D32').text(`${index + 1}.`, { continued: true, width: 22 });
          doc.font('Helvetica').fontSize(7).fillColor('#202820').text(content, { width: pageWidth - 22 });
          doc.moveDown(0.35);
          if (doc.y > doc.page.height - doc.page.margins.bottom - 28 && index < payload.rows.length - 1) {
            doc.addPage();
            doc.rect(0, 0, doc.page.width, 5).fill('#2E7D32');
          }
        });
      }
      doc.end();
    });
  }
}
