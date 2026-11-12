import {
  interpretarRota, caminhoDaRota, chaveDaRota,
  normalizarModulo, normalizarComponenteAuth,
} from "./router-routing.mjs";

const INICIALIZADORES = Object.freeze({
  dashboard: "inicializarPainelPerfil",
  events: "inicializarModuloEventos",
  users: "inicializarGerenciamentoUsuarios",
  registrations: "inicializarModuloInscricoes",
  participants: "inicializarModuloParticipantes",
  certificates: "inicializarModuloCertificados",
  reports: "inicializarModuloRelatorios",
  config: "inicializarModuloConfig",
});

class Router {
  constructor() {
    this.areaConteudo = null;
    this.cacheModulos = new Map();
    this.recursosAtivos = new Set();
    this.scriptPromises = new Map();
    this.chaveAtual = null;
    this.carregamentoAtual = null;
    this.sequenciaNavegacao = 0;
    this.sequenciaAuth = 0;
    this.fetchEmAndamento = null;
    this.iniciado = false;
  }

  init() {
    if (this.iniciado) return this.carregamentoAtual;
    this.areaConteudo = document.getElementById("area-conteudo");
    if (!this.areaConteudo) throw new Error("Área principal da aplicação não encontrada.");
    this.iniciado = true;
    const sincronizar = () => this.carregarLocalizacao();
    window.addEventListener("popstate", sincronizar);
    window.addEventListener("hashchange", sincronizar);

    // Mantém compatibilidade com /registrations e URLs antigas.
    const rota = interpretarRota(window.location.hash, window.location.pathname);
    const canonica = caminhoDaRota(rota);
    if (window.location.pathname + window.location.hash !== canonica) {
      history.replaceState({ module: rota.module }, "", canonica);
    }
    return this.carregarLocalizacao();
  }

  navegar(modulo, componente = null) {
    const nome = normalizarModulo(modulo);
    if (!nome) return Promise.reject(new Error("Módulo não reconhecido."));
    const rota = { module: nome, component: nome === "auth" ? normalizarComponenteAuth(componente) : null };
    const destino = caminhoDaRota(rota);
    if (window.location.pathname + window.location.hash !== destino) {
      history.pushState({ module: nome }, "", destino);
    }
    return this.carregarLocalizacao();
  }

  carregarLocalizacao() {
    const rota = interpretarRota(window.location.hash, window.location.pathname);
    const chave = chaveDaRota(rota);
    if (this.chaveAtual === chave) return this.carregamentoAtual ?? Promise.resolve();
    this.chaveAtual = chave;
    const trabalho = this.carregarModulo(rota);
    this.carregamentoAtual = trabalho;
    return trabalho;
  }

  async carregarModulo(rota) {
    const { module: modulo, component: componente } = rota;
    const sequencia = ++this.sequenciaNavegacao;
    ++this.sequenciaAuth;
    this.fetchEmAndamento?.abort();
    this.fetchEmAndamento = null;
    const atual = () => sequencia === this.sequenciaNavegacao;

    document.body.classList.toggle("modo-auth", modulo === "auth");
    if (modulo !== "auth") this.atualizarBotaoAtivo(modulo);
    const pasta = modulo === "dashboard" ? "Dashboard" : modulo;
    if (["auth", "dashboard", "events", "users"].includes(modulo)) {
      this.carregarCSS(`/web/views/modules/${pasta}/${modulo}.css`);
    }

    try {
      let html = this.cacheModulos.get(modulo);
      if (html === undefined) {
        this.areaConteudo.innerHTML = '<div class="estado-carregamento" role="status" aria-live="polite">Carregando página...</div>';
        const controller = new AbortController();
        this.fetchEmAndamento = controller;
        const response = await fetch(`/web/views/modules/${pasta}/${modulo}.html`, {
          credentials: "same-origin", signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status} ao carregar ${modulo}.`);
        html = await response.text();
        this.cacheModulos.set(modulo, html);
      }
      if (!atual()) return;
      this.fetchEmAndamento = null;
      this.areaConteudo.innerHTML = html;

      await this.carregarJS(`/web/views/modules/${pasta}/${modulo}.js`);
      if (!atual()) return;
      if (modulo === "auth") {
        await this.carregarComponenteAuth(componente, sequencia);
        if (!atual()) return;
      } else {
        const nomeInicializador = INICIALIZADORES[modulo];
        const inicializador = window[nomeInicializador];
        if (typeof inicializador !== "function") {
          throw new Error(`Inicializador ausente: ${nomeInicializador}.`);
        }
        await inicializador();
        if (!atual()) return;
      }
      document.dispatchEvent(new CustomEvent("sige:module-loaded", { detail: { module: modulo } }));
    } catch (error) {
      if (!atual()) return; // Uma navegação posterior ganhou a corrida.
      console.error("SIGE: erro ao carregar módulo", modulo, error);
      this.areaConteudo.replaceChildren();
      const content = document.createElement("section");
      content.className = "module-wrapper fade-in";
      content.setAttribute("role", "alert");
      const heading = document.createElement("h2");
      heading.textContent = "Não foi possível abrir a página";
      const message = document.createElement("p");
      message.textContent = "O módulo solicitado não pôde ser carregado. Verifique sua conexão e tente novamente.";
      const retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = "Tentar novamente";
      retry.addEventListener("click", () => {
        if (this.chaveAtual !== chaveDaRota(rota)) return;
        this.chaveAtual = null;
        this.carregarLocalizacao();
      });
      content.append(heading, message, retry);
      this.areaConteudo.append(content);
      this.chaveAtual = null;
    } finally {
      if (atual()) this.fetchEmAndamento = null;
    }
  }

  async carregarComponenteAuth(componente, sequenciaPai) {
    const id = ++this.sequenciaAuth;
    const atual = () => id === this.sequenciaAuth && sequenciaPai === this.sequenciaNavegacao;
    const nome = normalizarComponenteAuth(componente);
    const area = document.getElementById("area-componentes-auth");
    if (!area) throw new Error("Área de autenticação não encontrada.");
    this.carregarCSS(`/web/views/components/${nome}/${nome}.css`);
    const response = await fetch(`/web/views/components/${nome}/${nome}.html`, { credentials: "same-origin" });
    if (!response.ok) throw new Error(`HTTP ${response.status} ao carregar ${nome}.`);
    const html = await response.text();
    if (!atual()) return;
    area.innerHTML = html;
    await this.carregarJS(`/web/views/components/${nome}/${nome}.js`);
    if (!atual()) return;
    if (nome === "cadastro") {
      let papel = "aluno";
      try { papel = sessionStorage.getItem("funcao_cadastro") || papel; } catch {}
      const radio = document.getElementById(`radio-${papel}`);
      if (radio) radio.checked = true;
    }
    document.dispatchEvent(new CustomEvent("sige:auth-component-loaded", { detail: { component: nome } }));
  }

  carregarCSS(path) {
    if (this.recursosAtivos.has(path)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = path;
    document.head.append(link);
    this.recursosAtivos.add(path);
  }

  carregarJS(path) {
    if (this.recursosAtivos.has(path)) return Promise.resolve();
    if (this.scriptPromises.has(path)) return this.scriptPromises.get(path);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.type = "module";
      script.src = path;
      script.onload = () => { this.recursosAtivos.add(path); resolve(); };
      script.onerror = () => { script.remove(); reject(new Error(`Erro ao carregar JavaScript: ${path}`)); };
      document.head.append(script);
    }).finally(() => this.scriptPromises.delete(path));
    this.scriptPromises.set(path, promise);
    return promise;
  }

  atualizarBotaoAtivo(modulo) {
    const menu = document.querySelector(".menu-navegacao");
    const titulo = document.getElementById("titulo-pagina-cabecalho");
    if (!menu) return;
    menu.querySelectorAll(".botao-menu").forEach((button) => {
      const ativo = button.dataset.module === modulo;
      button.classList.toggle("ativo", ativo);
      if (ativo) {
        button.setAttribute("aria-current", "page");
        if (titulo) titulo.textContent = button.textContent.trim();
      } else {
        button.removeAttribute("aria-current");
      }
    });
  }
}

export const router = new Router();

window.carregarComponenteAuth = (componente) => router.navegar("auth", componente);
window.navegarParaModulo = (modulo) => router.navegar(modulo);
