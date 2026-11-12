import { attendanceSummary, filterAttendance, flattenAttendance } from '../../../shared/core/attendance-list.mjs';

(() => {
  const $ = (id) => document.getElementById(id);
  const text = (id, value) => { const el = $(id); if (el) el.textContent = String(value ?? ''); };
  const date = (value) => {
    if (!value) return '—';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString('pt-BR');
  };
  const api = async (path, options = {}) => {
    const response = await fetch(path, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
      ...options,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const msg = result.message || result.error || `Falha HTTP ${response.status}`;
      throw new Error(Array.isArray(msg) ? msg.join(' ') : String(msg));
    }
    return result;
  };
  let root;
  let eventData = null;
  let allRows = [];
  let requestSequence = 0;
  let pending = null;
  let saving = false;
  let matchingEvents = [];
  let searchSequence = 0;
  let searchTimer;

  async function searchEvents() {
    const input = $('id-evento-participantes');
    const term = input.value.trim();
    const sequence = ++searchSequence;
    if (matchingEvents.some((item) => `${item.title} (${item.id})` === term)) return;
    matchingEvents = [];
    $('eventos-participantes').replaceChildren();
    if (!term) return;
    try {
      const events = await api(`/events/manageable/search?title=${encodeURIComponent(term)}`);
      if (sequence !== searchSequence || !root?.isConnected) return;
      matchingEvents = events;
      for (const item of events) {
        const option = document.createElement('option');
        option.value = events.filter((other) => other.title === item.title).length > 1 ? `${item.title} (${item.id})` : item.title;
        option.label = item.startDate ? new Date(item.startDate).toLocaleDateString('pt-BR') : item.id;
        $('eventos-participantes').append(option);
      }
    } catch (error) { text('mensagem-participantes', `Não foi possível buscar eventos: ${error.message}`); }
  }

  function cell(tr, value) {
    const td = document.createElement('td');
    td.textContent = String(value ?? '—');
    tr.append(td);
    return td;
  }

  function render() {
    if (!root?.isConnected) return;
    const rows = filterAttendance(allRows, {
      actionId: $('filtro-acao-participantes')?.value,
      status: $('filtro-status-participantes')?.value,
      search: $('busca-participantes')?.value,
    });
    const summary = attendanceSummary(rows);
    text('total-inscritos-presenca', `${summary.total} inscritos`);
    text('total-presentes-presenca', `${summary.present} presentes`);
    text('total-ausentes-presenca', `${summary.absent} ausentes`);
    text('contagem-participantes', `${summary.total} participantes na seleção`);
    const tbody = $('lista-participantes');
    if (!tbody) return;
    tbody.replaceChildren();
    for (const participant of rows) {
      const tr = document.createElement('tr');
      const identity = cell(tr, '');
      const wrap = document.createElement('div'); wrap.className = 'identidade-participante';
      const avatar = document.createElement('span'); avatar.className = 'avatar-participante';
      avatar.textContent = (participant.user?.name || '?').split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase();
      const details = document.createElement('div');
      const name = document.createElement('strong'); name.textContent = participant.user?.name || 'Sem nome';
      const email = document.createElement('span'); email.textContent = participant.user?.email || '';
      details.append(name, email); wrap.append(avatar, details); identity.append(wrap);
      cell(tr, [participant.user?.enrollmentNumber, participant.user?.course].filter(Boolean).join(' / ') || 'Não informado');
      cell(tr, participant.user?.campus || 'Não informado');
      cell(tr, ({ ALUNO: 'Estudante', PROFESSOR: 'Professor', ORGANIZADOR: 'Organizador', ADMIN: 'Administrador' })[participant.user?.role] || 'Não informado');
      cell(tr, participant.user?.isActive === false ? 'Inativo' : 'Ativo');
      cell(tr, participant.actionTitle);
      cell(tr, date(participant.createdAt));
      cell(tr, participant.present ? 'Presente' : 'Ausente');
      cell(tr, participant.presence?.responsibleId || '—');
      const td = document.createElement('td');
      if (!participant.present) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'botao-inscricao botao-inscricao-primario';
        button.textContent = 'Registrar presença';
        button.dataset.registrationId = participant.registrationId;
        button.addEventListener('click', () => confirmParticipant(participant));
        td.append(button);
      } else {
        td.textContent = 'Registrada';
      }
      tr.append(td);
      tbody.append(tr);
    }
    text('estado-participantes', rows.length ? '' : 'Nenhum participante encontrado para os filtros selecionados.');
  }

  function confirmParticipant(participant) {
    if (saving || participant.present) return;
    pending = participant;
    text('descricao-confirmar-presenca', `Confirma a presença de ${participant.user?.name || 'participante'} na ação ${participant.actionTitle}?`);
    const dialog = $('dialog-confirmar-presenca');
    if (dialog?.showModal) dialog.showModal();
  }

  async function registerPresence() {
    if (!pending || saving) return;
    saving = true;
    const participant = pending;
    const button = $('confirmar-presenca');
    if (button) button.disabled = true;
    try {
      await api('/presences', { method: 'POST', body: JSON.stringify({ registrationId: participant.registrationId }) });
      $('dialog-confirmar-presenca')?.close();
      pending = null;
      text('mensagem-participantes', 'Presença registrada com sucesso.');
      await loadRows();
    } catch (error) {
      text('mensagem-participantes', `Não foi possível registrar a presença: ${error.message}`);
      $('dialog-confirmar-presenca')?.close();
      pending = null;
    } finally {
      saving = false;
      if (button) button.disabled = false;
    }
  }

  async function loadRows() {
    if (!eventData) return;
    const sequence = ++requestSequence;
    const actions = Array.isArray(eventData.actions) ? eventData.actions : [];
    text('estado-participantes', 'Carregando inscritos e presenças...');
    try {
      // A API atual disponibiliza uma lista por ação. Não retornar resultados parciais.
      const fetched = await Promise.all(actions.map(async (action) => {
        const result = await api(`/presences/actions/${encodeURIComponent(action.id)}/participants`);
        if (!Array.isArray(result)) throw new Error('Resposta de participantes inválida.');
        return [action.id, result];
      }));
      if (sequence !== requestSequence || !root?.isConnected) return;
      allRows = flattenAttendance(actions, new Map(fetched));
      $('resumo-frequencia').hidden = false;
      render();
      text('mensagem-participantes', `Lista atualizada: ${allRows.length} inscrições ativas.`);
    } catch (error) {
      if (sequence !== requestSequence || !root?.isConnected) return;
      allRows = [];
      $('lista-participantes')?.replaceChildren();
      $('resumo-frequencia').hidden = true;
      text('estado-participantes', 'Não foi possível obter a lista de presença.');
      text('mensagem-participantes', error.message);
    }
  }

  async function loadEvent(event) {
    event?.preventDefault();
    const value = $('id-evento-participantes')?.value.trim();
    if (!value) return;
    let matches = matchingEvents.filter((item) => item.title.toLocaleLowerCase('pt-BR') === value.toLocaleLowerCase('pt-BR') || `${item.title} (${item.id})` === value);
    if (!matches.length) {
      try {
        const found = await api(`/events/manageable/search?title=${encodeURIComponent(value)}`);
        matches = found.filter((item) => item.title.toLocaleLowerCase('pt-BR') === value.toLocaleLowerCase('pt-BR'));
      } catch (error) { text('mensagem-participantes', error.message); return; }
    }
    if (matches.length > 1) { text('mensagem-participantes', 'Há eventos com o mesmo nome. Escolha uma das sugestões para identificá-lo.'); return; }
    const id = matches[0]?.id || value;
    ++requestSequence;
    eventData = null;
    allRows = [];
    $('lista-participantes')?.replaceChildren();
    $('filtros-lista-participantes').hidden = true;
    $('resumo-evento-participantes').hidden = true;
    $('resumo-frequencia').hidden = true;
    text('mensagem-participantes', 'Consultando evento...');
    const sequence = requestSequence;
    try {
      const result = await api(`/events/${encodeURIComponent(id)}/manage`);
      if (sequence !== requestSequence || !root?.isConnected) return;
      eventData = result;
      const summary = $('resumo-evento-participantes');
      const title = document.createElement('strong');
      title.textContent = result.title || 'Evento';
      const count = document.createElement('p');
      count.textContent = `${(result.actions || []).length} ações cadastradas`;
      summary.replaceChildren(title, count);
      summary.hidden = false;
      const select = $('filtro-acao-participantes');
      select.replaceChildren(new Option('Todas as ações', ''));
      for (const action of result.actions || []) select.add(new Option(action.title, action.id));
      $('filtros-lista-participantes').hidden = false;
      await loadRows();
    } catch (error) {
      if (sequence !== requestSequence || !root?.isConnected) return;
      text('mensagem-participantes', error.message);
      text('estado-participantes', 'Não foi possível carregar o evento.');
    }
  }

  window.inicializarModuloParticipantes = () => {
    const currentRoot = document.querySelector('.modulo-participantes');
    if (!currentRoot || currentRoot.dataset.initialized === 'true') return;
    currentRoot.dataset.initialized = 'true';
    root = currentRoot;
    eventData = null;
    allRows = [];
    ++requestSequence;
    pending = null;
    $('form-evento-participantes')?.addEventListener('submit', loadEvent);
    $('id-evento-participantes')?.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(searchEvents, 250); });
    $('atualizar-participantes')?.addEventListener('click', () => {
      if (eventData) void loadRows();
      else text('mensagem-participantes', 'Informe o nome do evento.');
    });
    for (const id of ['filtro-acao-participantes', 'filtro-status-participantes', 'busca-participantes']) {
      $(id)?.addEventListener(id === 'busca-participantes' ? 'input' : 'change', render);
    }
    $('confirmar-presenca')?.addEventListener('click', registerPresence);
    $('cancelar-confirmacao-presenca')?.addEventListener('click', () => {
      pending = null;
      $('dialog-confirmar-presenca')?.close();
    });
    $('dialog-confirmar-presenca')?.addEventListener('close', () => { pending = null; });
    // Sem token assinado de ingresso e endpoint de validação, câmera/QR não devem ser habilitados.
    $('abrir-leitor-presenca').disabled = true;
    text('estado-leitor-presenca', 'Leitura por QR Code ainda não disponível. Use o registro manual confirmado.');
  };
})();
