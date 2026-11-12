import test from 'node:test';
import assert from 'node:assert/strict';
import { filterAttendance, attendanceSummary, flattenAttendance } from '../shared/core/attendance-list.mjs';
const actions = [{ id: 'a1', title: 'Oficina' }, { id: 'a2', title: 'Palestra' }];
const data = new Map([
  ['a1', [{ registrationId: 'r1', user: { name: 'Ana Maria', email: 'ana@ifce.edu.br' }, present: true }, { registrationId: 'r2', user: { name: 'Bruno', email: 'b@ifce.edu.br' }, present: false }]],
  ['a2', [{ registrationId: 'r3', user: { name: 'Carlos', email: 'c@ifce.edu.br' }, present: false }]],
]);
test('organiza participantes por ação sem perder inscrição', () => {
  const rows = flattenAttendance(actions, data);
  assert.deepEqual(rows.map((r) => r.actionId), ['a1', 'a1', 'a2']);
  assert.equal(rows[0].actionTitle, 'Oficina');
});
test('filtros por ação, presença e pesquisa combinados', () => {
  const rows = flattenAttendance(actions, data);
  assert.deepEqual(filterAttendance(rows, { actionId: 'a1', status: 'ABSENT', search: 'brU' }).map((r) => r.registrationId), ['r2']);
  assert.deepEqual(filterAttendance(rows, { search: 'ANA@IFCE' }).map((r) => r.registrationId), ['r1']);
  assert.deepEqual(filterAttendance(rows, { status: 'PRESENT' }).map((r) => r.registrationId), ['r1']);
});
test('contadores refletem os registros filtrados', () => {
  assert.deepEqual(attendanceSummary(flattenAttendance(actions, data)), { total: 3, present: 1, absent: 2 });
});
