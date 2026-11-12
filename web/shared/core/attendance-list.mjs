export function filterAttendance(rows, { actionId = '', status = '', search = '' } = {}) {
  const term = String(search).trim().toLocaleLowerCase('pt-BR');
  return rows.filter((item) => {
    if (actionId && item.actionId !== actionId) return false;
    if (status === 'PRESENT' && !item.present) return false;
    if (status === 'ABSENT' && item.present) return false;
    const name = String(item.user?.name ?? '');
    const email = String(item.user?.email ?? '');
    return !term || `${name} ${email}`.toLocaleLowerCase('pt-BR').includes(term);
  });
}

export function attendanceSummary(rows) {
  const present = rows.filter((row) => row.present).length;
  return { total: rows.length, present, absent: rows.length - present };
}

export function flattenAttendance(actions, dataByAction) {
  const rows = [];
  for (const action of actions) {
    const registrations = dataByAction.get(action.id) || [];
    for (const registration of registrations) {
      rows.push({ ...registration, actionId: action.id, actionTitle: action.title });
    }
  }
  return rows;
}
