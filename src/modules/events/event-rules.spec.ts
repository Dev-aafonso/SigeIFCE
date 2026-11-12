import { describe, expect, it } from '@jest/globals';
import { effectiveEventStatus, validateEventRules } from './event-rules';
const start = new Date('2026-10-27T12:00:00Z'), end = new Date('2026-10-27T14:00:00Z');
const complete = { title: 'Evento', description: 'Descricao completa', location: 'IFCE', category: 'Oficina',
  workloadMinutes: 60, totalCapacity: 2, startDate: start, endDate: end,
  registrationStartDate: new Date('2026-10-26T12:00:00Z'), registrationEndDate: start };
describe('RN06 e RN07', () => {
  it('permite rascunho legado incompleto e exige RN06 ao publicar', () => {
    const legacy = { title: 'Evento', description: 'Descricao completa', startDate: start, endDate: end };
    expect(() => validateEventRules(legacy)).not.toThrow();
    expect(() => validateEventRules(legacy, true)).toThrow('RN06');
    expect(() => validateEventRules(complete, true)).not.toThrow();
  });
  it.each([{ totalCapacity: 0 }, { workloadMinutes: -1 }, { totalCapacity: 1.5 },
    { registrationEndDate: new Date('2026-10-28T00:00:00Z') }, { registrationStartDate: null }])('rejeita %j', (patch) => expect(() => validateEventRules({ ...complete, ...patch })).toThrow());
  it('transiciona nos limites exatos e preserva estados finais/rascunho', () => {
    expect(effectiveEventStatus('PUBLICADO', start, end, new Date(start.getTime() - 1))).toBe('PUBLICADO');
    expect(effectiveEventStatus('PUBLICADO', start, end, start)).toBe('EM_ANDAMENTO');
    expect(effectiveEventStatus('EM_ANDAMENTO', start, end, end)).toBe('ENCERRADO');
    for (const status of ['RASCUNHO', 'CANCELADO', 'ENCERRADO'] as const)
      expect(effectiveEventStatus(status, start, end, end)).toBe(status);
  });
});
