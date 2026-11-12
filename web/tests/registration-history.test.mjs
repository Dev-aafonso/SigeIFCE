import test from 'node:test';
import assert from 'node:assert/strict';
import { canCancelRegistration, historyParameters, registrationCsv, CANCELLATION_WINDOW_MS } from '../shared/core/registration-history.mjs';

const now = Date.UTC(2026, 9, 26, 15);
const registration = (hours = 48) => ({
  status: 'ACTIVE',
  action: { status: 'ATIVA', startDate: new Date(now + hours * 3600000).toISOString() },
  presence: null, certificate: null,
});

test('permite cancelamento até exatamente 24 horas antes da ação', () => {
  assert.equal(canCancelRegistration(registration(24), now), true);
  assert.equal(canCancelRegistration(registration(23), now), false);
  assert.equal(canCancelRegistration(registration(-1), now), false);
  assert.equal(CANCELLATION_WINDOW_MS, 86400000);
});

test('proíbe cancelamento de inscrição cancelada, presença, certificado ou ação encerrada', () => {
  assert.equal(canCancelRegistration({ ...registration(), status: 'CANCELLED' }, now), false);
  assert.equal(canCancelRegistration({ ...registration(), presence: { id: 'p' } }, now), false);
  assert.equal(canCancelRegistration({ ...registration(), certificate: { id: 'c' } }, now), false);
  assert.equal(canCancelRegistration({ ...registration(), action: { status: 'ENCERRADA', startDate: new Date(now + 86400000).toISOString() } }, now), false);
});

test('filtros e paginação geram query segura e previsível', () => {
  assert.equal(historyParameters({ page: 2, status: 'ACTIVE', search: ' palestra ', eventId: 'e1' }), 'page=2&limit=10&search=palestra&status=ACTIVE&eventId=e1');
  assert.equal(historyParameters({ status: 'ALL' }), 'page=1&limit=10');
});

test('CSV neutraliza fórmulas e protege campos com delimitador e aspas', () => {
  const csv = registrationCsv([{
    createdAt: '2026-10-26', status: 'ACTIVE',
    action: { title: '=1+1', startDate: '2026-10-30', event: { title: 'Seminário; "IFCE"' } },
  }]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"Seminário; ""IFCE"""'));
  assert.ok(csv.includes('"\'=1+1"'));
});
