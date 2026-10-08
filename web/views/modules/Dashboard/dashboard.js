import {
    getAllowedModules,
    getRoleLabel,
    MODULE_LABELS
} from '../../../shared/core/access-control.mjs';

const storedUser = (() => {
    try {
        const user = JSON.parse(localStorage.getItem('sige_user') || '{}');
        return user && typeof user === 'object' ? user : {};
    } catch (error) {
        console.error('Não foi possível ler o perfil salvo.', error);
        return {};
    }
})();

const role = typeof storedUser.role === 'string' ? storedUser.role : '';
const name = storedUser.name || storedUser.nome || storedUser.email || 'usuário';

window.inicializarPainelPerfil = () => {
    const description = document.getElementById('descricao-painel-perfil');
    const title = document.getElementById('titulo-painel-perfil');
    const shortcuts = document.getElementById('atalhos-painel-perfil');
    if (!shortcuts) return;

    if (title) title.textContent = `Olá, ${name}`;
    if (description) description.textContent = `Perfil atual: ${getRoleLabel(role)}. Acesse as áreas disponíveis para sua função.`;
    shortcuts.replaceChildren();

    const modules = getAllowedModules(role).filter((module) => module !== 'dashboard');
    if (!modules.length) {
        const message = document.createElement('p');
        message.textContent = 'Não há módulos disponíveis para este perfil.';
        shortcuts.append(message);
        return;
    }

    modules.forEach((module) => {
        const button = document.createElement('button');
        button.className = 'atalho-perfil';
        button.type = 'button';

        const label = document.createElement('strong');
        label.textContent = MODULE_LABELS[module];
        const hint = document.createElement('span');
        hint.textContent = 'Abrir módulo';
        button.append(label, hint);
        button.addEventListener('click', () => {
            history.pushState({ module }, '', `/${module}`);
            window.navegarParaModulo?.(module);
        });
        shortcuts.append(button);
    });
};
