export const ROLE_LABELS = Object.freeze({
    ADMIN: 'Administrador',
    ORGANIZADOR: 'Organizador',
    PROFESSOR: 'Professor',
    ALUNO: 'Aluno'
});

export const MODULE_LABELS = Object.freeze({
    dashboard: 'Painel',
    events: 'Eventos',
    registrations: 'Inscrições',
    participants: 'Participantes',
    certificates: 'Certificados',
    reports: 'Relatórios',
    users: 'Usuários',
    settings: 'Configurações'
});

const ROLE_MODULES = Object.freeze({
    ADMIN: Object.freeze(Object.keys(MODULE_LABELS)),
    ORGANIZADOR: Object.freeze([
        'dashboard',
        'events',
        'registrations',
        'participants',
        'certificates',
        'reports',
        'settings'
    ]),
    PROFESSOR: Object.freeze([
        'dashboard',
        'events',
        'registrations',
        'certificates'
    ]),
    ALUNO: Object.freeze([
        'dashboard',
        'events',
        'registrations',
        'certificates'
    ])
});

export const ROLES = Object.freeze(Object.keys(ROLE_MODULES));
export const MODULES = Object.freeze(Object.keys(MODULE_LABELS));

export function normalizeRole(role) {
    return typeof role === 'string' ? role.trim().toUpperCase() : '';
}

export function isKnownRole(role) {
    return ROLES.includes(normalizeRole(role));
}

export function isKnownModule(module) {
    return module === 'auth' || MODULES.includes(module);
}

export function canAccessModule(role, module) {
    const normalizedRole = normalizeRole(role);
    if (module === 'auth') return true;
    return ROLE_MODULES[normalizedRole]?.includes(module) ?? false;
}

export function getAllowedModules(role) {
    return [...(ROLE_MODULES[normalizeRole(role)] || [])];
}

export function getRoleLabel(role) {
    return ROLE_LABELS[normalizeRole(role)] || 'Perfil não reconhecido';
}
