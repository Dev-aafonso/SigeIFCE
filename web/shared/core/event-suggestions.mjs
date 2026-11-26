/** Render selectable event suggestions without inserting event text as HTML. */
export function renderEventSuggestions(container, events, onSelect, emptyText = 'Nenhum evento encontrado.') {
  if (!container) return;
  if (container.dataset.dismissed || !container.parentElement?.contains(document.activeElement)) {
    container.hidden = true;
    return;
  }
  container.replaceChildren();
  container.hidden = false;
  if (!events.length) {
    const message = document.createElement('p');
    message.className = 'sugestoes-eventos-vazio';
    message.textContent = emptyText;
    container.append(message);
    return;
  }
  for (const event of events.slice(0, 8)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sugestao-evento';
    const title = document.createElement('strong');
    title.textContent = event.title || 'Evento sem título';
    const detail = document.createElement('span');
    const date = event.startDate ? new Date(event.startDate) : null;
    const dateLabel = date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('pt-BR') : '';
    detail.textContent = [dateLabel, event.location, event.label && event.label !== event.title ? event.label : ''].filter(Boolean).join(' · ');
    button.append(title);
    if (detail.textContent) button.append(detail);
    button.addEventListener('click', () => {
      onSelect(event, button);
      container.hidden = true;
    });
    container.append(button);
  }
}

export function bindEventSuggestionDismissal(input, container) {
  const wrapper = container?.parentElement;
  if (!input || !wrapper) return;
  input.addEventListener('input', () => { delete container.dataset.dismissed; });
  wrapper.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !container.hidden) {
      event.stopPropagation();
      event.preventDefault();
      container.hidden = true;
      input.focus();
      container.dataset.dismissed = "true";
    }
    if (['ArrowDown', 'ArrowUp'].includes(event.key) && !container.hidden) {
      const buttons = [...container.querySelectorAll('button')];
      if (!buttons.length) return;
      event.preventDefault();
      const index = buttons.indexOf(document.activeElement);
      const next = event.key === 'ArrowDown' ? index + 1 : index < 0 ? buttons.length - 1 : index - 1;
      buttons[(next + buttons.length) % buttons.length].focus();
    }
  });
  wrapper.addEventListener('focusout', () => {
    window.setTimeout(() => {
      if (!wrapper.contains(document.activeElement)) container.hidden = true;
    }, 0);
  });
}

// A new edit invalidates the previous request, including during the debounce.
export function bindEventLookup(input, container, { search, select, clear, allowEmpty = false }) {
  let timer;
  let request;
  const lookup = () => {
    clearTimeout(timer);
    request?.abort();
    const term = input.value.trim();
    if (!term && !allowEmpty) { container.hidden = true; return; }
    const controller = new AbortController();
    request = controller;
    renderEventSuggestions(container, [], null, 'Pesquisando eventos…');
    timer = setTimeout(async () => {
      try {
        const matches = await search(term, controller.signal);
        if (!controller.signal.aborted && input.isConnected) {
          renderEventSuggestions(container, matches, select);
        }
      } catch (error) {
        if (!controller.signal.aborted && input.isConnected) {
          renderEventSuggestions(container, [], null, error.message);
        }
      }
    }, 250);
  };
  input.addEventListener('input', () => { clear(); lookup(); });
  if (allowEmpty) input.addEventListener('focus', () => { delete container.dataset.dismissed; lookup(); });
  bindEventSuggestionDismissal(input, container);
}
