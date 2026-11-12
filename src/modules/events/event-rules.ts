import { BadRequestException } from '@nestjs/common';
import { EventStatus } from '../../generated/prisma/enums';

type EventRules = {
  title: string; description: string; location?: string | null;
  category?: string | null; workloadMinutes?: number | null;
  registrationStartDate?: Date | null; registrationEndDate?: Date | null;
  totalCapacity?: number | null; startDate: Date; endDate: Date;
};

export function validateEventRules(event: EventRules, publication = false): void {
  for (const value of [event.workloadMinutes, event.totalCapacity]) {
    if (value != null && (!Number.isInteger(value) || value <= 0)) {
      throw new BadRequestException('Carga horaria e vagas devem ser inteiros positivos.');
    }
  }
  const start = event.registrationStartDate;
  const end = event.registrationEndDate;
  if ((start == null) !== (end == null) || (start && end &&
    (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end || end > event.endDate))) {
    throw new BadRequestException('Janela de inscricoes invalida: informe inicio e fim, ate o termino do evento.');
  }
  if (publication && (!event.title.trim() || !event.description.trim() || !event.location?.trim() ||
    !event.category?.trim() || !event.workloadMinutes || !event.totalCapacity || !start || !end)) {
    throw new BadRequestException('RN06: complete local, categoria, carga horaria, janela de inscricoes e vagas antes de publicar.');
  }
}

export function effectiveEventStatus(status: EventStatus, startDate: Date, endDate: Date, now = new Date()): EventStatus {
  if (status !== EventStatus.PUBLICADO && status !== EventStatus.EM_ANDAMENTO) return status;
  if (endDate <= now) return EventStatus.ENCERRADO;
  return startDate <= now ? EventStatus.EM_ANDAMENTO : EventStatus.PUBLICADO;
}
