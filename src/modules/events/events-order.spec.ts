import { describe, expect, it, jest } from '@jest/globals';
import { EventsService } from './events.service';
import { EventStatus, UserRole } from '../../generated/prisma/enums';

describe('ordenação de eventos do organizador', () => {
  const owner = { sub: 'organizer-1', role: UserRole.ORGANIZADOR };
  const items = [
    ...Array.from({ length: 22 }, (_, i) => ({ id: `mine-${String(i).padStart(2, '0')}`, title: 'Feira IFCE', organizerId: owner.sub, status: EventStatus.PUBLICADO, startDate: new Date(`2099-02-${String(i + 1).padStart(2, '0')}T12:00:00Z`), cover: null })),
    ...Array.from({ length: 23 }, (_, i) => ({ id: `other-${String(i).padStart(2, '0')}`, title: 'Feira IFCE', organizerId: 'organizer-2', status: EventStatus.PUBLICADO, startDate: new Date(`2099-01-${String(i + 1).padStart(2, '0')}T12:00:00Z`), cover: null })),
    { id: 'draft', title: 'Feira IFCE', organizerId: 'organizer-2', status: EventStatus.RASCUNHO, startDate: new Date('2099-01-01T12:00:00Z'), cover: null },
  ];
  type Where = { organizerId?: string | { not: string }; status?: EventStatus | { in: EventStatus[] }; title?: { contains: string } };
  function filtered(where: Where) {
    return items.filter((item) => {
      const organizer = where.organizerId;
      const status = where.status;
      return (!organizer || (typeof organizer === 'string' ? item.organizerId === organizer : item.organizerId !== organizer.not)) &&
        (!status || (typeof status === 'string' ? item.status === status : status.in.includes(item.status))) &&
        (!where.title || item.title.toLowerCase().includes(where.title.contains.toLowerCase()));
    }).sort((a, b) => a.startDate.getTime() - b.startDate.getTime() || a.id.localeCompare(b.id));
  }
  function service() {
    const event = {
      count: async ({ where }: { where: Where }) => filtered(where).length,
      findMany: async ({ where, skip, take }: { where: Where; skip: number; take: number }) => filtered(where).slice(skip, skip + take),
    };
    const db = { event, $transaction: async (fn: (tx: { event: typeof event }) => Promise<unknown>) => fn({ event }) };
    const result = new EventsService(db as never);
    jest.spyOn(result, 'synchronizeLifecycle').mockResolvedValue();
    return result;
  }

  it('mantém todos os eventos próprios antes dos demais ao atravessar páginas', async () => {
    const svc = service();
    const pages = await Promise.all([1, 2, 3].map(page => svc.findPublic({ page, limit: 20, title: 'Feira' }, owner)));
    const ids = pages.flatMap(page => page.data.map(event => event.id));
    expect(pages.map(page => page.data.length)).toEqual([20, 20, 5]);
    expect(pages[0].meta).toMatchObject({ total: 45, pages: 3 });
    expect(ids.slice(0, 22)).toEqual(items.slice(0, 22).map(event => event.id));
    expect(ids.slice(22)).toEqual(items.slice(22, 45).map(event => event.id));
    expect(new Set(ids).size).toBe(45);
    expect(ids).not.toContain('draft');
  });

  it('mantém filtros e rejeita perfil sem permissão', async () => {
    const svc = service();
    const empty = await svc.findPublic({ page: 1, limit: 20, title: 'inexistente' }, owner);
    expect(empty.data).toEqual([]);
    expect(empty.meta.total).toBe(0);
    await expect(svc.findPublic({ page: 1, limit: 20 }, { sub: 'student', role: UserRole.ALUNO })).rejects.toThrow();
  });
});
