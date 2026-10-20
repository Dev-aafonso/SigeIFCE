import test from 'node:test';
import assert from 'node:assert/strict';
import {
    MODULES,
    ROLES,
    canAccessModule,
    getAllowedModules,
    getRoleLabel,
    isKnownModule,
    isKnownRole,
    normalizeRole
} from '../shared/core/access-control.mjs';

test('accepts only the supported application roles', () => {
    assert.deepEqual(ROLES, ['ADMIN', 'ORGANIZADOR', 'PROFESSOR', 'ALUNO']);
    for (const role of ROLES) assert.equal(isKnownRole(role), true);
    assert.equal(isKnownRole('ADM'), false);
    assert.equal(isKnownRole(''), false);
    assert.equal(isKnownRole(null), false);
});

test('normalizes case and whitespace in role names', () => {
    assert.equal(normalizeRole('  organizador '), 'ORGANIZADOR');
    assert.equal(canAccessModule(' aluno ', 'events'), true);
});

test('grants administrators access to every registered module', () => {
    for (const module of MODULES) assert.equal(canAccessModule('ADMIN', module), true);
});

test('limits user management to administrators', () => {
    assert.equal(canAccessModule('ADMIN', 'users'), true);
    for (const role of ['ORGANIZADOR', 'PROFESSOR', 'ALUNO']) {
        assert.equal(canAccessModule(role, 'users'), false);
    }
});

test('limits management and administration areas to their intended profiles', () => {
    assert.equal(canAccessModule('ORGANIZADOR', 'participants'), true);
    assert.equal(canAccessModule('PROFESSOR', 'participants'), false);
    assert.equal(canAccessModule('ALUNO', 'participants'), false);
    assert.equal(canAccessModule('ORGANIZADOR', 'reports'), true);
    assert.equal(canAccessModule('ALUNO', 'reports'), false);
    assert.equal(canAccessModule('ORGANIZADOR', 'settings'), true);
    assert.equal(canAccessModule('PROFESSOR', 'settings'), false);
});

test('denies unknown modules and unknown profiles by default', () => {
    assert.equal(isKnownModule('not-a-module'), false);
    assert.equal(canAccessModule('ADMIN', 'not-a-module'), false);
    assert.equal(canAccessModule('not-a-role', 'dashboard'), false);
    assert.deepEqual(getAllowedModules('not-a-role'), []);
});

test('labels each supported profile for the role-aware dashboard', () => {
    assert.equal(getRoleLabel('ADMIN'), 'Administrador');
    assert.equal(getRoleLabel('ORGANIZADOR'), 'Organizador');
    assert.equal(getRoleLabel('PROFESSOR'), 'Professor');
    assert.equal(getRoleLabel('ALUNO'), 'Aluno');
});
