import { router } from "./router.js";
import { environment, resolveApiUrl } from "./environment.js";
import { createLocalAvatar } from "./profile-avatar.mjs";

let sessionRedirecting = false;

function handleSessionExpired() {
  if (sessionRedirecting || window.location.pathname === "/auth") return;
  sessionRedirecting = true;
  localStorage.removeItem("sige_access_token");
  localStorage.removeItem("sige_user");
  history.replaceState({ module: "auth" }, "", "/auth");
  router
    .carregarModulo("auth")
    .then(() => {
      window.sigeNotify?.(
        "Sua sessão expirou. Entre novamente para continuar.",
        "erro",
        7000,
      );
    })
    .finally(() => {
      sessionRedirecting = false;
    });
}

const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const requestUrl = typeof input === "string" ? input : input.url;
  const requestPath = new URL(requestUrl, window.location.href).pathname;
  const response = await nativeFetch(resolveApiUrl(input), init);
  if (
    response.status === 401 &&
    localStorage.getItem("sige_access_token") &&
    requestPath !== "/auth/login" &&
    !requestPath.startsWith("/certificados/validar/")
  ) {
    handleSessionExpired();
  }
  return response;
};

window.addEventListener("sige:session-expired", handleSessionExpired);

document.addEventListener("DOMContentLoaded", () => {
  const toastRegion = document.getElementById("regiao-notificacoes");

  window.sigeNotify = (message, type = "info", duration = 5000) => {
    if (!toastRegion || !message) return;
    const toast = document.createElement("div");
    toast.className = "notificacao-global";
    toast.dataset.tipo = type;
    toast.setAttribute("role", type === "erro" ? "alert" : "status");
    const text = document.createElement("p");
    text.textContent = String(message);
    const close = document.createElement("button");
    close.type = "button";
    close.className = "fechar-notificacao-global";
    close.setAttribute("aria-label", "Fechar notificação");
    close.textContent = "×";
    close.addEventListener("click", () => toast.remove(), { once: true });
    toast.append(text, close);
    toastRegion.append(toast);
    window.setTimeout(() => toast.remove(), duration);
  };

  window.addEventListener("unhandledrejection", (event) => {
    console.error("Erro não tratado na interface.", event.reason);
    window.sigeNotify(
      "Ocorreu um erro inesperado. Atualize a página ou tente novamente.",
      "erro",
    );
  });
  window.addEventListener("error", (event) => {
    if (!event.error) return;
    console.error("Erro não tratado na interface.", event.error);
    window.sigeNotify(
      "Ocorreu um erro inesperado. Atualize a página ou tente novamente.",
      "erro",
    );
  });

  const themeToggle = document.getElementById("botao-tema");
  let savedTheme = "light";
  try {
    const storedTheme = localStorage.getItem("sige_theme");
    if (storedTheme === "light" || storedTheme === "dark") {
      savedTheme = storedTheme;
    }
  } catch (error) {
    console.error("Não foi possível ler a preferência de tema.", error);
  }

  function updateThemeToggle(theme) {
    if (!themeToggle) return;
    themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
    themeToggle.setAttribute(
      "aria-label",
      theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro",
    );
  }

  function applyTheme(theme, persist = false) {
    document.documentElement.style.colorScheme = theme;
    document.documentElement.setAttribute("theme", theme);
    updateThemeToggle(theme);
    if (persist) {
      savedTheme = theme;
      try {
        localStorage.setItem("sige_theme", theme);
      } catch (error) {
        console.error("Não foi possível salvar a preferência de tema.", error);
      }
    }
  }

  applyTheme(savedTheme);

  themeToggle?.addEventListener("click", () => {
    applyTheme(savedTheme === "dark" ? "light" : "dark", true);
  });
  document.documentElement.dataset.environment = environment.mode;

  const barraLateral = document.getElementById("barra-lateral");
  const alternadorBarraLateral = document.getElementById(
    "alternador-barra-lateral",
  );
  const painelFundoLateral = document.getElementById("painel-fundo-lateral");
  const menuNavegacao = document.querySelector(".menu-navegacao");

  router.init();
  router.atualizarPermissoesMenu();

  alternadorBarraLateral?.addEventListener("click", () => {
    if (window.innerWidth <= 768) {
      barraLateral?.classList.toggle("abrir");
      painelFundoLateral?.classList.toggle("mostrar");
    } else {
      barraLateral?.classList.toggle("recolhida");
    }
  });

  painelFundoLateral?.addEventListener("click", () => {
    barraLateral?.classList.remove("abrir");
    painelFundoLateral?.classList.remove("mostrar");
  });

  const PAPEIS_USUARIO = {
    ADMIN: { label: "Administrador", class: "badge-adm" },
    ORGANIZADOR: { label: "Organizador", class: "badge-adm" },
    PROFESSOR: { label: "Professor", class: "badge-gestor" },
    ALUNO: { label: "Aluno", class: "badge-aluno" },
  };

  function definirPerfilUsuario(usuario = {}) {
    const nome = usuario.name || usuario.nome || usuario.email || "Usuário";
    const papel =
      typeof usuario.role === "string" ? usuario.role.toUpperCase() : "";
    const configPapel = PAPEIS_USUARIO[papel] || {
      label: "Perfil não selecionado",
      class: "badge-aluno",
    };
    const avatarFinal = createLocalAvatar(nome);

    const elNome = document.getElementById("nome-usuario");
    const elAvatar = document.getElementById("avatar-usuario");
    const elCargo = document.getElementById("cargo-usuario");

    if (elNome) elNome.textContent = nome;
    if (elAvatar) {
      elAvatar.src = avatarFinal;
      elAvatar.alt = `Iniciais de ${nome}`;
    }
    if (elCargo) {
      elCargo.textContent = configPapel.label;
      elCargo.className = `cargo-perfil ${configPapel.class}`;
    }

    const elNomeModal = document.getElementById("nome-usuario-modal");
    const elAvatarModal = document.getElementById("avatar-usuario-modal");
    const elCargoModal = document.getElementById("cargo-usuario-modal");

    if (elNomeModal) elNomeModal.textContent = nome;
    if (elAvatarModal) {
      elAvatarModal.src = avatarFinal;
      elAvatarModal.alt = `Iniciais de ${nome}`;
    }
    if (elCargoModal) {
      elCargoModal.textContent = configPapel.label;
      elCargoModal.className = `cargo-perfil ${configPapel.class}`;
    }
  }

  definirPerfilUsuario(router.obterUsuarioAtual() || {});

  menuNavegacao?.addEventListener("click", (evento) => {
    const botaoClicado = evento.target.closest(".botao-menu");
    if (!botaoClicado || botaoClicado.hidden) return;

    evento.preventDefault();
    const moduloCarregar = botaoClicado.getAttribute("data-module");

    if (window.innerWidth <= 768) {
      barraLateral?.classList.remove("abrir");
      painelFundoLateral?.classList.remove("mostrar");
    }

    if (history.state?.module === moduloCarregar) return;

    history.pushState({ module: moduloCarregar }, "", `/${moduloCarregar}`);
    router.carregarModulo(moduloCarregar);
  });
});

(function () {
  "use strict";

  const API = "";

  function saveSession(data) {
    if (!data || !data.accessToken) {
      return;
    }

    localStorage.setItem("sige_access_token", data.accessToken);

    if (data.user) {
      localStorage.setItem("sige_user", JSON.stringify(data.user));
    }
  }

  function getToken() {
    return localStorage.getItem("sige_access_token");
  }

  function showMessage(id, text, type) {
    const element = document.getElementById(id);

    if (!element) {
      return;
    }

    element.textContent = text;
    element.className = "form-message " + (type || "");
  }

  async function request(url, options = {}) {
    const token = getToken();

    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };

    if (token) {
      headers.Authorization = "Bearer " + token;
    }

    const response = await fetch(API + url, {
      ...options,
      headers,
    });

    const contentType = response.headers.get("content-type") || "";

    let data;

    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = {};
    }

    if (!response.ok) {
      const message = data.message || "Não foi possível concluir a operação.";

      throw new Error(Array.isArray(message) ? message.join(" ") : message);
    }

    return data;
  }

  // ----------------------------------------------------------
  // LOGIN
  // ----------------------------------------------------------

  const loginForm = document.getElementById("login-form");

  if (loginForm) {
    loginForm.addEventListener("submit", async function (event) {
      event.preventDefault();

      const email = document.getElementById("email").value.trim();

      const password = document.getElementById("password").value;

      try {
        showMessage("login-message", "Entrando...", "");

        const data = await request("/auth/login", {
          method: "POST",
          body: JSON.stringify({
            email,
            password,
          }),
        });

        saveSession(data);

        showMessage(
          "login-message",
          "Login realizado. Redirecionando...",
          "success",
        );

        if (data.user && data.user.role) {
          window.location.href = "/sistema";
        } else {
          window.location.href = "/selecao-funcao";
        }
      } catch (error) {
        showMessage("login-message", error.message, "error");
      }
    });
  }

  // ----------------------------------------------------------
  // CADASTRO
  // ----------------------------------------------------------

  const registerForm = document.getElementById("register-form");

  if (registerForm) {
    registerForm.addEventListener("submit", async function (event) {
      event.preventDefault();

      const email = document.getElementById("register-email").value.trim();

      const emailConfirmation = document
        .getElementById("register-email-confirm")
        .value.trim();

      const password = document.getElementById("register-password").value;

      const passwordConfirmation = document.getElementById(
        "register-password-confirm",
      ).value;

      if (email !== emailConfirmation) {
        showMessage("register-message", "Os e-mails não coincidem.", "error");
        return;
      }

      if (password !== passwordConfirmation) {
        showMessage("register-message", "As senhas não coincidem.", "error");
        return;
      }

      try {
        showMessage("register-message", "Criando sua conta...", "");

        const data = await request("/auth/register", {
          method: "POST",
          body: JSON.stringify({
            email,
            password,
            passwordConfirmation,
          }),
        });

        saveSession(data);

        showMessage(
          "register-message",
          "Conta criada. Redirecionando...",
          "success",
        );

        window.location.href = "/selecao-funcao";
      } catch (error) {
        showMessage("register-message", error.message, "error");
      }
    });
  }

  // ----------------------------------------------------------
  // SELECAO DE FUNCAO
  // ----------------------------------------------------------

  const roleButtons = document.querySelectorAll(".role-button");

  roleButtons.forEach(function (button) {
    button.addEventListener("click", async function () {
      const role = button.dataset.role;

      if (!getToken()) {
        window.location.href = "/login";
        return;
      }

      try {
        button.disabled = true;

        button.style.opacity = "0.7";

        showMessage("role-message", "Salvando sua função...", "");

        const response = await request("/users/me/role", {
          method: "PATCH",
          body: JSON.stringify({
            role,
          }),
        });

        const current = JSON.parse(localStorage.getItem("sige_user") || "{}");

        current.role = response.role || role;

        localStorage.setItem("sige_user", JSON.stringify(current));

        showMessage(
          "role-message",
          "Função selecionada. Redirecionando...",
          "success",
        );

        setTimeout(function () {
          window.location.href = "/sistema";
        }, 500);
      } catch (error) {
        button.disabled = false;

        button.style.opacity = "1";

        showMessage("role-message", error.message, "error");
      }
    });
  });
})();
