import { ForbiddenException } from '@nestjs/common';
import { EventStatus, Prisma, UserRole } from '../../generated/prisma/client';

export function manageableEvents(userId: string, role: UserRole): Prisma.EventWhereInput {
  if (role !== UserRole.ADMIN) return { organizerId: userId };
  return { OR: [{ organizerId: userId }, { status: { not: EventStatus.RASCUNHO } }] };
}

export function assertDraftOwner(event: { status: EventStatus; organizerId: string }, userId: string) {
  if (event.status === EventStatus.RASCUNHO && event.organizerId !== userId) {
    throw new ForbiddenException('Apenas o criador pode acessar este rascunho.');
  }
}
