export async function withButtonBusy(button, work) {
  if (!button) return work();
  if (button.getAttribute('aria-busy') === 'true') return;
  button.setAttribute('aria-busy', 'true');
  try {
    return await work();
  } finally {
    button.removeAttribute('aria-busy');
  }
}

export function busyHandler(handler) {
  return event => {
    const form = event.type === 'submit';
    if (form) event.preventDefault();
    const button = form ? event.submitter ?? event.target.querySelector('button[type="submit"]') : event.currentTarget;
    return withButtonBusy(button, () => handler(event));
  };
}
