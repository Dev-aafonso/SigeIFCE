const API_ROUTES = {
    profile: '/users/me',
    password: '/users/me/password'
};

const STORAGE_KEYS = {
    token: 'sige_access_token',
    user: 'sige_user'
};

const ROLE_DETAILS = {
    ADMIN: ['Administrador', 'badge-adm'],
    ADM: ['Administrador', 'badge-adm'],
    ORGANIZADOR: ['Organizador', 'badge-adm'],
    GESTOR: ['Gestor / Professor', 'badge-gestor'],
    PROFESSOR: ['Professor', 'badge-gestor'],
    ALUNO: ['Aluno', 'badge-aluno']
};

const getUser = () => {
    try {
        const user = JSON.parse(localStorage.getItem(STORAGE_KEYS.user) || '{}');
        return user && typeof user === 'object' ? user : {};
    } catch (error) {
        console.error('Não foi possível ler os dados locais do usuário.', error);
        return {};
    }
};

const roleDetails = (role) => ROLE_DETAILS[role] || ['Usuário', 'badge-aluno'];
const userName = (user) => user.name || user.nome || user.email || 'Usuário';
const escapeHtml = (value) => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

function updateProfileDisplay(user) {
    const name = userName(user);
    const [role, badge] = roleDetails(user.role);
    const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=10b981&color=fff`;
    const profileFields = [
        ['nome-usuario', name],
        ['avatar-usuario', avatar],
        ['cargo-usuario', role],
        ['nome-usuario-modal', name],
        ['avatar-usuario-modal', avatar],
        ['cargo-usuario-modal', role]
    ];

    profileFields.forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (!element) return;
        if (id.startsWith('avatar-')) element.src = value;
        else element.textContent = value;
    });

    ['cargo-usuario', 'cargo-usuario-modal'].forEach((id) => {
        const element = document.getElementById(id);
        if (element) element.className = `cargo-perfil ${badge}`;
    });
}

function setMessage(element, text, type = '') {
    if (!element) return;
    element.textContent = text;
    element.className = `mensagem-conta ${type}`.trim();
}

async function requestApi(url, options) {
    const token = localStorage.getItem(STORAGE_KEYS.token);
    const headers = {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };

    let response;
    try {
        response = await fetch(url, { ...options, headers });
    } catch {
        throw new Error('Não foi possível conectar à API. Verifique sua conexão e tente novamente.');
    }

    const text = await response.text();
    const contentType = response.headers.get('content-type') || '';
    let data = {};

    if (text && contentType.includes('application/json')) {
        try {
            data = JSON.parse(text);
        } catch {
            throw new Error('A API retornou uma resposta JSON inválida.');
        }
    } else if (text) {
        data.message = new DOMParser().parseFromString(text, 'text/html').body.textContent.trim();
    }

    if (!response.ok) {
        const message = data.message || `A API recusou a solicitação (HTTP ${response.status}).`;
        throw new Error(Array.isArray(message) ? message.join(' ') : message);
    }
    return data;
}

function renderAccountView(dialog, title, description, content) {
    dialog.querySelector('.cabecalho-modal h3').textContent = title;
    dialog.querySelector('.cabecalho-modal p')?.replaceChildren(description);
    dialog.querySelector('.corpo-modal').innerHTML = content;
}

function backButton() {
    return '<button type="button" class="botao-opcao-modal botao-voltar-conta" data-account-action="home">Voltar ao perfil</button>';
}

function openProfileForm(dialog) {
    const user = getUser();
    renderAccountView(dialog, 'Meus Dados', 'Atualize as informações da sua conta.', `
        <form id="form-dados-conta" class="formulario-conta">
            <div class="grupo-formulario">
                <label for="nome-conta">Nome completo *</label>
                <input id="nome-conta" name="name" type="text" value="${escapeHtml(user.name || user.nome || '')}" autocomplete="name" required>
            </div>
            <div class="grupo-formulario">
                <label for="email-conta">E-mail *</label>
                <input id="email-conta" name="email" type="email" value="${escapeHtml(user.email || '')}" autocomplete="email" required>
            </div>
            <p id="mensagem-dados-conta" class="mensagem-conta" role="alert" aria-live="polite"></p>
            <button class="botao-primario" type="submit">Salvar alterações</button>
            ${backButton()}
        </form>
    `);
    dialog.querySelector('#form-dados-conta').addEventListener('submit', saveProfile);
}

function openPasswordForm(dialog) {
    renderAccountView(dialog, 'Alterar Senha', 'Informe sua senha atual e escolha uma nova senha.', `
        <form id="form-alterar-senha" class="formulario-conta">
            <div class="grupo-formulario">
                <label for="senha-atual-conta">Senha atual *</label>
                <input id="senha-atual-conta" name="currentPassword" type="password" autocomplete="current-password" required>
            </div>
            <div class="grupo-formulario">
                <label for="nova-senha-conta">Nova senha *</label>
                <input id="nova-senha-conta" name="newPassword" type="password" autocomplete="new-password" minlength="6" required>
            </div>
            <div class="grupo-formulario">
                <label for="confirmacao-senha-conta">Confirme a nova senha *</label>
                <input id="confirmacao-senha-conta" name="passwordConfirmation" type="password" autocomplete="new-password" minlength="6" required>
            </div>
            <p id="mensagem-alterar-senha" class="mensagem-conta" role="alert" aria-live="polite"></p>
            <button class="botao-primario" type="submit">Atualizar senha</button>
            ${backButton()}
        </form>
    `);
    dialog.querySelector('#form-alterar-senha').addEventListener('submit', changePassword);
}

function openProfileHome(dialog) {
    const user = getUser();
    const [role, badge] = roleDetails(user.role);
    renderAccountView(dialog, 'Perfil do Usuário', 'Gerencie seus dados e as configurações da sua conta.', `
        <div class="cartao-usuario-modal">
            <img src="" alt="Foto do Usuário" class="avatar-modal" id="avatar-usuario-modal">
            <div class="detalhes-usuario-modal">
                <strong id="nome-usuario-modal">${escapeHtml(userName(user))}</strong>
                <span id="cargo-usuario-modal" class="cargo-perfil ${badge}">${escapeHtml(role)}</span>
                <span class="email-perfil-modal">${escapeHtml(user.email || '')}</span>
            </div>
        </div>
        <nav class="opcoes-modal">
            <button class="botao-opcao-modal" type="button" data-account-action="profile">Meus Dados</button>
            <button class="botao-opcao-modal" type="button" data-account-action="password">Alterar Senha</button>
            <button class="botao-opcao-modal perigo" id="botao-sair-conta" type="button">Sair do Sistema</button>
        </nav>
    `);
    updateProfileDisplay(user);
}

async function submitAccountForm(event, { url, body, loading, success, messageId, reset = false }) {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    const message = form.querySelector(`#${messageId}`);
    submit.disabled = true;
    setMessage(message, loading);

    try {
        const result = await requestApi(url, { method: 'PATCH', body: JSON.stringify(body(form)) });
        if (reset) form.reset();
        const successText = await success?.(result, form);
        if (successText) setMessage(message, successText, 'sucesso');
    } catch (error) {
        setMessage(message, error.message, 'erro');
    } finally {
        submit.disabled = false;
    }
}

function saveProfile(event) {
    const form = event.currentTarget;
    const name = form.elements.name.value.trim();
    const email = form.elements.email.value.trim();
    if (!name) {
        setMessage(form.querySelector('#mensagem-dados-conta'), 'Informe seu nome completo.', 'erro');
        event.preventDefault();
        return;
    }

    submitAccountForm(event, {
        url: API_ROUTES.profile,
        body: () => ({ name, email }),
        loading: 'Salvando seus dados...',
        success: (response) => {
            const current = getUser();
            const result = response.user || response;
            const user = {
                ...current,
                name: result.name || result.nome || name,
                email: result.email || email
            };
            localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
            updateProfileDisplay(user);
            return 'Dados atualizados com sucesso.';
        },
        messageId: 'mensagem-dados-conta'
    });
}

function changePassword(event) {
    const form = event.currentTarget;
    const { currentPassword, newPassword, passwordConfirmation } = form.elements;
    if (newPassword.value !== passwordConfirmation.value) {
        setMessage(form.querySelector('#mensagem-alterar-senha'), 'A nova senha e a confirmação não coincidem.', 'erro');
        event.preventDefault();
        return;
    }

    submitAccountForm(event, {
        url: API_ROUTES.password,
        body: () => ({
            currentPassword: currentPassword.value,
            newPassword: newPassword.value,
            passwordConfirmation: passwordConfirmation.value
        }),
        loading: 'Atualizando sua senha...',
        success: () => 'Senha alterada com sucesso.',
        messageId: 'mensagem-alterar-senha',
        reset: true
    });
}

function initializeAccount() {
    const dialog = document.getElementById('modal-perfil');
    if (!dialog) return;
    updateProfileDisplay(getUser());

    dialog.addEventListener('click', (event) => {
        const button = event.target.closest('[data-account-action], #botao-sair, #botao-sair-conta');
        if (!button) return;
        if (button.id === 'botao-sair' || button.id === 'botao-sair-conta') {
            localStorage.removeItem(STORAGE_KEYS.token);
            localStorage.removeItem(STORAGE_KEYS.user);
            window.location.assign('/');
            return;
        }

        if (button.dataset.accountAction === 'profile') openProfileForm(dialog);
        else if (button.dataset.accountAction === 'password') openPasswordForm(dialog);
        else if (button.dataset.accountAction === 'home') openProfileHome(dialog);
    });
    dialog.addEventListener('close', () => openProfileHome(dialog));
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAccount, { once: true });
} else {
    initializeAccount();
}
