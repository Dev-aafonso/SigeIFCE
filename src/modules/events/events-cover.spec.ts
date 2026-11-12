import { jest } from '@jest/globals';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EventsService } from './events.service';
import { UserRole, EventStatus } from '../../generated/prisma/enums';

describe('event cover', () => {
 const file = {buffer: Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0]), mimetype: 'image/png'};
 const setup = () => {
  const event = { id: 'event', organizerId: 'owner', status: EventStatus.RASCUNHO, startDate: new Date('2099-01-01'), endDate: new Date('2099-01-02'), cover: null };
  const prisma = {event: {findUnique: jest.fn().mockResolvedValue(event)}, eventCover: {upsert: jest.fn().mockResolvedValue({}), findFirst: jest.fn().mockResolvedValue(null)}};
  return {prisma, service:new EventsService(prisma as never)};
 };
 it('accepts a valid PNG for its owner', async () => { const {prisma,service}=setup(); await service.setCover('event',{id:'owner',role:UserRole.ORGANIZADOR},file); expect(prisma.eventCover.upsert).toHaveBeenCalledTimes(1); });
 it('rejects a different organizer', async () => { const {prisma,service}=setup(); await expect(service.setCover('event',{id:'other',role:UserRole.ORGANIZADOR},file)).rejects.toBeInstanceOf(ForbiddenException); expect(prisma.eventCover.upsert).not.toHaveBeenCalled(); });
 it('rejects mismatched content and MIME type', async () => { const {prisma,service}=setup(); await expect(service.setCover('event',{id:'owner',role:UserRole.ORGANIZADOR},{...file,mimetype:'image/jpeg'})).rejects.toBeInstanceOf(BadRequestException); expect(prisma.eventCover.upsert).not.toHaveBeenCalled(); });
 it('rejects files over 5 MB', async () => { const {service}=setup(); await expect(service.setCover('event',{id:'owner',role:UserRole.ORGANIZADOR},{buffer:Buffer.alloc(5*1024*1024+1),mimetype:'image/png'})).rejects.toBeInstanceOf(BadRequestException); });
});
