/** Utilitários puros compartilháveis com testes Node, sem depender do DOM. */
export const CANCELLATION_WINDOW_MS = 24 * 60 * 60 * 1000;

export function canCancelRegistration(registration, now = Date.now()) {
  const start = Date.parse(registration?.action?.startDate ?? '');
  return registration?.status === 'ACTIVE'
    && registration.action?.status === 'ATIVA'
    && Number.isFinite(start)
    && start - now >= CANCELLATION_WINDOW_MS
    && !registration.presence
    && !registration.certificate;
}

export function historyParameters({ page = 1, limit = 10, search = '', status = '', eventId = '' } = {}) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  const term = String(search).trim();
  if (term) params.set('search', term);
  if (status && status !== 'ALL') params.set('status', status);
  if (eventId) params.set('eventId', eventId);
  return params.toString();
}

export function registrationCsv(rows) {
  const escape = (value) => {
    const text = String(value ?? '').replace(/\r?\n/g, ' ').replace(/^([=+@\-\t\r])/, "'$1");
    return `"${text.replace(/"/g, '""')}"`;
  };
  const header = ['Evento', 'Ação', 'Inscrição', 'Status', 'Data da ação'];
  const lines = rows.map((row) => [
    row.action?.event?.title, row.action?.title, row.createdAt,
    row.status === 'ACTIVE' ? 'Ativa' : 'Cancelada', row.action?.startDate,
  ].map(escape).join(';'));
  return '\uFEFF' + [header.map(escape).join(';'), ...lines].join('\r\n');
}
