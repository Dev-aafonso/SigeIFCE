import {
  canCancelRegistration, historyParameters, registrationCsv,
} from '../../../shared/core/registration-history.mjs';

(() => {
  const $ = (id) => document.getElementById(id);
  const text = (id, value) => { const element = $(id); if (element) element.textContent = String(value ?? ''); };
  const formatDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  };
  const notify = (value, type = '') => {
    const element = $('mensagem-inscricoes');
    if (!element) return;
    element.textContent = String(value);
    element.dataset.tipo = type;
  };

  let root = null;
  let page = 1;
  let activeFilter = 'ALL';
  let history = [];
  let actions = [];
  let historySequence = 0;
  let selectorSequence = 0;
  let selected = new Set();
  let pendingCancel = null;
  let submitting = false;

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data.message || data.error || `Não foi possível concluir a operação (HTTP ${response.status}).`;
      throw new Error(Array.isArray(message) ? message.join(' ') : message);
    }
    return data;
  }

  function createCell(row, content) {
    const cell = document.createElement('td');
    if (content instanceof Node) cell.append(content);
    else cell.textContent = String(content ?? '—');
    row.append(cell);
    return cell;
  }

  function setBusy(busy) {
    if (root) root.setAttribute('aria-busy', String(busy));
    const refresh = root?.querySelector('[data-inscricao-action="refresh"]');
    if (refresh) refresh.disabled = busy;
  }

  function renderHistory(payload) {
    history = Array.isArray(payload.data) ? payload.data : [];
    const summary = payload.summary || {};
    text('total-inscricoes-ativas', summary.active ?? 0);
    text('total-inscricoes-canceladas', summary.cancelled ?? 0);
    text('total-inscricoes', summary.total ?? 0);
    text('contador-todas', summary.total ?? 0);
    text('contador-ativas', summary.active ?? 0);
    text('contador-canceladas', summary.cancelled ?? 0);

    const select = $('filtro-evento-inscricoes');
    if (select) {
      const previous = select.value;
      select.replaceChildren(new Option('Todos os eventos', ''));
      (payload.events || []).forEach((event) => select.add(new Option(event.title, event.id)));
      select.value = [...select.options].some((option) => option.value === previous) ? previous : '';
    }

    const table = $('lista-minhas-inscricoes');
    if (!table) return;
    table.replaceChildren();
    for (const registration of history) {
      const row = document.createElement('tr');
      createCell(row, registration.action?.event?.title);
      createCell(row, registration.action?.title);
      createCell(row, formatDate(registration.createdAt));
      createCell(row, registration.status === 'ACTIVE' ? 'Ativa' : 'Cancelada');
      const controls = document.createElement('div');
      controls.className = 'sige-inscricao-controles';
      const details = document.createElement('button');
      details.type = 'button'; details.className = 'botao-inscricao botao-inscricao-secundario';
      details.textContent = 'Detalhes';
      details.addEventListener('click', () => showDetails(registration));
      controls.append(details);
      if (registration.status === 'ACTIVE') {
        const cancel = document.createElement('button');
        cancel.type = 'button'; cancel.className = 'botao-inscricao botao-inscricao-secundario';
        cancel.textContent = 'Cancelar';
        cancel.disabled = !canCancelRegistration(registration);
        if (cancel.disabled) {
          cancel.title = 'Cancelamento indisponível: prazo inferior a 24h, presença/certificado emitido ou ação encerrada.';
          cancel.setAttribute('aria-label', 'Cancelamento indisponível para esta inscrição');
        }
        cancel.addEventListener('click', () => openCancellation(registration));
        controls.append(cancel);
      }
      createCell(row, controls);
      table.append(row);
    }
    const empty = $('estado-inscricoes');
    if (empty) {
      empty.hidden = history.length > 0;
      empty.textContent = history.length ? '' : 'Nenhuma inscrição encontrada para os filtros selecionados.';
    }
    const total = Number(payload.total) || 0;
    const pages = Math.max(1, Number(payload.pages) || 1);
    text('contagem-historico-inscricoes', `${total} inscrição(ões) encontrada(s). Página ${payload.page || 1} de ${pages}.`);
    const pagination = $('paginacao-inscricoes');
    if (pagination) {
      pagination.replaceChildren();
      for (const [label, target, disabled] of [
        ['Anterior', page - 1, page <= 1],
        ['Próxima', page + 1, page >= pages],
      ]) {
        const button = document.createElement('button');
        button.type = 'button'; button.textContent = label; button.disabled = disabled;
        button.className = 'botao-inscricao botao-inscricao-secundario';
        button.addEventListener('click', () => { page = target; loadHistory(); });
        pagination.append(button);
      }
    }
  }

  async function loadHistory() {
    if (!root) return;
    const currentRoot = root;
    const sequence = ++historySequence;
    setBusy(true);
    const filter = $('filtro-status-inscricoes')?.value || (activeFilter === 'ALL' ? '' : activeFilter);
    const query = historyParameters({
      page, limit: 10, search: $('busca-inscricoes')?.value ?? '',
      status: filter, eventId: $('filtro-evento-inscricoes')?.value ?? '',
    });
    try {
      const payload = await api(`/registrations/me?${query}`);
      if (sequence !== historySequence || !currentRoot.isConnected) return;
      renderHistory(payload);
      if ($('mensagem-inscricoes')?.dataset.tipo !== 'sucesso') notify('');
    } catch (error) {
      if (sequence !== historySequence || !currentRoot.isConnected) return;
      const table = $('lista-minhas-inscricoes');
      if (table) table.replaceChildren();
      const empty = $('estado-inscricoes');
      if (empty) { empty.hidden = false; empty.textContent = 'Não foi possível carregar suas inscrições.'; }
      text('contagem-historico-inscricoes', 'Falha na consulta.');
      notify(error.message, 'erro');
    } finally {
      if (sequence === historySequence && currentRoot.isConnected) setBusy(false);
    }
  }

  function showDetails(registration) {
    const list = $('lista-detalhes-inscricao');
    if (!list) return;
    list.replaceChildren();
    for (const [label, value] of [
      ['Evento', registration.action?.event?.title],
      ['Ação', registration.action?.title],
      ['Início', formatDate(registration.action?.startDate)],
      ['Fim', formatDate(registration.action?.endDate)],
      ['Local', registration.action?.location],
      ['Inscrição', formatDate(registration.createdAt)],
      ['Status', registration.status === 'ACTIVE' ? 'Ativa' : 'Cancelada'],
      ['Presença', registration.presence ? 'Registrada' : 'Não registrada'],
    ]) {
      const term = document.createElement('dt'); term.textContent = label;
      const description = document.createElement('dd'); description.textContent = value || '—';
      list.append(term, description);
    }
    $('dialog-detalhes-inscricao')?.showModal();
  }

  function openCancellation(registration) {
    if (!canCancelRegistration(registration)) return;
    pendingCancel = registration;
    text('mensagem-cancelamento-inscricao', '');
    text('descricao-cancelar-inscricao', `Cancelar sua inscrição em "${registration.action?.title}"? A vaga será liberada.`);
    $('dialog-cancelar-inscricao')?.showModal();
  }

  async function submitCancellation(event) {
    event.preventDefault();
    const action = event.submitter?.value;
    if (action !== 'confirm') { pendingCancel = null; $('dialog-cancelar-inscricao')?.close(); return; }
    if (!pendingCancel || submitting) return;
    const registration = pendingCancel;
    if (!canCancelRegistration(registration)) {
      text('mensagem-cancelamento-inscricao', 'Prazo de cancelamento encerrado.');
      return;
    }
    submitting = true;
    const button = root?.querySelector('[data-testid="confirm-cancellation"]');
    if (button) button.disabled = true;
    try {
      await api(`/registrations/actions/${encodeURIComponent(registration.actionId)}`, { method: 'DELETE' });
      $('dialog-cancelar-inscricao')?.close(); pendingCancel = null;
      notify('Inscrição cancelada com sucesso.', 'sucesso');
      await loadHistory();
    } catch (error) {
      text('mensagem-cancelamento-inscricao', error.message);
    } finally {
      submitting = false;
      if (button?.isConnected) button.disabled = false;
    }
  }

  function renderActions() {
    const container = $('lista-acoes-seletor');
    if (!container) return;
    container.replaceChildren();
    for (const action of actions) {
      const label = document.createElement('label'); label.className = 'cartao-certificado-item';
      const input = document.createElement('input');
      input.type = 'checkbox'; input.value = action.id; input.checked = selected.has(action.id);
      input.style.width = 'auto'; input.style.minHeight = 'auto';
      input.addEventListener('change', () => {
        if (input.checked) selected.add(action.id); else selected.delete(action.id);
        text('resumo-selecao-acoes', `${selected.size} ação(ões) selecionada(s)`);
        const confirm = $('confirmar-inscricao-acoes'); if (confirm) confirm.disabled = !selected.size;
      });
      const title = document.createElement('span'); title.textContent = `${action.title} — ${action.capacity} vagas totais`;
      label.append(input, title); container.append(label);
    }
    const confirm = $('confirmar-inscricao-acoes'); if (confirm) confirm.disabled = !selected.size;
    text('resumo-selecao-acoes', `${selected.size} ação(ões) selecionada(s)`);
    if (!actions.length) text('mensagem-seletor-acoes', 'Nenhuma ação ativa disponível neste evento.');
  }

  async function loadEvents() {
    const selector = $('seletor-evento-acoes');
    if (!selector) return;
    const sequence = ++selectorSequence;
    actions = []; selected.clear(); renderActions();
    selector.replaceChildren(new Option('Carregando eventos...', ''));
    try {
      const result = await api('/events?limit=100');
      if (sequence !== selectorSequence || !selector.isConnected) return;
      const events = Array.isArray(result) ? result : (result.data || []);
      selector.replaceChildren(new Option('Selecione o evento', ''));
      events.forEach((event) => selector.add(new Option(event.title || event.id, event.id)));
      text('mensagem-seletor-acoes', events.length ? 'Escolha um evento e selecione as ações.' : 'Nenhum evento publicado disponível.');
    } catch (error) {
      if (sequence !== selectorSequence) return;
      selector.replaceChildren(new Option('Eventos indisponíveis', ''));
      text('mensagem-seletor-acoes', error.message);
    }
  }

  async function loadActions() {
    const eventId = $('seletor-evento-acoes')?.value;
    const sequence = ++selectorSequence;
    selected.clear(); actions = []; renderActions();
    if (!eventId) return;
    text('mensagem-seletor-acoes', 'Carregando ações...');
    try {
      const result = await api(`/events/${encodeURIComponent(eventId)}/actions`);
      if (sequence !== selectorSequence || !root?.isConnected) return;
      const incoming = Array.isArray(result) ? result : (result.data || []);
      actions = incoming.filter((action) => action.status === 'ATIVA');
      renderActions();
      if (actions.length) text('mensagem-seletor-acoes', '');
    } catch (error) {
      if (sequence !== selectorSequence) return;
      text('mensagem-seletor-acoes', error.message);
    }
  }

  async function submitRegistration(event) {
    event.preventDefault();
    if (!selected.size || submitting) return;
    submitting = true;
    const button = $('confirmar-inscricao-acoes');
    if (button) button.disabled = true;
    let created = 0;
    const errors = [];
    for (const id of selected) {
      try { await api(`/registrations/actions/${encodeURIComponent(id)}`, { method: 'POST' }); created++; }
      catch (error) { errors.push(error.message); }
    }
    submitting = false;
    if (button?.isConnected) button.disabled = false;
    notify(`${created} inscrição(ões) realizada(s).${errors.length ? ' ' + errors.join(' ') : ''}`, errors.length ? 'erro' : 'sucesso');
    if (created) {
      $('dialog-seletor-acoes')?.close(); selected.clear(); page = 1;
      await loadHistory();
    }
  }

  function exportPage() {
    if (!history.length) { notify('Não há inscrições nesta página para exportar.', 'erro'); return; }
    const blob = new Blob([registrationCsv(history)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'sige-minhas-inscricoes-pagina.csv';
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('A página atual do histórico foi exportada em CSV.', 'sucesso');
  }

  window.inicializarModuloInscricoes = async () => {
    root = document.querySelector('.modulo-inscricoes');
    if (!root) return;
    page = 1; activeFilter = 'ALL'; history = []; selected = new Set(); pendingCancel = null;
    const query = () => { page = 1; loadHistory(); };
    root.querySelectorAll('[data-inscricao-action="open-selector"]').forEach((button) => button.addEventListener('click', () => {
      $('dialog-seletor-acoes')?.showModal(); loadEvents();
    }));
    root.querySelectorAll('[data-inscricao-action="close-selector"]').forEach((button) => button.addEventListener('click', () => $('dialog-seletor-acoes')?.close()));
    root.querySelectorAll('[data-inscricao-action="close-details"]').forEach((button) => button.addEventListener('click', () => $('dialog-detalhes-inscricao')?.close()));
    root.querySelectorAll('[data-inscricao-action="export"]').forEach((button) => button.addEventListener('click', exportPage));
    root.querySelectorAll('[data-inscricao-action="refresh"]').forEach((button) => button.addEventListener('click', loadHistory));
    root.querySelectorAll('[data-inscricao-filter]').forEach((button) => button.addEventListener('click', () => {
      if (button.hidden) return;
      root.querySelectorAll('[data-inscricao-filter]').forEach((other) => {
        other.classList.toggle('ativa', other === button);
        other.setAttribute('aria-pressed', String(other === button));
      });
      activeFilter = button.dataset.inscricaoFilter;
      const select = $('filtro-status-inscricoes'); if (select) select.value = activeFilter === 'ALL' ? '' : activeFilter;
      query();
    }));
    let searchTimer = null;
    $('filtros-inscricoes')?.addEventListener('submit', (event) => { event.preventDefault(); query(); });
    $('busca-inscricoes')?.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(query, 300);
    });
    $('filtro-evento-inscricoes')?.addEventListener('change', query);
    $('filtro-status-inscricoes')?.addEventListener('change', () => {
      activeFilter = $('filtro-status-inscricoes').value || 'ALL';
      root.querySelectorAll('[data-inscricao-filter]').forEach((button) => {
        const on = button.dataset.inscricaoFilter === activeFilter;
        button.classList.toggle('ativa', on); button.setAttribute('aria-pressed', String(on));
      });
      query();
    });
    $('seletor-evento-acoes')?.addEventListener('change', loadActions);
    $('form-seletor-acoes')?.addEventListener('submit', submitRegistration);
    $('form-confirmar-cancelamento')?.addEventListener('submit', submitCancellation);
    await loadHistory();
  };
})();
