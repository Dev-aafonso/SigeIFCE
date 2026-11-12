import { definirPreferenciaTema, obterPreferenciaTema, obterTemaEfetivo, inicializarTema } from "../../../shared/core/theme.js";

// Inicializador idempotente: o roteador recria a tela em cada navegação.
window.inicializarModuloConfig = () => {
  const root = document.querySelector("#area-conteudo .sige-config");
  if (!root || root.dataset.initialized === "true") return;
  root.dataset.initialized = "true";
  inicializarTema();
  const inputs = Array.from(root.querySelectorAll('input[name="sige-config-theme"]'));
  const feedback = root.querySelector("#sige-config-feedback");
  const atualizar = () => {
    const preference = obterPreferenciaTema();
    for (const input of inputs) input.checked = input.value === preference;
  };
  atualizar();
  for (const input of inputs) {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      definirPreferenciaTema(input.value);
      if (feedback) feedback.textContent = `Tema ${input.value === "auto" ? "automático" : input.value === "dark" ? "escuro" : "claro"} aplicado. Tema ativo: ${obterTemaEfetivo() === "dark" ? "escuro" : "claro"}.`;
    });
  }
  root.querySelectorAll('[data-settings-form]').forEach(form => {
    const key = `sige-config-${form.dataset.settingsForm}`;
    try {
      const saved = JSON.parse(localStorage.getItem(key) || '{}');
      for (const input of form.elements) if (input.name && Object.hasOwn(saved, input.name)) {
        if (input.type === 'checkbox') input.checked = saved[input.name]; else input.value = saved[input.name];
      }
    } catch (_) { /* Preferências indisponíveis: manter os valores padrão. */ }
    form.addEventListener('submit', event => {
      event.preventDefault();
      const data = {};
      for (const input of form.elements) if (input.name) data[input.name] = input.type === 'checkbox' ? input.checked : input.value;
      try { localStorage.setItem(key, JSON.stringify(data)); form.querySelector('[role="status"]').textContent = 'Preferências salvas neste navegador.'; }
      catch (_) { form.querySelector('[role="status"]').textContent = 'Não foi possível salvar as preferências.'; }
    });
  });
  const tabs = Array.from(root.querySelectorAll('.sige-config__nav-item[role="tab"]'));
  const selectTab = (selected, moveFocus = false) => {
    for (const tab of tabs) {
      const active = tab === selected;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      const panel = root.querySelector(`#${tab.getAttribute('aria-controls')}`);
      if (panel) panel.hidden = !active;
    }
    if (moveFocus) selected.focus();
  };
  for (const tab of tabs) {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', event => {
      const index = tabs.indexOf(tab);
      let next;
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault();
      selectTab(tabs[next], true);
    });
  }
  if (tabs.length) selectTab(tabs[0]);
  root.querySelector('#config-encerrar-sessoes')?.addEventListener('click', async () => {
    const feedback = root.querySelector('#config-seguranca-feedback');
    try { const response = await fetch('/auth/logout', {method:'POST',credentials:'same-origin'}); if (!response.ok) throw new Error(); window.location.reload(); }
    catch (_) { feedback.textContent = 'Não foi possível encerrar as sessões. Tente novamente.'; }
  });
  const onThemeChange = () => atualizar();
  document.addEventListener("sige:theme-changed", onThemeChange);
  // Evitar listeners órfãos quando o módulo deixa de estar na página.
  const observer = new MutationObserver(() => {
    if (!root.isConnected) {
      document.removeEventListener("sige:theme-changed", onThemeChange);
      observer.disconnect();
    }
  });
  observer.observe(document.getElementById("area-conteudo"), { childList: true });
};
