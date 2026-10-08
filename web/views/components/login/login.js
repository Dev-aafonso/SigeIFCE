const AUTH_ROUTES = {
  login: "/auth/login",
  recovery: "/auth/forgot-password",
  reset: "/auth/reset-password",
};

function displayMessage(element, text, type = "") {
  if (!element) return;
  element.textContent = text;
  element.className = `${element.classList.contains("mensagem-login") ? "mensagem-login" : "mensagem-autenticacao"} ${type}`.trim();
}

function setLoading(button, loading, originalText) {
  button.disabled = loading;
  button.setAttribute("aria-busy", String(loading));
  button.textContent = loading ? "Aguarde..." : originalText;
}

async function requestJson(url, payload) {
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Não foi possível conectar à API. Verifique sua conexão e tente novamente.");
  }

  const text = await response.text();
  const isJson = (response.headers.get("content-type") || "").includes("application/json");
  let data = {};
  if (text && isJson) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("A API retornou uma resposta JSON inválida.");
    }
  } else if (text) {
    data.message = new DOMParser().parseFromString(text, "text/html").body.textContent.trim();
  }

  if (!response.ok) {
    const message = data.message || data.error;
    throw new Error(Array.isArray(message) ? message.join(" ") : message || `Não foi possível concluir a solicitação (HTTP ${response.status}).`);
  }
  return data;
}

function saveSession(data) {
  if (!data?.accessToken) throw new Error("A API não retornou o token de acesso esperado.");
  localStorage.setItem("sige_access_token", data.accessToken);
  if (data.user) localStorage.setItem("sige_user", JSON.stringify(data.user));
}

async function submitRequest(form, url, payload, message, successText, onSuccess) {
  const button = form.querySelector('[type="submit"]');
  const originalText = button.textContent;
  setLoading(button, true, originalText);
  displayMessage(message, "Enviando solicitação...");

  try {
    const data = await requestJson(url, payload);
    await onSuccess?.(data, form);
    displayMessage(message, data.message || successText, "sucesso");
  } catch (error) {
    displayMessage(message, error.message, "erro");
  } finally {
    setLoading(button, false, originalText);
  }
}

window.alternarSenha = (button) => {
  const input = button?.previousElementSibling;
  if (!input) return;
  const visible = input.type === "password";
  input.type = visible ? "text" : "password";
  button.style.opacity = visible ? "1" : "0.5";
};

window.abrirRecuperacaoSenha = () => {
  const modal = document.getElementById("modal-recuperacao-senha");
  const email = document.getElementById("email-recuperacao");
  const loginEmail = document.getElementById("email-login");
  if (email && loginEmail) email.value = loginEmail.value.trim();
  if (modal && !modal.open) modal.showModal();
};

window.fecharModalAuth = (id) => document.getElementById(id)?.close();

window.realizarLogin = async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const email = document.getElementById("email-login")?.value.trim();
  const password = document.getElementById("senha-login")?.value;
  const button = form.querySelector('[type="submit"]');
  if (!email || !password || !button) return;

  let message = form.querySelector(".mensagem-login");
  if (!message) {
    message = document.createElement("p");
    message.className = "mensagem-login";
    message.setAttribute("role", "alert");
    message.setAttribute("aria-live", "polite");
    form.appendChild(message);
  }

  const originalText = button.textContent;
  setLoading(button, true, originalText);
  displayMessage(message, "Validando suas credenciais...");

  try {
    const data = await requestJson(AUTH_ROUTES.login, { email, password });
    saveSession(data);
    if (!data.user?.role) {
      displayMessage(message, "Login realizado. Selecione seu perfil para continuar.", "sucesso");
      if (window.carregarComponenteAuth) {
        await window.carregarComponenteAuth("selecao-funcao");
      } else {
        window.location.assign("/selecao-funcao");
      }
      return;
    }

    displayMessage(message, "Login realizado. Abrindo o sistema...", "sucesso");
    history.pushState({ module: "dashboard" }, "", "/dashboard");
    if (window.navegarParaModulo) await window.navegarParaModulo("dashboard");
    else window.location.assign("/dashboard");
  } catch (error) {
    displayMessage(message, error.message, "erro");
    setLoading(button, false, originalText);
  }
};

document.addEventListener("submit", (event) => {
  const form = event.target;
  if (form.id === "form-recuperacao-senha") {
    event.preventDefault();
    const email = document.getElementById("email-recuperacao").value.trim();
    submitRequest(
      form,
      AUTH_ROUTES.recovery,
      { email },
      document.getElementById("mensagem-recuperacao-senha"),
      "Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.",
    );
  } else if (form.id === "form-redefinicao-senha") {
    event.preventDefault();
    const token = document.getElementById("token-redefinicao-senha").value;
    const password = document.getElementById("nova-senha").value;
    const passwordConfirmation = document.getElementById("confirmacao-nova-senha").value;
    const message = document.getElementById("mensagem-redefinicao-senha");

    if (!token) return displayMessage(message, "O link não contém um token válido. Solicite um novo link.", "erro");
    if (password !== passwordConfirmation) return displayMessage(message, "As senhas não coincidem.", "erro");

    submitRequest(
      form,
      AUTH_ROUTES.reset,
      { token, password, passwordConfirmation },
      message,
      "Senha redefinida com sucesso. Você já pode entrar com a nova senha.",
      () => {
        form.reset();
        const params = new URLSearchParams(location.search);
        params.delete("token");
        params.delete("resetToken");
        const query = params.toString();
        history.replaceState(
          history.state,
          "",
          `${location.pathname}${query ? `?${query}` : ""}${location.hash}`,
        );
      },
    );
  }
});

function openResetModalFromUrl() {
  const params = new URLSearchParams(location.search);
  const token = params.get("token") || params.get("resetToken");
  const input = document.getElementById("token-redefinicao-senha");
  const modal = document.getElementById("modal-redefinicao-senha");
  if (!token || !input || !modal || modal.open) return;
  input.value = token;
  modal.showModal();
}

openResetModalFromUrl();
new MutationObserver(openResetModalFromUrl).observe(
  document.getElementById("area-componentes-auth") || document.body,
  { childList: true, subtree: true },
);
