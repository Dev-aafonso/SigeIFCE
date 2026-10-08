import {
    canAccessModule,
    isKnownModule,
    isKnownRole
} from './access-control.mjs';

const MODULE_FILES = {
    dashboard: { folder: 'Dashboard', file: 'dashboard' },
    settings: { folder: 'config', file: 'config' }
};

class Router {
    constructor() {
        this.areaConteudo = null;
        this.cacheModulos = new Map();
        this.recursosAtivos = new Set();
    }

    init() {
        this.areaConteudo = document.getElementById('area-conteudo');
        
        window.addEventListener('popstate', (evento) => {
            const moduloUrl = window.location.pathname.replace(/^\/|\/$/g, '').toLowerCase() || 'auth';
            const moduloCarregar = evento.state?.module || moduloUrl;
            this.carregarModulo(moduloCarregar);
        });

        const segmentosCaminho = window.location.pathname.split('/').filter(Boolean);
        const moduloInicial = (segmentosCaminho.length > 0 && segmentosCaminho[0] !== 'index.html') 
                              ? segmentosCaminho[0].toLowerCase() 
                              : 'auth';

        history.replaceState({ module: moduloInicial }, "", `/${moduloInicial}`);
        this.carregarModulo(moduloInicial);
    }

    async carregarModulo(nomeModulo) {
        const moduloSeguro = nomeModulo.toLowerCase().replace(/[^a-z0-9_-]/g, '');
        if (!moduloSeguro) return;

        if (
            moduloSeguro === 'auth' &&
            localStorage.getItem('sige_access_token') &&
            isKnownRole(this.obterPapelAtual())
        ) {
            history.replaceState({ module: 'dashboard' }, '', '/dashboard');
            return this.carregarModulo('dashboard');
        }

        if (!this.autorizarModulo(moduloSeguro)) {
            if (isKnownRole(this.obterPapelAtual())) {
                await this.redirecionarAcessoNegado();
            }
            return;
        }

        if (moduloSeguro === 'auth') {
            document.body.classList.add('modo-auth');
        } else {
            document.body.classList.remove('modo-auth');
            this.atualizarBotaoAtivo(moduloSeguro);
        }

        const arquivoModulo = MODULE_FILES[moduloSeguro] || {
            folder: moduloSeguro === 'dashboard' ? 'Dashboard' : moduloSeguro,
            file: moduloSeguro
        };
        this.carregarCSS(`web/views/modules/${arquivoModulo.folder}/${arquivoModulo.file}.css`);

        try {
            if (this.cacheModulos.has(moduloSeguro)) {
                this.areaConteudo.innerHTML = this.cacheModulos.get(moduloSeguro);
            } else {
                this.areaConteudo.innerHTML = '<div class="estado-carregamento"><p aria-live="polite">Carregando...</p></div>';

                const resposta = await fetch(`web/views/modules/${arquivoModulo.folder}/${arquivoModulo.file}.html`);
                
                if (!resposta.ok) throw new Error(`HTTP Error: ${resposta.status}`);

                const html = await resposta.text();
                this.cacheModulos.set(moduloSeguro, html);
                this.areaConteudo.innerHTML = html;
            }

            await this.carregarJS(`web/views/modules/${arquivoModulo.folder}/${arquivoModulo.file}.js`);

            if (moduloSeguro === 'users') {
                window.inicializarGerenciamentoUsuarios?.();
            }

            if (moduloSeguro === 'dashboard') {
                window.inicializarPainelPerfil?.();
            }

            if (moduloSeguro === 'events') {
                window.inicializarModuloEventos?.();
            }

            if (moduloSeguro === 'auth') {
                window.carregarComponenteAuth('login');
            }

        } catch (erro) {
            console.error(`Não foi possível carregar o módulo "${moduloSeguro}".`, erro);
            this.areaConteudo.innerHTML = `
                <div class="module-wrapper fade-in" role="alert">
                    <h2>Não foi possível abrir esta página</h2>
                    <hr>
                    <p>O módulo <strong>${moduloSeguro}</strong> não está disponível no momento.</p>
                </div>`;
        }
    }

    async redirecionarAcessoNegado() {
        history.replaceState({ module: 'dashboard' }, '', '/dashboard');
        await this.carregarModulo('dashboard');

        const aviso = document.createElement('p');
        aviso.className = 'aviso-acesso-negado';
        aviso.setAttribute('role', 'alert');
        aviso.textContent = 'Acesso não permitido. Seu perfil não possui autorização para abrir essa página.';
        this.areaConteudo.prepend(aviso);
    }

    obterUsuarioAtual() {
        try {
            const usuario = JSON.parse(localStorage.getItem('sige_user') || 'null');
            return usuario && typeof usuario === 'object' ? usuario : null;
        } catch (erro) {
            console.error('Não foi possível ler o perfil salvo da sessão.', erro);
            return null;
        }
    }

    obterPapelAtual() {
        const papel = this.obterUsuarioAtual()?.role;
        return typeof papel === 'string' ? papel.toUpperCase() : '';
    }

    autorizarModulo(modulo) {
        if (modulo === 'auth' || modulo === 'events') return true;

        const token = localStorage.getItem('sige_access_token');
        if (!token) {
            history.replaceState({ module: 'auth' }, '', '/auth');
            this.carregarModulo('auth');
            return false;
        }

        const papel = this.obterPapelAtual();
        if (!isKnownRole(papel)) {
            history.replaceState({ module: 'auth' }, '', '/auth');
            this.carregarModulo('auth');
            return false;
        }

        this.atualizarPermissoesMenu(papel);
        return isKnownModule(modulo) && canAccessModule(papel, modulo);
    }

    atualizarPermissoesMenu(papel = this.obterPapelAtual()) {
        const menu = document.querySelector('.menu-navegacao');
        if (!menu) return;

        menu.querySelectorAll('.botao-menu').forEach((botao) => {
            botao.hidden = !canAccessModule(papel, botao.dataset.module);
        });

        menu.querySelectorAll('.grupo-menu').forEach((grupo) => {
            const botoes = [...grupo.querySelectorAll('.botao-menu')];
            if (botoes.length) grupo.hidden = botoes.every((botao) => botao.hidden);
        });
    }

    async carregarComponenteAuth(componente) {
        const areaAlvo = document.getElementById('area-componentes-auth');
        if (!areaAlvo) return;

        const compSeguro = componente.toLowerCase();

        this.carregarCSS(`web/views/components/${compSeguro}/${compSeguro}.css`);

        try {
            const resposta = await fetch(`web/views/components/${compSeguro}/${compSeguro}.html`);
            if (!resposta.ok) throw new Error();
            areaAlvo.innerHTML = await resposta.text();

            await this.carregarJS(`web/views/components/${compSeguro}/${compSeguro}.js`);

            if (compSeguro === 'cadastro') {
                const funcaoSalva = sessionStorage.getItem('funcao_cadastro') || 'aluno';
                const inputRadio = document.getElementById(`radio-${funcaoSalva}`);
                if (inputRadio) inputRadio.checked = true;
            }
        } catch(e) {
            areaAlvo.innerHTML = `<p class="texto-erro-carregamento">Erro ao carregar componente ${compSeguro}.</p>`;
        }
    }

    carregarCSS(caminho) {
        if (this.recursosAtivos.has(caminho)) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
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
            const script = document.createElement('script');
            script.type = 'module';
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
        const menuNavegacao = document.querySelector('.menu-navegacao');
        const tituloCabecalho = document.getElementById('titulo-pagina-cabecalho');
        if (!menuNavegacao) return;

        const botoes = menuNavegacao.querySelectorAll('.botao-menu');
        botoes.forEach(botao => {
            const corresponde = botao.getAttribute('data-module') === nomeModulo;
            botao.classList.toggle('ativo', corresponde);
            if (corresponde) {
                botao.setAttribute('aria-current', 'page');
                if (tituloCabecalho) tituloCabecalho.textContent = botao.textContent.trim();
            } else {
                botao.removeAttribute('aria-current');
            }
        });
    }
}

export const router = new Router();

window.carregarComponenteAuth = (comp) => router.carregarComponenteAuth(comp);
window.navegarParaModulo = (mod) => router.carregarModulo(mod);

(function () {
  "use strict";

  const path =
    window.location.pathname.replace(/\/+$/, "") || "/";

  const publicRoutes = [
    "/",
    "/login",
    "/cadastro",
    "/selecao-funcao",
    "/events",
  ];

  if (
    publicRoutes.includes(path)
  ) {
    return;
  }

  const token =
    localStorage.getItem(
      "sige_access_token"
    );

  if (!token) {
    window.location.href =
      "/login";
  }
})();