(() => {
    const USERS_API = '/users';
    const USER_ROLES = [
        ['ADMIN', 'Administrador'],
        ['ORGANIZADOR', 'Organizador'],
        ['PROFESSOR', 'Professor'],
        ['ALUNO', 'Aluno']
    ];

    function setUsersMessage(text, type = '') {
        const message = document.getElementById('mensagem-usuarios');
        if (!message) return;
        message.textContent = text;
        message.dataset.tipo = type;
    }

    function getCurrentUser() {
        try {
            const user = JSON.parse(localStorage.getItem('sige_user') || '{}');
            return user && typeof user === 'object' ? user : {};
        } catch (error) {
            console.error('Não foi possível ler os dados locais do usuário.', error);
            return {};
        }
    }

    async function requestUsersApi(path = '', options = {}) {
        const token = localStorage.getItem('sige_access_token');
        if (!token) {
            throw new Error('Sua sessão não está ativa. Entre novamente para continuar.');
        }

        let response;
        try {
            response = await fetch(`${USERS_API}${path}`, {
                ...options,
                headers: {
                    Accept: 'application/json',
                    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
                    Authorization: `Bearer ${token}`,
                    ...options.headers
                }
            });
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

    function createRoleSelect(user, isCurrentUser) {
        const select = document.createElement('select');
        select.className = 'seletor-papel-usuario';
        select.setAttribute('aria-label', `Perfil de ${user.email}`);
        select.disabled = isCurrentUser;

        USER_ROLES.forEach(([role, label]) => {
            const option = document.createElement('option');
            option.value = role;
            option.textContent = label;
            option.selected = user.role === role;
            select.append(option);
        });

        return select;
    }

    function createUserRow(user) {
        const currentUser = getCurrentUser();
        const isCurrentUser = Boolean(
            (currentUser.id && currentUser.id === user.id) ||
            (currentUser.email && currentUser.email.toLowerCase() === user.email.toLowerCase())
        );
        const row = document.createElement('tr');
        row.dataset.userId = user.id;

        const emailCell = document.createElement('td');
        emailCell.textContent = user.email;
        if (isCurrentUser) {
            const currentLabel = document.createElement('span');
            currentLabel.className = 'usuario-atual';
            currentLabel.textContent = 'Sua conta';
            emailCell.append(currentLabel);
        }

        const idCell = document.createElement('td');
        const idText = document.createElement('span');
        idText.className = 'identificador-usuario';
        idText.textContent = user.id;
        idCell.append(idText);

        const roleCell = document.createElement('td');
        const roleSelect = createRoleSelect(user, isCurrentUser);
        roleCell.append(roleSelect);

        const actionsCell = document.createElement('td');
        const actions = document.createElement('div');
        actions.className = 'acoes-usuario';

        const saveButton = document.createElement('button');
        saveButton.className = 'botao-salvar-papel';
        saveButton.type = 'button';
        saveButton.textContent = 'Salvar perfil';
        saveButton.disabled = isCurrentUser;
        saveButton.addEventListener('click', () => updateUserRole(user, roleSelect, saveButton));

        const removeButton = document.createElement('button');
        removeButton.className = 'botao-remover-usuario';
        removeButton.type = 'button';
        removeButton.textContent = 'Remover';
        removeButton.disabled = isCurrentUser;
        removeButton.title = isCurrentUser ? 'Não é possível remover a própria conta.' : '';
        removeButton.addEventListener('click', () => removeUser(user, row, removeButton));

        actions.append(saveButton, removeButton);
        actionsCell.append(actions);
        row.append(emailCell, idCell, roleCell, actionsCell);
        return row;
    }

    async function loadUsers() {
        const tableBody = document.getElementById('lista-usuarios');
        const refreshButton = document.getElementById('atualizar-usuarios');
        if (!tableBody || !refreshButton) return;

        refreshButton.disabled = true;
        tableBody.replaceChildren();
        const loadingRow = document.createElement('tr');
        const loadingCell = document.createElement('td');
        loadingCell.colSpan = 4;
        loadingCell.textContent = 'Carregando usuários...';
        loadingRow.append(loadingCell);
        tableBody.append(loadingRow);
        setUsersMessage('');

        try {
            const users = await requestUsersApi();
            if (!Array.isArray(users)) {
                throw new Error('A API retornou uma lista de usuários em formato inválido.');
            }

            tableBody.replaceChildren();
            if (!users.length) {
                const emptyRow = document.createElement('tr');
                const emptyCell = document.createElement('td');
                emptyCell.colSpan = 4;
                emptyCell.textContent = 'Nenhum usuário encontrado.';
                emptyRow.append(emptyCell);
                tableBody.append(emptyRow);
                return;
            }

            users.forEach((user) => tableBody.append(createUserRow(user)));
            setUsersMessage(`${users.length} usuário(s) encontrado(s).`);
        } catch (error) {
            tableBody.replaceChildren();
            setUsersMessage(error.message, 'erro');
        } finally {
            refreshButton.disabled = false;
        }
    }

    async function updateUserRole(user, select, button) {
        const role = select.value;
        if (role === user.role) {
            setUsersMessage(`O perfil de ${user.email} não foi alterado.`);
            return;
        }

        button.disabled = true;
        select.disabled = true;
        button.textContent = 'Salvando...';

        try {
            const updatedUser = await requestUsersApi(`/${encodeURIComponent(user.id)}/role`, {
                method: 'PATCH',
                body: JSON.stringify({ role })
            });
            if (!updatedUser || updatedUser.role !== role) {
                throw new Error('A API não confirmou a atualização do perfil.');
            }
            user.role = updatedUser.role;
            setUsersMessage(`Perfil de ${user.email} atualizado para ${role}.`, 'sucesso');
        } catch (error) {
            select.value = user.role;
            setUsersMessage(error.message, 'erro');
        } finally {
            button.disabled = false;
            select.disabled = false;
            button.textContent = 'Salvar perfil';
        }
    }

    async function removeUser(user, row, button) {
        if (!window.confirm(`Tem certeza de que deseja remover a conta ${user.email}? Esta ação não pode ser desfeita.`)) {
            return;
        }

        button.disabled = true;
        button.textContent = 'Removendo...';

        try {
            await requestUsersApi(`/${encodeURIComponent(user.id)}`, { method: 'DELETE' });
            row.remove();
            const tableBody = document.getElementById('lista-usuarios');
            if (tableBody && !tableBody.children.length) {
                const emptyRow = document.createElement('tr');
                const emptyCell = document.createElement('td');
                emptyCell.colSpan = 4;
                emptyCell.textContent = 'Nenhum usuário encontrado.';
                emptyRow.append(emptyCell);
                tableBody.append(emptyRow);
            }
            setUsersMessage(`A conta ${user.email} foi removida.`, 'sucesso');
        } catch (error) {
            setUsersMessage(error.message, 'erro');
            button.disabled = false;
            button.textContent = 'Remover';
        }
    }

    window.inicializarGerenciamentoUsuarios = () => {
        const refreshButton = document.getElementById('atualizar-usuarios');
        if (refreshButton && refreshButton.dataset.initialized !== 'true') {
            refreshButton.addEventListener('click', loadUsers);
            refreshButton.dataset.initialized = 'true';
        }
        loadUsers();
    };
})();
