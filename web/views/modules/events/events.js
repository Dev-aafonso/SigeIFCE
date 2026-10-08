import {
    buildActionPayload,
    buildEventPayload
} from '../../../shared/core/event-validation.mjs';

(() => {
    const PAGE_SIZE = 20;
    const EVENTS_API = '/events';
    const ACTIONS_API = '/actions';
    const EVENT_STATUSES = {
        RASCUNHO: 'Rascunho',
        PUBLICADO: 'Publicado',
        ENCERRADO: 'Encerrado',
        CANCELADO: 'Cancelado'
    };
    const ACTION_STATUSES = {
        ATIVA: 'Ativa',
        ENCERRADA: 'Encerrada',
        CANCELADA: 'Cancelada'
    };

    let currentPage = 1;
    let currentManagerEvent = null;
    let searchSequence = 0;
    let currentRole = '';
    let createWizardStep = 0;
    let draftActionSequence = 0;

    const byId = (id) => document.getElementById(id);

    function showMessage(text, type = '') {
        const message = byId('mensagem-eventos');
        if (!message) return;
        message.textContent = text;
        message.dataset.tipo = type;
    }

    function currentUser() {
        try {
            const user = JSON.parse(localStorage.getItem('sige_user') || '{}');
            return user && typeof user === 'object' ? user : {};
        } catch (error) {
            console.error('Não foi possível ler o perfil local.', error);
            return {};
        }
    }

    function canManage() {
        return ['ADMIN', 'ORGANIZADOR'].includes(currentRole);
    }

    function managerStorageKey() {
        const user = currentUser();
        const identity = user.id || user.email || 'unknown';
        return `sige_managed_events_${identity}`;
    }

    function getSavedEvents() {
        try {
            const saved = JSON.parse(localStorage.getItem(managerStorageKey()) || '[]');
            return Array.isArray(saved) ? saved.filter((event) =>
                event && typeof event.id === 'string' && typeof event.title === 'string'
            ) : [];
        } catch (error) {
            console.error('Não foi possível ler os eventos salvos neste navegador.', error);
            return [];
        }
    }

    function saveManagedEvent(event) {
        if (!event?.id) return;
        const saved = getSavedEvents().filter((item) => item.id !== event.id);
        saved.unshift({ id: event.id, title: event.title || event.id });
        try {
            localStorage.setItem(managerStorageKey(), JSON.stringify(saved.slice(0, 30)));
        } catch (error) {
            console.error('Não foi possível salvar o evento neste navegador.', error);
        }
        renderSavedEvents();
    }

    function renderSavedEvents() {
        const select = byId('eventos-recentes');
        if (!select) return;
        const selected = select.value;
        select.replaceChildren();
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Selecione um evento salvo';
        select.append(placeholder);

        getSavedEvents().forEach((event) => {
            const option = document.createElement('option');
            option.value = event.id;
            option.textContent = event.title;
            select.append(option);
        });
        if (getSavedEvents().some((event) => event.id === selected)) select.value = selected;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    function formatDate(value) {
        if (!value) return 'Não informado';
        const date = new Date(value);
        return Number.isNaN(date.getTime())
            ? 'Data inválida'
            : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
    }

    function formatEventListDate(value) {
        if (!value) return 'Não informado';
        const date = new Date(value);
        return Number.isNaN(date.getTime())
            ? 'Data inválida'
            : new Intl.DateTimeFormat('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            }).format(date);
    }

    function toLocalDateTime(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
        return local.toISOString().slice(0, 16);
    }

    async function api(path, options = {}) {
        const token = localStorage.getItem('sige_access_token');
        const headers = {
            Accept: 'application/json',
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...(token ? { Authorization: 'Bearer ' + token } : {}),
            ...options.headers
        };

        let response;
        try {
            response = await fetch(path, { ...options, headers });
        } catch {
            throw new Error('Não foi possível conectar à API. Verifique a conexão e tente novamente.');
        }

        const text = await response.text();
        const contentType = response.headers.get('content-type') || '';
        let data = {};
        if (text && contentType.includes('application/json')) {
            try {
                data = JSON.parse(text);
            } catch {
                throw new Error('A API retornou uma resposta JSON inválida.');
            }
        } else if (text) {
            data.message = new DOMParser().parseFromString(text, 'text/html').body.textContent.trim();
        }

        if (!response.ok) {
            const errorMessage = data.message || data.error || `A solicitação falhou (HTTP ${response.status}).`;
            throw new Error(Array.isArray(errorMessage) ? errorMessage.join(' ') : errorMessage);
        }
        return data;
    }

    function makeButton(label, className, action, value = '') {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `botao-evento ${className}`;
        button.dataset.eventAction = action;
        if (value) button.dataset.value = value;
        button.textContent = label;
        return button;
    }

    function renderActionSummary(action, editable = false, allowRegistration = false) {
        const card = document.createElement('article');
        card.className = 'item-acao-evento';
        const heading = document.createElement('div');
        heading.className = 'cabecalho-cartao-evento';
        const title = document.createElement('strong');
        title.textContent = action.title || 'Ação sem título';
        const status = document.createElement('span');
        status.className = 'status-acao';
        status.textContent = ACTION_STATUSES[action.status] || action.status || 'Status desconhecido';
        heading.append(title, status);

        const details = document.createElement('p');
        details.className = 'detalhes-acao-evento';
        details.textContent = `${formatDate(action.startDate)} – ${formatDate(action.endDate)} · ${action.durationMinutes ?? '?'} min · capacidade: ${action.capacity ?? '—'}${action.location ? ` · ${action.location}` : ''}`;
        const description = document.createElement('p');
        description.className = 'cartao-evento-descricao';
        description.textContent = action.description || '';
        card.append(heading, details, description);

        if (editable && action.status === 'ATIVA') {
            const controls = document.createElement('div');
            controls.className = 'acoes-acao-evento';
            controls.append(
                makeButton('Editar ação', 'botao-evento-secundario', 'edit-action', action.id),
                makeButton('Encerrar', 'botao-evento-secundario', 'close-action', action.id),
                makeButton('Cancelar ação', 'botao-evento-perigo', 'cancel-action', action.id)
            );
            card.append(controls);
        } else if (allowRegistration && action.status === 'ATIVA') {
            const controls = document.createElement('div');
            controls.className = 'acoes-acao-evento';
            controls.append(makeButton('Inscrever-se nesta ação', 'botao-evento-primario', 'register-action', action.id));
            card.append(controls);
        }
        return card;
    }

    function addDraftAction(form) {
        const container = byId('acoes-rascunho-evento');
        if (!container) return;
        const index = ++draftActionSequence;
        const card = document.createElement('article');
        card.className = 'formulario-acao-rascunho';
        card.dataset.draftAction = String(index);
        card.innerHTML = `
            <div class="cabecalho-acao-rascunho">
                <h5>Ação ${container.children.length + 1}</h5>
                <button class="botao-remover-acao-rascunho" type="button" data-event-action="remove-draft-action">Remover</button>
            </div>
            <label class="campo-evento"><span>Título da ação *</span><input data-draft-field="title" required minlength="3" maxlength="200"></label>
            <label class="campo-evento"><span>Descrição *</span><textarea data-draft-field="description" required minlength="3" maxlength="5000" rows="2"></textarea></label>
            <div class="campos-data-evento">
                <label class="campo-evento"><span>Início *</span><input data-draft-field="startDate" type="datetime-local" required></label>
                <label class="campo-evento"><span>Término *</span><input data-draft-field="endDate" type="datetime-local" required></label>
            </div>
            <div class="campos-data-evento">
                <label class="campo-evento"><span>Capacidade *</span><input data-draft-field="capacity" type="number" min="1" step="1" required value="1"></label>
                <label class="campo-evento"><span>Local</span><input data-draft-field="location" maxlength="255"></label>
            </div>`;

        const start = form.elements.namedItem('startDate')?.value;
        const end = form.elements.namedItem('endDate')?.value;
        card.querySelector('[data-draft-field="startDate"]').value = start || '';
        card.querySelector('[data-draft-field="endDate"]').value = end || '';
        container.append(card);
        updateDraftActionLabels();
    }

    function updateDraftActionLabels() {
        byId('acoes-rascunho-evento')?.querySelectorAll('.formulario-acao-rascunho h5')
            .forEach((heading, index) => { heading.textContent = `Ação ${index + 1}`; });
    }

    function readDraftActions(eventPayload) {
        const cards = [...(byId('acoes-rascunho-evento')?.querySelectorAll('[data-draft-action]') || [])];
        if (!cards.length) throw new Error('Adicione pelo menos uma ação à programação do evento.');
        return cards.map((card) => {
            const value = (field) => card.querySelector(`[data-draft-field="${field}"]`).value;
            return buildActionPayload({
                title: value('title'),
                description: value('description'),
                startDate: value('startDate'),
                endDate: value('endDate'),
                capacity: value('capacity'),
                location: value('location')
            }, eventPayload);
        });
    }

    function renderEventDraftSummary(eventPayload, actions) {
        const summary = byId('resumo-rascunho-evento');
        if (!summary) return;
        summary.replaceChildren();
        const title = document.createElement('h5');
        title.textContent = eventPayload.title;
        const details = document.createElement('dl');
        [
            ['Descrição', eventPayload.description],
            ['Período', `${formatDate(eventPayload.startDate)} – ${formatDate(eventPayload.endDate)}`],
            ['Local', eventPayload.location || 'Não informado']
        ].forEach(([label, value]) => {
            const term = document.createElement('dt');
            term.textContent = label;
            const description = document.createElement('dd');
            description.textContent = value;
            details.append(term, description);
        });
        summary.append(title, details);

        const actionsHeading = document.createElement('h5');
        actionsHeading.textContent = `Programação (${actions.length} ${actions.length === 1 ? 'ação' : 'ações'})`;
        summary.append(actionsHeading);
        actions.forEach((action) => {
            const item = document.createElement('div');
            item.className = 'resumo-acao-rascunho';
            const actionTitle = document.createElement('strong');
            actionTitle.textContent = action.title;
            const actionInfo = document.createElement('p');
            actionInfo.textContent = `${formatDate(action.startDate)} – ${formatDate(action.endDate)} · ${action.durationMinutes} min · capacidade: ${action.capacity}${action.location ? ` · ${action.location}` : ''}`;
            const actionDescription = document.createElement('p');
            actionDescription.textContent = action.description;
            item.append(actionTitle, actionInfo, actionDescription);
            summary.append(item);
        });
    }

    function validateDraftStep(step) {
        const form = byId('form-criar-evento');
        const error = byId('erro-wizard-evento');
        error.textContent = '';
        try {
            if (step === 0) {
                const fields = [...form.querySelector('[data-wizard-step="0"]').querySelectorAll('input, textarea')];
                const invalidField = fields.find((input) => !input.checkValidity());
                if (invalidField) {
                    invalidField.reportValidity();
                    return false;
                }
                readEventForm(form);
                return true;
            }
            const eventPayload = readEventForm(form);
            const actions = readDraftActions(eventPayload);
            if (step === 2) renderEventDraftSummary(eventPayload, actions);
            return true;
        } catch (validationError) {
            error.textContent = validationError.message;
            return false;
        }
    }

    function showCreateWizardStep(step) {
        createWizardStep = step;
        document.querySelectorAll('#form-criar-evento [data-wizard-step]').forEach((section, index) => {
            section.hidden = index !== step;
        });
        document.querySelectorAll('#form-criar-evento [data-wizard-indicator]').forEach((indicator, index) => {
            indicator.classList.toggle('ativa', index === step);
            indicator.classList.toggle('concluida', index < step);
            if (index === step) indicator.setAttribute('aria-current', 'step');
            else indicator.removeAttribute('aria-current');
        });
        byId('voltar-etapa-evento').hidden = step === 0;
        byId('avancar-etapa-evento').hidden = step === 2;
        byId('salvar-rascunho-evento').hidden = step !== 2;
        byId('descricao-wizard-evento').textContent = [
            'Preencha as informações gerais do evento.',
            'Configure as ações que farão parte da programação.',
            'Confira os dados do evento e suas ações antes de salvar.'
        ][step];
        byId('erro-wizard-evento').textContent = '';
    }

    function resetCreateWizard() {
        const form = byId('form-criar-evento');
        form.reset();
        byId('acoes-rascunho-evento').replaceChildren();
        draftActionSequence = 0;
        addDraftAction(form);
        showCreateWizardStep(0);
    }

    function renderPublicEvent(event) {
        const row = document.createElement('tr');
        row.dataset.eventId = event.id;
        const titleCell = document.createElement('td');
        titleCell.dataset.label = 'Evento';
        const title = document.createElement('div');
        title.className = 'titulo-evento-tabela';
        const titleText = document.createElement('strong');
        titleText.textContent = event.title || 'Evento sem título';
        const description = document.createElement('span');
        description.textContent = event.description || '';
        title.append(titleText, description);
        titleCell.append(title);

        const dateCell = document.createElement('td');
        dateCell.dataset.label = 'Data';
        dateCell.textContent = formatEventListDate(event.startDate);
        const locationCell = document.createElement('td');
        locationCell.dataset.label = 'Local';
        locationCell.textContent = event.location || 'Não informado';
        const statusCell = document.createElement('td');
        statusCell.dataset.label = 'Status';
        const status = document.createElement('span');
        status.className = 'status-evento';
        status.dataset.status = event.status || 'PUBLICADO';
        status.textContent = EVENT_STATUSES[event.status] || event.status || 'Publicado';
        statusCell.append(status);

        const actionCell = document.createElement('td');
        actionCell.dataset.label = 'Ações';
        const actionButtons = document.createElement('div');
        actionButtons.className = 'acoes-linha-evento';
        const detailsButton = document.createElement('button');
        detailsButton.type = 'button';
        detailsButton.className = 'botao-detalhes-evento';
        detailsButton.dataset.eventAction = 'toggle-public-details';
        detailsButton.setAttribute('aria-expanded', 'false');
        detailsButton.textContent = 'Detalhes';
        actionButtons.append(detailsButton);
        if (Array.isArray(event.actions) && event.actions.length) {
            const hasAvailableAction = event.actions.some((action) => action.status === 'ATIVA');
            const canRegister = Boolean(localStorage.getItem('sige_access_token'));
            if (canRegister && hasAvailableAction) {
                detailsButton.textContent = 'Ações e detalhes';
            }
        }
        detailsButton.dataset.collapsedLabel = detailsButton.textContent;
        actionCell.append(actionButtons);

        const detailsRow = document.createElement('tr');
        detailsRow.className = 'detalhes-evento-publico';
        detailsRow.hidden = true;
        const detailsCell = document.createElement('td');
        detailsCell.colSpan = 5;
        const detailsCard = document.createElement('article');
        detailsCard.className = 'cartao-evento';

        const period = document.createElement('p');
        period.className = 'detalhes-evento';
        period.textContent = `Período: ${formatDate(event.startDate)} – ${formatDate(event.endDate)} · Organização: ${event.organizer?.email || 'Não informada'} · ID: ${event.id}`;
        const descriptionBlock = document.createElement('p');
        descriptionBlock.className = 'cartao-evento-descricao';
        descriptionBlock.textContent = event.description || '';
        detailsCard.append(period, descriptionBlock);

        if (Array.isArray(event.actions) && event.actions.length) {
            const actions = document.createElement('section');
            actions.className = 'lista-acoes-evento';
            const actionsHeading = document.createElement('h5');
            actionsHeading.textContent = `Ações do evento (${event.actions.length})`;
            actions.append(actionsHeading);
            const canRegister = Boolean(localStorage.getItem('sige_access_token'));
            event.actions.forEach((action) => actions.append(renderActionSummary(action, false, canRegister)));
            detailsCard.append(actions);
        } else {
            const empty = document.createElement('p');
            empty.className = 'detalhes-evento';
            empty.textContent = 'Este evento ainda não possui ações disponíveis.';
            detailsCard.append(empty);
        }

        detailsCell.append(detailsCard);
        detailsRow.append(detailsCell);
        row.append(titleCell, dateCell, locationCell, statusCell, actionCell);
        return [row, detailsRow];
    }

    function setPublicLoading(text) {
        const list = byId('lista-eventos-publicos');
        if (!list) return;
        list.setAttribute('aria-busy', 'true');
        list.replaceChildren();
        const message = document.createElement('td');
        message.colSpan = 5;
        const row = document.createElement('tr');
        message.textContent = text;
        row.append(message);
        list.append(row);
    }

    async function loadPublicEvents(page = 1) {
        const list = byId('lista-eventos-publicos');
        const pagination = byId('paginacao-eventos');
        const form = byId('filtros-eventos');
        if (!list || !pagination || !form) return;

        currentPage = page;
        const sequence = ++searchSequence;
        setPublicLoading('Buscando eventos publicados...');
        pagination.replaceChildren();

        const query = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
        const formData = new FormData(form);
        const title = String(formData.get('title') || '').trim();
        const startDateFrom = String(formData.get('startDateFrom') || '');
        const startDateTo = String(formData.get('startDateTo') || '');
        if (title) query.set('title', title);
        if (startDateFrom) query.set('startDateFrom', new Date(`${startDateFrom}T00:00:00`).toISOString());
        if (startDateTo) query.set('startDateTo', new Date(`${startDateTo}T23:59:59.999`).toISOString());

        if (startDateFrom && startDateTo && startDateTo < startDateFrom) {
            setPublicLoading('A data final deve ser igual ou posterior à data inicial.');
            list.setAttribute('aria-busy', 'false');
            showMessage('Revise o intervalo de datas dos filtros.', 'erro');
            return;
        }

        try {
            const result = await api(`${EVENTS_API}?${query.toString()}`);
            if (sequence !== searchSequence) return;
            if (!result || !Array.isArray(result.data) || !result.meta) {
                throw new Error('A API retornou uma lista de eventos em formato inesperado.');
            }
            list.replaceChildren();
            list.setAttribute('aria-busy', 'false');
            if (!result.data.length) {
                setPublicLoading('Nenhum evento publicado corresponde aos filtros informados.');
            } else {
                result.data.forEach((event) => {
                    renderPublicEvent(event).forEach((row) => list.append(row));
                });
            }

            const pageNumber = Number(result.meta.page) || page;
            const pages = Number(result.meta.pages) || 0;
            if (pageNumber > 1) {
                const previous = makeButton('Anterior', 'botao-evento-secundario', 'previous-page');
                pagination.append(previous);
            }
            const pageInfo = document.createElement('span');
            pageInfo.className = 'detalhes-evento';
            pageInfo.textContent = `Página ${pageNumber}${pages ? ` de ${pages}` : ''} · ${Number(result.meta.total) || 0} evento(s)`;
            pagination.append(pageInfo);
            if (pages && pageNumber < pages) {
                const next = makeButton('Próxima', 'botao-evento-secundario', 'next-page');
                pagination.append(next);
            }
            showMessage('');
        } catch (error) {
            if (sequence !== searchSequence) return;
            setPublicLoading(error.message);
            list.setAttribute('aria-busy', 'false');
            showMessage(error.message, 'erro');
        }
    }

    function renderEventEditForm(event) {
        const form = document.createElement('form');
        form.className = 'formulario-editar-evento';
        form.dataset.formType = 'edit-event';
        form.innerHTML = `
            <h5>Dados do evento</h5>
            <label class="campo-evento"><span>Título *</span><input name="title" required minlength="3" maxlength="200" value="${escapeHtml(event.title)}"></label>
            <label class="campo-evento"><span>Descrição *</span><textarea name="description" required minlength="10" maxlength="5000" rows="4">${escapeHtml(event.description)}</textarea></label>
            <div class="campos-data-evento">
                <label class="campo-evento"><span>Início *</span><input name="startDate" type="datetime-local" required value="${toLocalDateTime(event.startDate)}"></label>
                <label class="campo-evento"><span>Término *</span><input name="endDate" type="datetime-local" required value="${toLocalDateTime(event.endDate)}"></label>
            </div>
            <label class="campo-evento"><span>Local</span><input name="location" maxlength="255" value="${escapeHtml(event.location)}"></label>
            <div class="acoes-formulario-evento">
                <button class="botao-evento botao-evento-primario" type="submit">Salvar alterações</button>
            </div>`;
        return form;
    }

    function renderActionForm(event, action = null) {
        const form = document.createElement('form');
        form.className = 'formulario-acao-evento';
        form.dataset.formType = action ? 'edit-action' : 'create-action';
        if (action) form.dataset.actionId = action.id;
        const startValue = action?.startDate ? toLocalDateTime(action.startDate) : toLocalDateTime(event.startDate);
        const endValue = action?.endDate ? toLocalDateTime(action.endDate) : toLocalDateTime(event.endDate);
        form.innerHTML = `
            <h5>${action ? 'Editar ação' : 'Adicionar ação'}</h5>
            <label class="campo-evento"><span>Título *</span><input name="title" required minlength="3" maxlength="200" value="${escapeHtml(action?.title || '')}"></label>
            <label class="campo-evento"><span>Descrição *</span><textarea name="description" required minlength="3" maxlength="5000" rows="3">${escapeHtml(action?.description || '')}</textarea></label>
            <div class="campos-data-evento">
                <label class="campo-evento"><span>Início *</span><input name="startDate" type="datetime-local" required value="${startValue}"></label>
                <label class="campo-evento"><span>Término *</span><input name="endDate" type="datetime-local" required value="${endValue}"></label>
            </div>
            <div class="campos-data-evento">
                <label class="campo-evento"><span>Capacidade *</span><input name="capacity" type="number" min="1" step="1" required value="${escapeHtml(action?.capacity ?? 1)}"></label>
                <label class="campo-evento"><span>Local</span><input name="location" maxlength="255" value="${escapeHtml(action?.location || '')}"></label>
            </div>
            <p class="detalhes-evento">A duração será calculada entre início e término; o backend valida que a ação ocorra dentro do evento.</p>
            <div class="acoes-formulario-evento">
                <button class="botao-evento botao-evento-primario" type="submit">${action ? 'Salvar ação' : 'Adicionar ação'}</button>
                ${action ? '<button class="botao-evento botao-evento-secundario" type="button" data-event-action="cancel-edit-action">Fechar edição</button>' : ''}
            </div>`;
        return form;
    }

    function renderManagedEvent(event) {
        currentManagerEvent = event;
        saveManagedEvent(event);
        const panel = byId('painel-gerenciamento-evento');
        if (!panel) return;
        panel.replaceChildren();

        const card = document.createElement('article');
        card.className = 'cartao-gerenciamento-evento';
        const heading = document.createElement('div');
        heading.className = 'cabecalho-gerenciamento-evento';
        const summary = document.createElement('div');
        const title = document.createElement('h4');
        title.textContent = event.title || 'Evento sem título';
        const details = document.createElement('p');
        details.className = 'detalhes-evento';
        details.textContent = `${EVENT_STATUSES[event.status] || event.status} · ID: ${event.id} · ${formatDate(event.startDate)} – ${formatDate(event.endDate)}`;
        summary.append(title, details);

        const controls = document.createElement('div');
        controls.className = 'acoes-gerenciamento-evento';
        if (['RASCUNHO', 'PUBLICADO'].includes(event.status)) {
            controls.append(makeButton('Editar evento', 'botao-evento-secundario', 'edit-event'));
        }
        if (event.status === 'RASCUNHO') {
            const publish = makeButton('Publicar', 'botao-evento-primario', 'publish-event');
            const hasActiveAction = Array.isArray(event.actions) &&
                event.actions.some((action) => action.status === 'ATIVA');
            const eventHasNotEnded = new Date(event.endDate).getTime() > Date.now();
            publish.disabled = !hasActiveAction || !eventHasNotEnded;
            if (!hasActiveAction) publish.title = 'Adicione pelo menos uma ação antes de publicar.';
            else if (!eventHasNotEnded) publish.title = 'Não é possível publicar um evento que já terminou.';
            controls.append(publish);
        }
        if (event.status === 'PUBLICADO') {
            controls.append(makeButton('Encerrar evento', 'botao-evento-secundario', 'close-event'));
        }
        if (['RASCUNHO', 'PUBLICADO'].includes(event.status)) {
            controls.append(makeButton('Cancelar evento', 'botao-evento-perigo', 'cancel-event'));
        }
        heading.append(summary, controls);
        card.append(heading);
        if (['RASCUNHO', 'PUBLICADO'].includes(event.status)) {
            card.append(renderEventEditForm(event));
        }

        const actionsSection = document.createElement('section');
        actionsSection.className = 'lista-acoes-gerenciaveis';
        const actionsTitle = document.createElement('h5');
        actionsTitle.textContent = 'Ações do evento';
        actionsSection.append(actionsTitle);

        const actions = Array.isArray(event.actions) ? event.actions : [];
        if (actions.length) {
            actions.forEach((action) => actionsSection.append(renderActionSummary(
                action,
                ['RASCUNHO', 'PUBLICADO'].includes(event.status)
            )));
        } else {
            const empty = document.createElement('p');
            empty.className = 'detalhes-evento';
            empty.textContent = event.status === 'RASCUNHO'
                ? 'Este evento ainda não possui ações. Adicione pelo menos uma para poder publicá-lo.'
                : 'Este evento não possui ações cadastradas.';
            actionsSection.append(empty);
        }

        if (canManage() && ['RASCUNHO', 'PUBLICADO'].includes(event.status)) {
            actionsSection.append(renderActionForm(event));
        }
        card.append(actionsSection);
        panel.append(card);
    }

    async function openManagedEvent(id) {
        const eventId = id.trim();
        if (!eventId) {
            showMessage('Informe o identificador do evento.', 'erro');
            return;
        }
        showMessage('Carregando evento e verificando seu escopo...');
        byId('painel-gerenciamento-evento')?.replaceChildren();
        try {
            const event = await api(`${EVENTS_API}/${encodeURIComponent(eventId)}/manage`);
            if (!event || event.id !== eventId) {
                throw new Error('A API retornou um evento diferente do solicitado.');
            }
            renderManagedEvent(event);
            showMessage('Evento carregado. As ações disponíveis respeitam o status atual.', 'sucesso');
            return true;
        } catch (error) {
            currentManagerEvent = null;
            showMessage(error.message, 'erro');
            return false;
        }
    }

    function readEventForm(form) {
        const data = new FormData(form);
        return buildEventPayload({
            title: data.get('title'),
            description: data.get('description'),
            startDate: data.get('startDate'),
            endDate: data.get('endDate'),
            location: data.get('location')
        });
    }

    function readActionForm(form) {
        const data = new FormData(form);
        return buildActionPayload({
            title: data.get('title'),
            description: data.get('description'),
            startDate: data.get('startDate'),
            endDate: data.get('endDate'),
            capacity: data.get('capacity'),
            location: data.get('location')
        }, currentManagerEvent);
    }

    async function createEvent(form) {
        const button = form.querySelector('[type="submit"]');
        button.disabled = true;
        const wizardError = byId('erro-wizard-evento');
        try {
            const payload = readEventForm(form);
            const actions = readDraftActions(payload);
            const event = await api(EVENTS_API, { method: 'POST', body: JSON.stringify(payload) });
            if (!event?.id) {
                byId('dialog-criar-evento').close();
                resetCreateWizard();
                showMessage('A API não retornou o identificador do evento criado. Confirme se o rascunho foi registrado antes de tentar criar outro para evitar duplicatas.', 'erro');
                return;
            }
            saveManagedEvent(event);
            byId('dialog-criar-evento').close();
            const opened = await openManagedEvent(event.id);
            if (!opened) {
                resetCreateWizard();
                showMessage(`Evento criado com ID ${event.id}, mas a API não permitiu abrir seu gerenciamento.`, 'erro');
                return;
            }

            try {
                for (const action of actions) {
                    await api(`${EVENTS_API}/${encodeURIComponent(event.id)}/actions`, {
                        method: 'POST',
                        body: JSON.stringify(action)
                    });
                }
            } catch (actionError) {
                resetCreateWizard();
                let refreshFailure = '';
                try {
                    const updated = await api(`${EVENTS_API}/${encodeURIComponent(event.id)}/manage`);
                    renderManagedEvent(updated);
                } catch (refreshError) {
                    refreshFailure = ` Não foi possível atualizar o painel: ${refreshError.message}`;
                }
                showMessage(`O rascunho ${event.id} foi criado, mas uma ação não foi salva: ${actionError.message} Confira as ações existentes antes de tentar novamente para evitar duplicatas.${refreshFailure}`, 'erro');
                return;
            }

            resetCreateWizard();
            try {
                const updated = await api(`${EVENTS_API}/${encodeURIComponent(event.id)}/manage`);
                renderManagedEvent(updated);
                showMessage('Evento e programação criados como rascunho. Revise os dados antes de publicar.', 'sucesso');
            } catch (refreshError) {
                showMessage(`Evento e programação foram salvos no rascunho ${event.id}, mas não foi possível atualizar o painel: ${refreshError.message}`, 'erro');
            }
        } catch (creationError) {
            if (byId('dialog-criar-evento').open) {
                wizardError.textContent = creationError.message;
            } else {
                showMessage(creationError.message, 'erro');
            }
        } finally {
            button.disabled = false;
        }
    }

    async function saveEventChanges(form) {
        if (!currentManagerEvent) return;
        const button = form.querySelector('[type="submit"]');
        button.disabled = true;
        try {
            const event = await api(`${EVENTS_API}/${encodeURIComponent(currentManagerEvent.id)}`, {
                method: 'PATCH',
                body: JSON.stringify(readEventForm(form))
            });
            renderManagedEvent(event);
            showMessage('Alterações do evento salvas.', 'sucesso');
        } catch (error) {
            showMessage(error.message, 'erro');
        } finally {
            button.disabled = false;
        }
    }

    async function saveAction(form) {
        if (!currentManagerEvent) return;
        const button = form.querySelector('[type="submit"]');
        button.disabled = true;
        try {
            const payload = readActionForm(form);
            const actionId = form.dataset.actionId;
            const path = actionId
                ? `${ACTIONS_API}/${encodeURIComponent(actionId)}`
                : `${EVENTS_API}/${encodeURIComponent(currentManagerEvent.id)}/actions`;
            const action = await api(path, {
                method: actionId ? 'PATCH' : 'POST',
                body: JSON.stringify(payload)
            });
            const updated = await api(`${EVENTS_API}/${encodeURIComponent(currentManagerEvent.id)}/manage`);
            renderManagedEvent(updated);
            showMessage(actionId ? 'Ação atualizada.' : 'Ação adicionada ao evento.', 'sucesso');
        } catch (error) {
            showMessage(error.message, 'erro');
        } finally {
            button.disabled = false;
        }
    }

    async function transition(path, label) {
        if (!currentManagerEvent) return;
        try {
            await api(path, { method: 'POST' });
            const updated = await api(`${EVENTS_API}/${encodeURIComponent(currentManagerEvent.id)}/manage`);
            renderManagedEvent(updated);
            showMessage(label, 'sucesso');
        } catch (error) {
            showMessage(error.message, 'erro');
        }
    }

    async function registerForAction(actionId, button) {
        button.disabled = true;
        button.textContent = 'Inscrevendo...';
        try {
            const action = await api(`${ACTIONS_API}/${encodeURIComponent(actionId)}`);
            if (action?.id !== actionId || action.status !== 'ATIVA' || action.event?.status !== 'PUBLICADO') {
                throw new Error('Esta ação não está mais disponível para inscrição.');
            }
            const result = await api(`/registrations/actions/${encodeURIComponent(actionId)}`, {
                method: 'POST'
            });
            if (!result?.id || result.actionId !== actionId) {
                throw new Error('A API não confirmou a inscrição nesta ação.');
            }
            button.textContent = 'Inscrito';
            showMessage('Inscrição realizada nesta ação.', 'sucesso');
        } catch (error) {
            button.disabled = false;
            button.textContent = 'Inscrever-se nesta ação';
            showMessage(error.message, 'erro');
        }
    }

    function onEventsClick(event) {
        const button = event.target.closest('[data-event-action]');
        if (!button) return;
        const action = button.dataset.eventAction;
        const value = button.dataset.value;
        if (action === 'toggle-public-details') {
            const details = button.closest('tr')?.nextElementSibling;
            if (details?.classList.contains('detalhes-evento-publico')) {
                details.hidden = !details.hidden;
                button.setAttribute('aria-expanded', String(!details.hidden));
                button.textContent = details.hidden
                    ? button.dataset.collapsedLabel
                    : 'Ocultar detalhes';
            }
            return;
        }
        if (action === 'close-create' || action === 'wizard-cancel') {
            byId('dialog-criar-evento')?.close();
            resetCreateWizard();
        }
        if (action === 'wizard-next') {
            if (validateDraftStep(createWizardStep)) showCreateWizardStep(createWizardStep + 1);
        }
        if (action === 'wizard-back') showCreateWizardStep(Math.max(0, createWizardStep - 1));
        if (action === 'remove-draft-action') {
            button.closest('[data-draft-action]')?.remove();
            updateDraftActionLabels();
        }
        if (action === 'publish-event') {
            if (window.confirm('Publicar este evento? Ele ficará disponível para consulta pública.')) {
                transition(`${EVENTS_API}/${encodeURIComponent(currentManagerEvent.id)}/publish`, 'Evento publicado.');
            }
        }
        if (action === 'cancel-event') {
            if (window.confirm('Cancelar este evento? O cancelamento não poderá ser desfeito.')) {
                transition(`${EVENTS_API}/${encodeURIComponent(currentManagerEvent.id)}/cancel`, 'Evento cancelado.');
            }
        }
        if (action === 'close-event') {
            if (window.confirm('Encerrar este evento?')) {
                transition(`${EVENTS_API}/${encodeURIComponent(currentManagerEvent.id)}/close`, 'Evento encerrado.');
            }
        }
        if (action === 'edit-action') {
            const item = button.closest('.item-acao-evento');
            const selected = currentManagerEvent.actions?.find((itemAction) => itemAction.id === value);
            if (item && selected) item.replaceWith(renderActionForm(currentManagerEvent, selected));
        }
        if (action === 'cancel-edit-action') {
            if (currentManagerEvent) renderManagedEvent(currentManagerEvent);
        }
        if (action === 'cancel-action' || action === 'close-action') {
            const label = action === 'cancel-action' ? 'Cancelar esta ação?' : 'Encerrar esta ação?';
            if (window.confirm(label)) {
                const transitionName = action === 'cancel-action' ? 'cancel' : 'close';
                const done = action === 'cancel-action' ? 'Ação cancelada.' : 'Ação encerrada.';
                transition(`${ACTIONS_API}/${encodeURIComponent(value)}/${transitionName}`, done);
            }
        }
        if (action === 'register-action') {
            registerForAction(value, button);
        }
        if (action === 'previous-page' || action === 'next-page') {
            loadPublicEvents(currentPage + (action === 'next-page' ? 1 : -1));
        }
    }

    function initializeEvents() {
        currentRole = String(currentUser().role || '').trim().toUpperCase();
        byId('novo-evento').hidden = !canManage();
        byId('secao-gerenciamento-eventos').hidden = !canManage();
        renderSavedEvents();

        byId('eventos-recentes')?.addEventListener('change', (event) => {
            if (event.target.value) byId('identificador-evento').value = event.target.value;
        });
        byId('abrir-evento-form')?.addEventListener('submit', (event) => {
            event.preventDefault();
            openManagedEvent(byId('identificador-evento').value);
        });
        byId('novo-evento')?.addEventListener('click', () => {
            resetCreateWizard();
            byId('dialog-criar-evento')?.showModal();
        });
        byId('dialog-criar-evento')?.addEventListener('click', onEventsClick);
        byId('adicionar-acao-rascunho')?.addEventListener('click', () => addDraftAction(byId('form-criar-evento')));
        byId('form-criar-evento')?.addEventListener('submit', (event) => {
            event.preventDefault();
            if (createWizardStep !== 2) {
                if (validateDraftStep(createWizardStep)) showCreateWizardStep(createWizardStep + 1);
                return;
            }
            if (validateDraftStep(2)) createEvent(event.currentTarget);
        });
        byId('filtros-eventos')?.addEventListener('submit', (event) => {
            event.preventDefault();
            showMessage('');
            loadPublicEvents(1);
        });
        byId('limpar-filtros-eventos')?.addEventListener('click', () => {
            byId('filtros-eventos')?.reset();
            showMessage('');
            loadPublicEvents(1);
        });
        byId('lista-eventos-publicos')?.addEventListener('click', onEventsClick);
        byId('paginacao-eventos')?.addEventListener('click', onEventsClick);
        byId('painel-gerenciamento-evento')?.addEventListener('click', onEventsClick);
        byId('painel-gerenciamento-evento')?.addEventListener('submit', (event) => {
            const form = event.target;
            if (!(form instanceof HTMLFormElement)) return;
            event.preventDefault();
            if (form.dataset.formType === 'edit-event') saveEventChanges(form);
            if (form.dataset.formType === 'edit-action' || form.dataset.formType === 'create-action') saveAction(form);
        });
        loadPublicEvents(1);
    }

    window.inicializarModuloEventos = initializeEvents;
})();
