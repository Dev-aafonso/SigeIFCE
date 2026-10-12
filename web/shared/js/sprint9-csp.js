(function () {
  'use strict';

  function callWindowFunction(name, args) {
    const fn = window[name];
    if (typeof fn !== 'function') {
      console.error('[SIGE] Funcao de interface indisponivel:', name);
      return false;
    }
    fn.apply(window, args || []);
    return true;
  }

  document.addEventListener('click', function (event) {
    const origin = event.target;
    if (!(origin instanceof Element)) return;

    const control = origin.closest('[data-auth-component], [data-toggle-password], [data-select-role]');
    if (!control) return;

    const component = control.getAttribute('data-auth-component');
    if (component) {
      event.preventDefault();
      callWindowFunction('carregarComponenteAuth', [component]);
      return;
    }

    if (control.hasAttribute('data-toggle-password')) {
      event.preventDefault();
      callWindowFunction('alternarSenha', [control]);
      return;
    }

    const role = control.getAttribute('data-select-role');
    if (role) {
      event.preventDefault();
      callWindowFunction('selecionarFuncaoECadastrar', [role]);
    }
  });

  document.addEventListener('submit', function (event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.hasAttribute('data-auth-submit')) return;

    if (typeof window.realizarLogin !== 'function') {
      event.preventDefault();
      console.error('[SIGE] Funcao de autenticacao indisponivel: realizarLogin');
      return;
    }

    window.realizarLogin(event);
  });
})();