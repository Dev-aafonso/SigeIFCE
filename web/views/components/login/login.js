const AUTH_ROUTES = {
  login: "/auth/login",
  register: "/auth/register",
};

function showMessage(element, message, type = "") {
  if (!element) return;
  element.textContent = message;
  element.className = `${
    element.classList.contains("mensagem-login")
      ? "mensagem-login"
      : "mensagem-autenticacao"
  } ${type}`.trim();
}

function setLoading(button, loading, originalText) {
  if (!button) return;
  button.disabled = loading;
  button.setAttribute("aria-busy", String(loading));
  button.textContent = loading ? "Aguarde..." : originalText;
}

async function requestJson(url, payload) {
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Não foi possível conectar à API. Verifique a conexão e tente novamente.");
  }

  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!response.ok) {
    const message = data.message || data.error;
    throw new Error(
      Array.isArray(message)
        ? message.join(" ")
        : message || `Não foi possível concluir a solicitação (HTTP ${response.status}).`,
    );
  }

  return data;
}

function saveSession(data) {
  const user = data?.user || (data?.role ? data : null);
  if (!user || typeof user !== "object" || !user.role) {
    throw new Error("A API não retornou os dados esperados do usuário.");
  }

  // Apenas os dados de exibição são guardados. O token fica no cookie HttpOnly.
  try {
    localStorage.setItem("sige_user", JSON.stringify(user));
  } catch {}
  return user;
}

function getDestination(user) {
  return ["ADMIN", "ORGANIZADOR"].includes(String(user.role).toUpperCase())
    ? "Dashboard"
    : "events";
}

async function navigateAfterAuth(user) {
  const destination = getDestination(user);
  history.pushState({ module: destination }, "", `/#/${destination}`);
  if (window.navegarParaModulo) {
    await window.navegarParaModulo(destination);
  } else {
    window.location.assign(`/#/${destination}`);
  }
}

window.alternarSenha = (button) => {
  const input = button?.previousElementSibling;
  if (!(input instanceof HTMLInputElement)) return;
  const visible = input.type === "password";
  input.type = visible ? "text" : "password";
  button.setAttribute("aria-pressed", String(visible));
};

window.realizarLogin = async (event) => {
  event.preventDefault();
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;

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
  showMessage(message, "Validando suas credenciais...");

  try {
    const data = await requestJson(AUTH_ROUTES.login, { email, password });
    const user = saveSession(data);
    showMessage(message, "Login realizado com sucesso.", "sucesso");
    await navigateAfterAuth(user);
  } catch (error) {
    showMessage(message, error.message || "Não foi possível realizar o login.", "erro");
    setLoading(button, false, originalText);
  }
};

document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;

  if (form.matches('[data-testid="login-form"]')) {
    event.preventDefault();
    await window.realizarLogin(event);
    return;
  }

  if (!form.matches('[data-testid="signup-form"]')) return;
  event.preventDefault();

  const name = document.getElementById("nome-cadastro")?.value.trim();
  const email = document.getElementById("email-cadastro")?.value.trim();
  const password = document.getElementById("senha-cadastro")?.value;
  const message = document.getElementById("mensagem-cadastro");
  const button = form.querySelector('[type="submit"]');

  if (!name || !email || !password || !button) return;

  const originalText = button.textContent;
  setLoading(button, true, originalText);
  showMessage(message, "Criando sua conta...");

  try {
    const data = await requestJson(AUTH_ROUTES.register, {
      name,
      email,
      password,
      passwordConfirmation: password,
    });
    const user = saveSession(data);
    try {
      sessionStorage.removeItem("funcao_cadastro");
    } catch {}
    showMessage(message, "Conta criada com sucesso.", "sucesso");
    await navigateAfterAuth(user);
  } catch (error) {
    showMessage(message, error.message || "Não foi possível criar a conta.", "erro");
  } finally {
    setLoading(button, false, originalText);
  }
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const viewButton = target.closest("[data-auth-view]");
  if (viewButton) {
    event.preventDefault();
    window.carregarComponenteAuth?.(viewButton.dataset.authView);
    return;
  }

  const actionButton = target.closest('[data-auth-action="toggle-password"]');
  if (actionButton) {
    event.preventDefault();
    window.alternarSenha(actionButton);
  }
});