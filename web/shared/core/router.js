import {
  canAccessModule,
  isKnownModule,
  isKnownRole,
} from "./access-control.mjs";

const MODULE_FILES = {
  auth: { folder: "auth", file: "auth", css: true, js: true },
  dashboard: { folder: "Dashboard", file: "dashboard", css: true, js: true },
  events: { folder: "events", file: "events", css: true, js: true },
  registrations: {
    folder: "registrations",
    file: "registrations",
    css: true,
    js: true,
  },
  participants: {
    folder: "participants",
    file: "participants",
    css: true,
    js: true,
  },
  certificates: {
    folder: "certificates",
    file: "certificates",
    css: true,
    js: true,
  },
  "certificate-validation": {
    folder: "certificates",
    file: "certificate-validation",
    cssFile: "certificates",
    jsFile: "certificates",
    css: true,
    js: true,
  },
  reports: { folder: "reports", file: "reports", css: true, js: true },
  users: { folder: "users", file: "users", css: true, js: true },
  settings: { folder: "config", file: "config", css: false, js: false },
};

const MODULE_INITIALIZERS = {
  dashboard: () => window.inicializarPainelPerfil?.(),
  events: () => window.inicializarModuloEventos?.(),
  registrations: () => window.inicializarModuloInscricoes?.(),
  participants: () => window.inicializarModuloParticipantes?.(),
  certificates: () => window.inicializarModuloCertificados?.(),
  "certificate-validation": () =>
    window.inicializarValidacaoPublicaCertificados?.(),
  reports: () => window.inicializarModuloRelatorios?.(),
  users: () => window.inicializarGerenciamentoUsuarios?.(),
};

class Router {
  constructor() {
    this.areaConteudo = null;
    this.cacheModulos = new Map();
    this.recursosAtivos = new Set();
    this.navigationSequence = 0;
  }

  init() {
    this.areaConteudo = document.getElementById("area-conteudo");

    window.addEventListener("popstate", (evento) => {
      const moduloUrl =
        window.location.pathname.replace(/^\/|\/$/g, "").toLowerCase() ||
        "auth";
      const moduloCarregar = evento.state?.module || moduloUrl;
      this.carregarModulo(moduloCarregar);
    });

    const segmentosCaminho = window.location.pathname
      .split("/")
      .filter(Boolean);
    const moduloInicial =
      segmentosCaminho.length > 0 && segmentosCaminho[0] !== "index.html"
        ? segmentosCaminho[0].toLowerCase()
        : "auth";

    history.replaceState({ module: moduloInicial }, "", `/${moduloInicial}`);
    this.carregarModulo(moduloInicial);
  }

  async carregarModulo(nomeModulo) {
    const moduloSeguro = nomeModulo.toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!moduloSeguro) return;
    const sequence = ++this.navigationSequence;

    if (!MODULE_FILES[moduloSeguro]) {
      document.body.classList.remove("modo-auth", "modo-validacao-publica");
      this.areaConteudo.removeAttribute("aria-busy");
      this.paginaErro(
        "Página não encontrada",
        "O endereço solicitado não corresponde a uma página disponível.",
        "404",
      );
      return;
    }

    if (moduloSeguro === "auth" && isKnownRole(this.obterPapelAtual())) {
      history.replaceState({ module: "dashboard" }, "", "/dashboard");
      return this.carregarModulo("dashboard");
    }

    let autorizado;
    try {
      autorizado = await this.autorizarModulo(moduloSeguro);
    } catch (erro) {
      if (sequence !== this.navigationSequence) return;
      console.error("Não foi possível verificar a sessão do usuário.", erro);
      this.paginaErro(
        "Não foi possível verificar sua sessão",
        "O serviço de autenticação está indisponível. Tente novamente.",
        "500",
        () => this.carregarModulo(moduloSeguro),
      );
      return;
    }
    if (sequence !== this.navigationSequence) return;

    if (!autorizado) {
      if (isKnownRole(this.obterPapelAtual())) {
        await this.redirecionarAcessoNegado();
      }
      return;
    }

    if (moduloSeguro === "auth") {
      document.body.classList.add("modo-auth");
    } else {
      document.body.classList.remove("modo-auth");
      this.atualizarBotaoAtivo(moduloSeguro);
    }

    const arquivoModulo = MODULE_FILES[moduloSeguro];
    if (!arquivoModulo) {
      this.areaConteudo.innerHTML = `
                <div class="module-wrapper fade-in" role="alert">
                    <h2>Esta página não está disponível</h2>
                    <p>O módulo solicitado não existe.</p>
                </div>`;
      return;
    }
    if (arquivoModulo.css) {
      this.carregarCSS(
        `web/views/modules/${arquivoModulo.folder}/${arquivoModulo.cssFile || arquivoModulo.file}.css`,
      );
    }

    try {
      this.areaConteudo.setAttribute("aria-busy", "true");
      if (this.cacheModulos.has(moduloSeguro)) {
        this.areaConteudo.innerHTML = this.cacheModulos.get(moduloSeguro);
      } else {
        this.areaConteudo.innerHTML = `
                    <div class="esqueleto-modulo" role="status" aria-live="polite" aria-label="Carregando página">
                        <span class="esqueleto-linha esqueleto-titulo"></span>
                        <span class="esqueleto-linha"></span>
                        <span class="esqueleto-cartao"></span>
                        <span class="esqueleto-cartao"></span>
                    </div>`;

        const resposta = await fetch(
          `web/views/modules/${arquivoModulo.folder}/${arquivoModulo.file}.html`,
        );
        if (sequence !== this.navigationSequence) return;
        if (!resposta.ok) {
          const error = new Error(`HTTP Error: ${resposta.status}`);
          error.status = resposta.status;
          throw error;
        }

        const html = await resposta.text();
        if (sequence !== this.navigationSequence) return;
        this.cacheModulos.set(moduloSeguro, html);
        this.areaConteudo.innerHTML = html;
      }

      if (arquivoModulo.js) {
        await this.carregarJS(
          `web/views/modules/${arquivoModulo.folder}/${arquivoModulo.jsFile || arquivoModulo.file}.js`,
        );
      }

      if (sequence !== this.navigationSequence) return;
      this.areaConteudo
        .querySelectorAll("img:not([loading])")
        .forEach((image) => image.setAttribute("loading", "lazy"));
      MODULE_INITIALIZERS[moduloSeguro]?.();
      if (moduloSeguro === "auth") {
        await window.carregarComponenteAuth("login");
      }
    } catch (erro) {
      if (sequence !== this.navigationSequence) return;
      console.error(
        `Não foi possível carregar o módulo "${moduloSeguro}".`,
        erro,
      );
      this.paginaErro(
        erro.status === 404
          ? "Página não encontrada"
          : "Não foi possível carregar a página",
        erro.status === 404
          ? "Este módulo não está disponível neste endereço."
          : "Ocorreu uma falha ao carregar esta área. Tente novamente.",
        erro.status === 404 ? "404" : "500",
        () => this.carregarModulo(moduloSeguro),
      );
    } finally {
      if (sequence === this.navigationSequence) {
        this.areaConteudo.removeAttribute("aria-busy");
      }
    }
  }

  paginaErro(titulo, descricao, codigo, retry) {
    const button = retry
      ? '<button class="botao-tentar-novamente" type="button">Tentar novamente</button>'
      : '<a class="botao-tentar-novamente" href="/dashboard">Voltar ao painel</a>';
    this.areaConteudo.innerHTML = `
            <section class="pagina-erro-modulo" role="alert" aria-labelledby="titulo-erro-modulo">
                <span class="codigo-erro-modulo">${codigo}</span>
                <h2 id="titulo-erro-modulo">${titulo}</h2>
                <p>${descricao}</p>
                ${button}
            </section>`;
    if (retry) {
      this.areaConteudo
        .querySelector(".botao-tentar-novamente")
        ?.addEventListener("click", retry, { once: true });
    } else {
      this.areaConteudo
        .querySelector(".botao-tentar-novamente")
        ?.addEventListener(
          "click",
          (event) => {
            event.preventDefault();
            history.pushState({ module: "dashboard" }, "", "/dashboard");
            this.carregarModulo("dashboard");
          },
          { once: true },
        );
    }
    return this.areaConteudo.innerHTML;
  }

  async redirecionarAcessoNegado() {
    history.replaceState({ module: "dashboard" }, "", "/dashboard");
    await this.carregarModulo("dashboard");

    const aviso = document.createElement("p");
    aviso.className = "aviso-acesso-negado";
    aviso.setAttribute("role", "alert");
    aviso.textContent =
      "Acesso não permitido. Seu perfil não possui autorização para abrir essa página.";
    this.areaConteudo.prepend(aviso);
  }

  obterUsuarioAtual() {
    try {
      const usuario = JSON.parse(localStorage.getItem("sige_user") || "null");
      return usuario && typeof usuario === "object" ? usuario : null;
    } catch (erro) {
      console.error("Não foi possível ler o perfil salvo da sessão.", erro);
      return null;
    }
  }

  obterPapelAtual() {
    const papel = this.obterUsuarioAtual()?.role;
    return typeof papel === "string" ? papel.toUpperCase() : "";
  }

  async autorizarModulo(modulo) {
    if (
      modulo === "auth" ||
      modulo === "events" ||
      modulo === "certificate-validation"
    )
      return true;

    const token = localStorage.getItem("sige_access_token");
    const response = await fetch("/auth/me", {
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem("sige_access_token");
      localStorage.removeItem("sige_user");
      history.replaceState({ module: "auth" }, "", "/auth");
      await this.carregarModulo("auth");
      return false;
    }
    if (!response.ok) {
      throw new Error(
        `A verificação da sessão falhou (HTTP ${response.status}).`,
      );
    }

    const payload = await response.json();
    const usuario =
      payload?.user && typeof payload.user === "object"
        ? payload.user
        : payload;
    const papelAutenticado =
      typeof usuario?.role === "string" ? usuario.role.toUpperCase() : "";
    if (!isKnownRole(papelAutenticado)) {
      localStorage.removeItem("sige_access_token");
      localStorage.removeItem("sige_user");
      history.replaceState({ module: "auth" }, "", "/auth");
      await this.carregarModulo("auth");
      return false;
    }
    localStorage.setItem("sige_user", JSON.stringify(usuario));

    const papel = this.obterPapelAtual();
    this.atualizarPermissoesMenu(papel);
    return isKnownModule(modulo) && canAccessModule(papel, modulo);
  }

  atualizarPermissoesMenu(papel = this.obterPapelAtual()) {
    const menu = document.querySelector(".menu-navegacao");
    if (!menu) return;

    menu.querySelectorAll(".botao-menu").forEach((botao) => {
      botao.hidden = !canAccessModule(papel, botao.dataset.module);
    });

    menu.querySelectorAll(".grupo-menu").forEach((grupo) => {
      const botoes = [...grupo.querySelectorAll(".botao-menu")];
      if (botoes.length) grupo.hidden = botoes.every((botao) => botao.hidden);
    });
  }

  async carregarComponenteAuth(componente) {
    const areaAlvo = document.getElementById("area-componentes-auth");
    if (!areaAlvo) return;

    const compSeguro = componente.toLowerCase();

    this.carregarCSS(`web/views/components/${compSeguro}/${compSeguro}.css`);

    try {
      const resposta = await fetch(
        `web/views/components/${compSeguro}/${compSeguro}.html`,
      );
      if (!resposta.ok) throw new Error();
      areaAlvo.innerHTML = await resposta.text();

      await this.carregarJS(
        `web/views/components/${compSeguro}/${compSeguro}.js`,
      );

      if (compSeguro === "cadastro") {
        const funcaoSalva =
          sessionStorage.getItem("funcao_cadastro") || "aluno";
        const inputRadio = document.getElementById(`radio-${funcaoSalva}`);
        if (inputRadio) inputRadio.checked = true;
      }
    } catch (e) {
      areaAlvo.innerHTML = `<p class="texto-erro-carregamento">Erro ao carregar componente ${compSeguro}.</p>`;
    }
  }

  carregarCSS(caminho) {
    if (this.recursosAtivos.has(caminho)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = caminho;
    document.head.appendChild(link);
    this.recursosAtivos.add(caminho);
  }

  carregarJS(caminho) {
    return new Promise((resolve, reject) => {
      if (this.recursosAtivos.has(caminho)) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.type = "module";
      script.src = caminho;
      script.onload = () => {
        this.recursosAtivos.add(caminho);
        resolve();
      };
      script.onerror = () => {
        script.remove();
        reject(new Error(`Não foi possível carregar o script ${caminho}.`));
      };
      document.head.appendChild(script);
    });
  }

  atualizarBotaoAtivo(nomeModulo) {
    const menuNavegacao = document.querySelector(".menu-navegacao");
    if (!menuNavegacao) return;

    const botoes = menuNavegacao.querySelectorAll(".botao-menu");
    botoes.forEach((botao) => {
      const corresponde = botao.getAttribute("data-module") === nomeModulo;
      botao.classList.toggle("ativo", corresponde);
      if (corresponde) {
        botao.setAttribute("aria-current", "page");
      } else {
        botao.removeAttribute("aria-current");
      }
    });
  }
}

export const router = new Router();

window.carregarComponenteAuth = (comp) => router.carregarComponenteAuth(comp);
window.navegarParaModulo = (mod) => router.carregarModulo(mod);
