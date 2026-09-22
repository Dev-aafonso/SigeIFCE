import { router } from './router.js';

document.addEventListener('DOMContentLoaded', () => {
    const barraLateral = document.getElementById('barra-lateral');
    const alternadorBarraLateral = document.getElementById('alternador-barra-lateral');
    const painelFundoLateral = document.getElementById('painel-fundo-lateral');
    const menuNavegacao = document.querySelector('.menu-navegacao');
    const botaoSair = document.getElementById('botao-sair');

    router.init();

    alternadorBarraLateral?.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
            barraLateral?.classList.toggle('abrir');
            painelFundoLateral?.classList.toggle('mostrar');
        } else {
            barraLateral?.classList.toggle('recolhida');
        }
    });

    painelFundoLateral?.addEventListener('click', () => {
        barraLateral?.classList.remove('abrir');
        painelFundoLateral?.classList.remove('mostrar');
    });

    const CARGOS_USUARIO = {
        ADM: { label: 'Administrador', class: 'badge-adm' },
        GESTOR: { label: 'Gestor / Prof', class: 'badge-gestor' },
        ALUNO: { label: 'Aluno', class: 'badge-aluno' }
    };

    function definirPerfilUsuario({ nome, cargo, urlAvatar }) {
        const configCargo = CARGOS_USUARIO[cargo] || CARGOS_USUARIO.ALUNO;
        const avatarFinal = urlAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(nome)}&background=10b981&color=fff`;

        const elNome = document.getElementById('nome-usuario');
        const elAvatar = document.getElementById('avatar-usuario');
        const elCargo = document.getElementById('cargo-usuario');

        if (elNome) elNome.textContent = nome;
        if (elAvatar) elAvatar.src = avatarFinal;
        if (elCargo) {
            elCargo.textContent = configCargo.label;
            elCargo.className = `cargo-perfil ${configCargo.class}`;
        }
        
        const elNomeModal = document.getElementById('nome-usuario-modal');
        const elAvatarModal = document.getElementById('avatar-usuario-modal');
        const elCargoModal = document.getElementById('cargo-usuario-modal');

        if (elNomeModal) elNomeModal.textContent = nome;
        if (elAvatarModal) elAvatarModal.src = avatarFinal;
        if (elCargoModal) {
            elCargoModal.textContent = configCargo.label;
            elCargoModal.className = `cargo-perfil ${configCargo.class}`;
        }
    }

    definirPerfilUsuario({ nome: 'ADM', cargo: 'ADM', urlAvatar: '' });

    botaoSair?.addEventListener('click', () => {
        history.pushState({ module: 'auth' }, "", `/auth`);
        router.carregarModulo('auth');
    });

    menuNavegacao?.addEventListener('click', (evento) => {
        const botaoClicado = evento.target.closest('.botao-menu');
        if (!botaoClicado) return;

        evento.preventDefault(); 
        const moduloCarregar = botaoClicado.getAttribute('data-module');
        
        if (window.innerWidth <= 768) {
            barraLateral?.classList.remove('abrir');
            painelFundoLateral?.classList.remove('mostrar');
        }

        if (history.state?.module === moduloCarregar) return;

        history.pushState({ module: moduloCarregar }, "", `/${moduloCarregar}`);
        router.carregarModulo(moduloCarregar);
    });
});