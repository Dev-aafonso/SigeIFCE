import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEventPayload } from '../shared/core/event-validation.mjs';
const base = { title: 'Evento IFCE', description: 'Descricao completa', startDate: '2026-10-28T12:00:00Z', endDate: '2026-10-28T14:00:00Z' };
test('RN06 normaliza janela, vagas e carga horaria sem impor campos novos ao legado', () => {
  assert.equal(buildEventPayload(base).totalCapacity, undefined);
  const data = buildEventPayload({ ...base, category: ' Oficina ', totalCapacity: '2', workloadMinutes: '60',
    registrationStartDate: '2026-10-27T12:00:00Z', registrationEndDate: '2026-10-28T12:00:00Z' });
  assert.equal(data.category, 'Oficina'); assert.equal(data.totalCapacity, 2); assert.equal(data.workloadMinutes, 60);
  assert.equal(data.registrationStartDate, '2026-10-27T12:00:00.000Z');
  assert.throws(() => buildEventPayload({ ...base, totalCapacity: '0' }));
  assert.throws(() => buildEventPayload({ ...base, registrationStartDate: base.endDate, registrationEndDate: base.startDate }));
});
