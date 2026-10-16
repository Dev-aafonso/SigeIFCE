/* Sprint 8 — Dashboard e Relatórios. Sem dependências externas de gráficos. */
(function () {
  'use strict';

  const API = {
    filters: '/dashboard/filters',
    overview: '/dashboard/overview',
    events: '/dashboard/events',
    actions: '/dashboard/actions',
    reports: '/reports',
  };

  const STATUS_LABELS = {
    RASCUNHO: 'Rascunho', PUBLICADO: 'Publicado', ENCERRADO: 'Encerrado', CANCELADO: 'Cancelado',
    ATIVA: 'Ativa', ACTIVE: 'Ativa', CANCELADA: 'Cancelada', CANCELLED: 'Cancelada',
    PRESENTE: 'Presente', AUSENTE: 'Ausente', REVOGADO: 'Revogado', VÁLIDO: 'Válido',
  };

  function formatNumber(value) {
    return new Intl.NumberFormat('pt-BR').format(Number(value || 0));
  }

  function formatPercent(value) {
    return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(Number(value || 0))}%`;
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Fortaleza' }).format(date);
  }

  function statusLabel(value) {
    return STATUS_LABELS[value] || String(value || 'Não informado').replaceAll('_', ' ');
  }

  function statusClass(value) {
    if (['CANCELADO', 'CANCELADA', 'CANCELLED', 'REVOGADO', 'AUSENTE'].includes(value)) return 'is-red';
    if (['RASCUNHO', 'ENCERRADO', 'ENCERRADA'].includes(value)) return 'is-gray';
    return '';
  }

  function queryString(form, omitType) {
    const params = new URLSearchParams();
    if (!form) return params.toString();
    const values = new FormData(form);
    for (const [key, value] of values.entries()) {
      if (omitType && key === 'type') continue;
      const text = String(value || '').trim();
      if (text) params.set(key, text);
    }
    return params.toString();
  }

  async function getJson(url) {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    let data;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = { message: await response.text() };
    }
    if (!response.ok) {
      const message = Array.isArray(data && data.message) ? data.message.join(' ') : data && data.message;
      if (response.status === 401) throw new Error('Sua sessão expirou ou não foi encontrada. Entre novamente no SIGE IFCE.');
      if (response.status === 403) throw new Error('Seu perfil não possui permissão para consultar esses dados.');
      throw new Error(message || `Não foi possível consultar o servidor (HTTP ${response.status}).`);
    }
    return data;
  }

  function showNotice(root, message, isError) {
    const notice = root.querySelector('[data-s8-notice]');
    if (!notice) return;
    notice.hidden = !message;
    notice.textContent = message || '';
    notice.classList.toggle('is-error', Boolean(isError));
  }

  function setBusy(root, busy, message) {
    root.setAttribute('aria-busy', busy ? 'true' : 'false');
    const buttons = root.querySelectorAll('button[type="submit"], [data-s8-refresh]');
    buttons.forEach((button) => {
      button.disabled = busy;
      if (button.hasAttribute('data-s8-refresh')) button.textContent = busy ? 'Atualizando…' : '↻ Atualizar dados';
    });
    if (message) showNotice(root, message, false);
  }

  function addOption(select, value, label) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }

  function fillFilters(form, payload) {
    const eventSelect = form.querySelector('select[name="eventId"]');
    const actionSelect = form.querySelector('select[name="actionId"]');
    const previousEvent = eventSelect ? eventSelect.value : '';
    const previousAction = actionSelect ? actionSelect.value : '';

    if (eventSelect) {
      eventSelect.replaceChildren();
      addOption(eventSelect, '', 'Todos os eventos permitidos');
      (payload.events || []).forEach((event) => {
        addOption(eventSelect, event.id, `${event.title} · ${statusLabel(event.status)}`);
      });
      if ([...eventSelect.options].some((option) => option.value === previousEvent)) eventSelect.value = previousEvent;
    }

    if (actionSelect) {
      actionSelect.replaceChildren();
      addOption(actionSelect, '', 'Todas as ações');
      const selectedEvent = eventSelect ? eventSelect.value : '';
      const actions = (payload.actions || []).filter((action) => !selectedEvent || action.eventId === selectedEvent);
      actions.forEach((action) => addOption(actionSelect, action.id, `${action.title} · ${statusLabel(action.status)}`));
      if ([...actionSelect.options].some((option) => option.value === previousAction)) actionSelect.value = previousAction;
    }
  }

  async function refreshFilters(form, preserveCurrent) {
    const params = new URLSearchParams();
    ['startDateFrom', 'startDateTo'].forEach((name) => {
      const field = form.elements.namedItem(name);
      if (field && field.value) params.set(name, field.value);
    });
    const eventSelect = form.querySelector('select[name="eventId"]');
    if (eventSelect && eventSelect.value) params.set('eventId', eventSelect.value);
    const url = `${API.filters}${params.toString() ? `?${params.toString()}` : ''}`;
    const payload = await getJson(url);
    const eventBefore = preserveCurrent && eventSelect ? eventSelect.value : '';
    const actionSelect = form.querySelector('select[name="actionId"]');
    const actionBefore = preserveCurrent && actionSelect ? actionSelect.value : '';
    fillFilters(form, payload);
    if (eventSelect && eventBefore) eventSelect.value = eventBefore;
    if (actionSelect && actionBefore && [...actionSelect.options].some((option) => option.value === actionBefore)) {
      actionSelect.value = actionBefore;
    }
  }

  function createCell(row, value, className) {
    const cell = document.createElement('td');
    if (className) cell.className = className;
    if (value instanceof Node) cell.appendChild(value);
    else cell.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
    row.appendChild(cell);
    return cell;
  }

  function makeStatus(value) {
    const badge = document.createElement('span');
    badge.className = `s8-status-pill ${statusClass(value)}`.trim();
    badge.textContent = statusLabel(value);
    return badge;
  }

  function renderEmpty(tbody, columns, message) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = columns;
    cell.className = 's8-empty';
    cell.textContent = message;
    row.appendChild(cell);
    tbody.replaceChildren(row);
  }

  function renderTrend(container, trend) {
    container.replaceChildren();
    if (!trend || !trend.length) {
      const empty = document.createElement('p');
      empty.className = 's8-empty';
      empty.textContent = 'Não há inscrições para o período da série histórica.';
      container.appendChild(empty);
      return;
    }
    const maximum = Math.max(1, ...trend.map((item) => Number(item.registrations || 0)));
    trend.forEach((item) => {
      const wrapper = document.createElement('div');
      wrapper.className = 's8-trend-item';
      const value = document.createElement('span');
      value.className = 's8-trend-value';
      value.textContent = formatNumber(item.registrations);
      const track = document.createElement('div');
      track.className = 's8-trend-track';
      track.setAttribute('role', 'img');
      track.setAttribute('aria-label', `${item.label}: ${formatNumber(item.registrations)} inscrições`);
      const bar = document.createElement('div');
      bar.className = 's8-trend-bar';
      bar.style.height = `${Math.max(3, (Number(item.registrations || 0) / maximum) * 100)}%`;
      track.appendChild(bar);
      const label = document.createElement('span');
      label.className = 's8-trend-label';
      label.textContent = item.label;
      wrapper.append(value, track, label);
      container.appendChild(wrapper);
    });
  }

  function renderStatusList(container, items) {
    container.replaceChildren();
    if (!items || !items.length) {
      const empty = document.createElement('p');
      empty.className = 's8-empty';
      empty.textContent = 'Sem registros para os filtros aplicados.';
      container.appendChild(empty);
      return;
    }
    const maximum = Math.max(1, ...items.map((item) => Number(item.count || 0)));
    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 's8-status-row';
      const label = document.createElement('span');
      label.textContent = statusLabel(item.status);
      const track = document.createElement('div');
      track.className = 's8-status-track';
      const fill = document.createElement('div');
      fill.className = 's8-status-fill';
      fill.style.width = `${Math.max(0, (Number(item.count || 0) / maximum) * 100)}%`;
      track.appendChild(fill);
      const count = document.createElement('span');
      count.className = 's8-status-count';
      count.textContent = formatNumber(item.count);
      row.append(label, track, count);
      container.appendChild(row);
    });
  }

  function renderEventTable(tbody, events) {
    if (!events || !events.length) return renderEmpty(tbody, 4, 'Nenhum evento encontrado para os filtros aplicados.');
    tbody.replaceChildren();
    events.forEach((event) => {
      const row = document.createElement('tr');
      createCell(row, event.title);
      createCell(row, makeStatus(event.status));
      createCell(row, formatDate(event.startDate));
      createCell(row, formatNumber(event.actionCount));
      tbody.appendChild(row);
    });
  }

  function renderActionTable(tbody, actions) {
    if (!actions || !actions.length) return renderEmpty(tbody, 6, 'Nenhuma ação encontrada para os filtros aplicados.');
    tbody.replaceChildren();
    actions.forEach((action) => {
      const row = document.createElement('tr');
      createCell(row, action.title);
      createCell(row, action.eventTitle);
      createCell(row, makeStatus(action.status));
      createCell(row, `${formatNumber(action.activeRegistrations)} / ${formatNumber(action.capacity)}`);
      createCell(row, `${formatNumber(action.presentRegistrations)} (${formatNumber(action.absentRegistrations)} ausentes)`);
      const occupancy = document.createElement('div');
      occupancy.textContent = formatPercent(action.occupancyPercent);
      const progress = document.createElement('div');
      progress.className = 's8-progress';
      const fill = document.createElement('span');
      fill.style.width = `${Math.max(0, Math.min(100, Number(action.occupancyPercent || 0)))}%`;
      progress.appendChild(fill);
      occupancy.appendChild(progress);
      createCell(row, occupancy);
      tbody.appendChild(row);
    });
  }

  async function renderDashboard(root) {
    const form = root.querySelector('[data-s8-dashboard-filter]');
    if (!form) return;
    setBusy(root, true, 'Consultando dados reais do SIGE IFCE…');
    try {
      const query = queryString(form);
      const suffix = query ? `?${query}` : '';
      const [overview, events, actions] = await Promise.all([
        getJson(`${API.overview}${suffix}`),
        getJson(`${API.events}${suffix}`),
        getJson(`${API.actions}${suffix}`),
      ]);
      const totals = overview.totals || {};
      root.querySelectorAll('[data-s8-kpi]').forEach((element) => {
        const key = element.getAttribute('data-s8-kpi');
        const value = totals[key];
        element.textContent = key === 'attendanceRate' ? formatPercent(value) : formatNumber(value);
      });
      renderTrend(root.querySelector('[data-s8-trend]'), overview.registrationTrend);
      renderStatusList(root.querySelector('[data-s8-event-statuses]'), overview.eventStatuses);
      renderStatusList(root.querySelector('[data-s8-action-statuses]'), overview.actionStatuses);
      renderEventTable(root.querySelector('[data-s8-events-table]'), events);
      renderActionTable(root.querySelector('[data-s8-actions-table]'), actions);
      const generated = root.querySelector('[data-s8-generated-at]');
      if (generated) generated.textContent = `Dados consultados em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Fortaleza' }).format(new Date(overview.generatedAt))}. Os indicadores são calculados no backend a partir do banco de dados do SIGE IFCE.`;
      showNotice(root, 'Indicadores atualizados com sucesso.', false);
    } catch (error) {
      showNotice(root, error instanceof Error ? error.message : 'Erro inesperado ao consultar o dashboard.', true);
    } finally {
      setBusy(root, false);
    }
  }

  function initDashboard(root) {
    if (root.dataset.s8Ready === 'true') return;
    root.dataset.s8Ready = 'true';
    const form = root.querySelector('[data-s8-dashboard-filter]');
    const refresh = root.querySelector('[data-s8-refresh]');
    if (!form) return;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      renderDashboard(root);
    });
    form.addEventListener('reset', () => {
      window.setTimeout(() => {
        refreshFilters(form, false).catch((error) => showNotice(root, error.message, true)).finally(() => renderDashboard(root));
      }, 0);
    });
    form.elements.namedItem('eventId').addEventListener('change', () => {
      const actionSelect = form.querySelector('select[name="actionId"]');
      if (actionSelect) actionSelect.value = '';
      refreshFilters(form, false).catch((error) => showNotice(root, error.message, true));
    });
    if (refresh) refresh.addEventListener('click', () => renderDashboard(root));
    refreshFilters(form, false)
      .then(() => renderDashboard(root))
      .catch((error) => showNotice(root, error instanceof Error ? error.message : 'Falha ao carregar filtros.', true));
  }

  function renderReport(payload, root) {
    const heading = root.querySelector('[data-s8-report-title]');
    const summary = root.querySelector('[data-s8-report-summary]');
    const total = root.querySelector('[data-s8-report-total]');
    const head = root.querySelector('[data-s8-report-head]');
    const body = root.querySelector('[data-s8-report-body]');
    const limit = root.querySelector('[data-s8-report-limit]');
    if (heading) heading.textContent = payload.title || 'Resultado da consulta';
    if (summary) summary.textContent = `Gerado em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Fortaleza' }).format(new Date(payload.generatedAt))}. Os dados respeitam o perfil e os filtros aplicados.`;
    if (total) total.textContent = `${formatNumber(payload.total)} ${payload.total === 1 ? 'registro' : 'registros'}`;
    if (limit) limit.hidden = !payload.truncated;
    head.replaceChildren();
    const headerRow = document.createElement('tr');
    (payload.columns || []).forEach((column) => {
      const th = document.createElement('th');
      th.textContent = column;
      headerRow.appendChild(th);
    });
    head.appendChild(headerRow);
    if (!payload.rows || !payload.rows.length) {
      renderEmpty(body, Math.max(1, (payload.columns || []).length), 'Nenhum registro encontrado para os filtros informados.');
      return;
    }
    body.replaceChildren();
    payload.rows.forEach((item) => {
      const row = document.createElement('tr');
      (payload.columns || []).forEach((column) => {
        const value = item[column];
        let shown = value;
        if (column.toLowerCase().includes('data') || column === 'Início' || column === 'Término') {
          // Backend returns display-ready date strings. Preserve them unchanged.
          shown = value;
        }
        if (column.toLowerCase().includes('status') || column === 'Situação') {
          createCell(row, makeStatus(String(value || '')));
        } else {
          createCell(row, shown === null || shown === undefined || shown === '' ? '—' : String(shown));
        }
      });
      body.appendChild(row);
    });
  }

  async function runReport(root) {
    const form = root.querySelector('[data-s8-report-filter]');
    if (!form) return;
    setBusy(root, true, 'Consultando relatório…');
    try {
      const type = String(form.elements.namedItem('type').value || 'events');
      const params = queryString(form, true);
      const payload = await getJson(`${API.reports}/${encodeURIComponent(type)}${params ? `?${params}` : ''}`);
      renderReport(payload, root);
      showNotice(root, 'Relatório atualizado. Você já pode exportar o resultado em PDF ou CSV.', false);
    } catch (error) {
      showNotice(root, error instanceof Error ? error.message : 'Erro inesperado ao consultar o relatório.', true);
    } finally {
      setBusy(root, false);
    }
  }

  function initReports(root) {
    if (root.dataset.s8Ready === 'true') return;
    root.dataset.s8Ready = 'true';
    const form = root.querySelector('[data-s8-report-filter]');
    if (!form) return;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      runReport(root);
    });
    form.addEventListener('reset', () => {
      window.setTimeout(() => {
        refreshFilters(form, false).catch((error) => showNotice(root, error.message, true));
      }, 0);
    });
    form.elements.namedItem('eventId').addEventListener('change', () => {
      const actionSelect = form.querySelector('select[name="actionId"]');
      if (actionSelect) actionSelect.value = '';
      refreshFilters(form, false).catch((error) => showNotice(root, error.message, true));
    });
    root.querySelectorAll('[data-s8-export]').forEach((button) => {
      button.addEventListener('click', () => {
        const type = String(form.elements.namedItem('type').value || 'events');
        const params = new URLSearchParams(queryString(form, true));
        params.set('format', button.getAttribute('data-s8-export') || 'csv');
        window.location.assign(`${API.reports}/${encodeURIComponent(type)}/export?${params.toString()}`);
      });
    });
    refreshFilters(form, false)
      .then(() => runReport(root))
      .catch((error) => showNotice(root, error instanceof Error ? error.message : 'Falha ao carregar filtros.', true));
  }

  function initWithin(node) {
    if (!(node instanceof Element || node instanceof Document)) return;
    if (node.matches && node.matches('[data-s8-dashboard]')) initDashboard(node);
    if (node.matches && node.matches('[data-s8-reports]')) initReports(node);
    node.querySelectorAll && node.querySelectorAll('[data-s8-dashboard]').forEach(initDashboard);
    node.querySelectorAll && node.querySelectorAll('[data-s8-reports]').forEach(initReports);
  }

  function attachStylesheet() {
    if (document.querySelector('link[data-sige-sprint8-style]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/sprint8.css';
    link.setAttribute('data-sige-sprint8-style', 'true');
    document.head.appendChild(link);
  }

  function start() {
    attachStylesheet();
    initWithin(document);
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) initWithin(node);
      }));
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
