import { describe, expect, it, jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../../database/prisma.service';

describe('NotificationsService', () => {
  const now = new Date('2026-11-10T10:00:00Z');
  function setup() {
    const db = {
      registration: { findMany: jest.fn<any>().mockResolvedValue([{ id: 'r1', createdAt: now, cancelledAt: null, action: { title: 'Oficina', event: { title: 'Semana' } } }]) },
      certificate: { findMany: jest.fn<any>().mockResolvedValue([{ id: 'c1', issuedAt: now, event: { title: 'Semana' } }]) },
      notificationRead: { findMany: jest.fn<any>().mockResolvedValue([{ key: 'certificate:c1' }]), upsert: jest.fn<any>().mockResolvedValue({}) },
    };
    return { db, service: new NotificationsService(db as unknown as PrismaService) };
  }
  it('lista apenas dados do usuário e mostra o estado de leitura', async () => {
    const { service, db } = setup();
    const result = await service.list('u1');
    expect(db.registration.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u1' } }));
    expect(db.certificate.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u1', revokedAt: null } }));
    expect(result).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'certificate:c1', read: true }), expect.objectContaining({ key: 'registration-created:r1', read: false })]));
  });
  it('só permite marcar uma notificação pertencente ao usuário', async () => {
    const { service, db } = setup();
    await expect(service.markRead('u1', 'certificate:outro')).rejects.toThrow(NotFoundException);
    expect(db.notificationRead.upsert).not.toHaveBeenCalled();
    await service.markRead('u1', 'certificate:c1');
    expect(db.notificationRead.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: { userId: 'u1', key: 'certificate:c1' } }));
  });
});
