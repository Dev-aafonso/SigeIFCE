import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const [registrations, certificates, reads] = await Promise.all([
      this.prisma.registration.findMany({
        where: { userId }, orderBy: { updatedAt: 'desc' }, take: 50,
        select: { id: true, createdAt: true, cancelledAt: true, action: { select: { title: true, event: { select: { title: true } } } } },
      }),
      this.prisma.certificate.findMany({
        where: { userId, revokedAt: null }, orderBy: { issuedAt: 'desc' }, take: 50,
        select: { id: true, issuedAt: true, event: { select: { title: true } } },
      }),
      this.prisma.notificationRead.findMany({ where: { userId }, select: { key: true } }),
    ]);
    const seen = new Set(reads.map(item => item.key));
    const items = registrations.flatMap(reg => {
      const subject = `${reg.action.title} — ${reg.action.event.title}`;
      const result = [{ key: `registration-created:${reg.id}`, message: `Inscrição confirmada: ${subject}`, date: reg.createdAt }];
      if (reg.cancelledAt) result.push({ key: `registration-cancelled:${reg.id}`, message: `Inscrição cancelada: ${subject}`, date: reg.cancelledAt });
      return result;
    });
    items.push(...certificates.map(cert => ({ key: `certificate:${cert.id}`, message: `Certificado disponível: ${cert.event.title}`, date: cert.issuedAt })));
    return items.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 50)
      .map(item => ({ ...item, read: seen.has(item.key) }));
  }

  async markRead(userId: string, key: string) {
    const items = await this.list(userId);
    if (!items.some(item => item.key === key)) throw new NotFoundException('Notificação não encontrada.');
    await this.prisma.notificationRead.upsert({
      where: { userId_key: { userId, key } }, create: { userId, key }, update: {},
    });
    return { ok: true };
  }
}
