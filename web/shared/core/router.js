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

        if (moduloSeguro === 'auth') {
            document.body.classList.add('modo-auth');
        } else {
            document.body.classList.remove('modo-auth');
            this.atualizarBotaoAtivo(moduloSeguro);
        }

        this.carregarCSS(`web/views/modules/${moduloSeguro}/${moduloSeguro}.css`);

        try {
            if (this.cacheModulos.has(moduloSeguro)) {
                this.areaConteudo.innerHTML = this.cacheModulos.get(moduloSeguro);
            } else {
                this.areaConteudo.innerHTML = '<div class="estado-carregamento"><p aria-live="polite">Carregando...</p></div>';
                
                const pastaModulo = moduloSeguro === 'dashboard' ? 'Dashboard' : moduloSeguro;
                const resposta = await fetch(`web/views/modules/${pastaModulo}/${moduloSeguro}.html`);
                
                if (!resposta.ok) throw new Error(`HTTP Error: ${resposta.status}`);

                const html = await resposta.text();
                this.cacheModulos.set(moduloSeguro, html);
                this.areaConteudo.innerHTML = html;
            }

            await this.carregarJS(`web/views/modules/${moduloSeguro}/${moduloSeguro}.js`);

            if (moduloSeguro === 'auth') {
                window.carregarComponenteAuth('login');
            }

        } catch (erro) {
            this.areaConteudo.innerHTML = `
                <div class="module-wrapper fade-in" role="alert">
                    <h2>Erro de Navegação</h2>
                    <hr>
                    <p>O módulo <strong>${moduloSeguro}</strong> ainda não foi implementado.</p>
                </div>`;
        }
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
        return new Promise((resolve) => {
            if (this.recursosAtivos.has(caminho)) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = caminho;
            script.onload = () => {
                this.recursosAtivos.add(caminho);
                resolve();
            };
            script.onerror = () => resolve(); 
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
    window.location.pathname;

  const publicRoutes = [
    "/",
    "/login",
    "/cadastro",
    "/selecao-funcao",
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