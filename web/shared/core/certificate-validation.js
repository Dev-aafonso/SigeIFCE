(() => {
  const form = document.getElementById('validation-form');
  const input = document.getElementById('validation-code');
  const existing = new URLSearchParams(location.search).get('code');
  if (existing && input) input.value = existing;
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const code = input?.value.trim();
    if (code && code.length <= 100 && /^[A-Za-z0-9_-]+$/.test(code)) {
      location.assign(`/certificates/verify/${encodeURIComponent(code)}`);
    } else {
      input?.setCustomValidity('Informe um código de validação válido.');
      input?.reportValidity();
    }
  });
  input?.addEventListener('input', () => input.setCustomValidity(''));
})();
