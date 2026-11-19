/** Render selectable event suggestions without inserting event text as HTML. */
export function renderEventSuggestions(container, events, onSelect, emptyText = 'Nenhum evento encontrado.') {
  if (!container) return;
  if (!container.parentElement?.contains(document.activeElement)) {
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
  wrapper.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !container.hidden) {
      event.preventDefault();
      container.hidden = true;
      input.focus();
    }
    if (event.key === 'ArrowDown' && !container.hidden) {
      const first = container.querySelector('button');
      if (first) { event.preventDefault(); first.focus(); }
    }
  });
  wrapper.addEventListener('focusout', () => {
    window.setTimeout(() => {
      if (!wrapper.contains(document.activeElement)) container.hidden = true;
    }, 0);
  });
}
