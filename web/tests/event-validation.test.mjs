import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildActionPayload,
    buildEventPayload
} from '../shared/core/event-validation.mjs';

const eventWindow = {
    startDate: '2026-11-01T09:00:00.000Z',
    endDate: '2026-11-02T18:00:00.000Z'
};

test('builds a trimmed valid event payload', () => {
    assert.deepEqual(buildEventPayload({
        title: '  Encontro Científico ',
        description: ' Uma descrição válida para este evento. ',
        startDate: '2026-11-01T09:00',
        endDate: '2026-11-02T18:00',
        location: ' Campus Central '
    }), {
        title: 'Encontro Científico',
        description: 'Uma descrição válida para este evento.',
        startDate: new Date('2026-11-01T09:00').toISOString(),
        endDate: new Date('2026-11-02T18:00').toISOString(),
        location: 'Campus Central'
    });
});

test('rejects missing, too short, or reversed event fields', () => {
    assert.throws(() => buildEventPayload({
        title: 'Oi',
        description: 'Descrição suficientemente extensa.',
        startDate: '2026-11-02T18:00',
        endDate: '2026-11-01T09:00'
    }), /título/);
    assert.throws(() => buildEventPayload({
        title: 'Evento válido',
        description: 'curta',
        startDate: '2026-11-01T09:00',
        endDate: '2026-11-02T18:00'
    }), /descrição/);
    assert.throws(() => buildEventPayload({
        title: 'Evento válido',
        description: 'Uma descrição válida para este evento.',
        startDate: '2026-11-02T18:00',
        endDate: '2026-11-01T09:00'
    }), /depois do início/);
});

test('calculates action duration and normalizes action fields', () => {
    assert.deepEqual(buildActionPayload({
        title: 'Palestra',
        description: 'Descrição da palestra.',
        startDate: '2026-11-01T10:00',
        endDate: '2026-11-01T11:30',
        capacity: '40',
        location: ' Auditório '
    }, eventWindow), {
        title: 'Palestra',
        description: 'Descrição da palestra.',
        startDate: new Date('2026-11-01T10:00').toISOString(),
        endDate: new Date('2026-11-01T11:30').toISOString(),
        durationMinutes: 90,
        capacity: 40,
        location: 'Auditório'
    });
});

test('rejects actions outside the event, invalid duration, and non-positive capacity', () => {
    const base = {
        title: 'Palestra',
        description: 'Descrição da palestra.',
        startDate: '2026-11-01T10:00',
        endDate: '2026-11-01T11:00',
        capacity: '10'
    };
    assert.throws(() => buildActionPayload({
        ...base,
        startDate: '2026-10-31T23:00'
    }, eventWindow), /integralmente dentro/);
    assert.throws(() => buildActionPayload({
        ...base,
        endDate: '2026-11-02T19:00'
    }, eventWindow), /integralmente dentro/);
    assert.throws(() => buildActionPayload({
        ...base,
        endDate: '2026-11-01T10:00'
    }, eventWindow), /duração/);
    assert.throws(() => buildActionPayload({
        ...base,
        capacity: '0'
    }, eventWindow), /capacidade/);
});
