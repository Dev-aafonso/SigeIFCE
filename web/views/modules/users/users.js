(() => {
  const USERS_API = "/users";
  const USER_ROLES = [
    ["ADMIN", "Administrador"],
    ["ORGANIZADOR", "Organizador"],
    ["PROFESSOR", "Professor"],
    ["ALUNO", "Aluno"],
  ];

  let cachedUsers = [];
  let currentPage = 1;
  const pageSize = 10;

  function setUsersMessage(text, type = "") {
    const message = document.getElementById("mensagem-usuarios");
    if (!message) return;
    message.textContent = text;
    message.dataset.tipo = type;
  }

  function getCurrentUser() {
    try {
      const user = JSON.parse(localStorage.getItem("sige_user") || "{}");
      return user && typeof user === "object" ? user : {};
    } catch (error) {
      console.error("Não foi possível ler os dados locais do usuário.", error);
      return {};
    }
  }

  async function requestUsersApi(path = "", options = {}) {

    let response;
    try {
      response = await fetch(`${USERS_API}${path}`, {
        credentials: "same-origin",
        ...options,
        headers: {
          Accept: "application/json",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...options.headers,
        },
      });
    } catch {
      throw new Error(
        "Não foi possível conectar à API. Verifique sua conexão e tente novamente.",
      );
    }

    const text = await response.text();
    const contentType = response.headers.get("content-type") || "";
    let data = {};

    if (text && contentType.includes("application/json")) {
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("A API retornou uma resposta JSON inválida.");
      }
    } else if (text) {
      data.message = new DOMParser()
        .parseFromString(text, "text/html")
        .body.textContent.trim();
    }

    if (!response.ok) {
      const message =
        data.message ||
        `A API recusou a solicitação (HTTP ${response.status}).`;
      throw new Error(Array.isArray(message) ? message.join(" ") : message);
    }

    return data;
  }

  function createRoleSelect(user, isCurrentUser) {
    const select = document.createElement("select");
    select.className = "seletor-papel-usuario";
    select.setAttribute("aria-label", `Perfil de ${user.email}`);
    select.disabled = isCurrentUser;

    USER_ROLES.forEach(([role, label]) => {
      const option = document.createElement("option");
      option.value = role;
      option.textContent = label;
      option.selected = user.role === role;
      select.append(option);
    });

    return select;
  }

  function makeDialog(titleText, user) {
    const dialog = document.createElement("dialog");
    dialog.className = "dialogo-usuario";
    const title = document.createElement("h3");
    title.textContent = titleText;
    const description = document.createElement("p");
    description.textContent = user.name ? `${user.name} · ${user.email}` : user.email;
    const message = document.createElement("p");
    message.className = "mensagem-dialogo-usuario";
    message.setAttribute("role", "alert");
    const controls = document.createElement("div");
    controls.className = "controles-dialogo-usuario";
    const close = document.createElement("button");
    close.type = "button"; close.className = "botao-dialogo-secundario"; close.textContent = "Fechar";
    close.addEventListener("click", () => dialog.close());
    dialog.append(title, description, message, controls, close);
    document.querySelector(".gerenciamento-usuarios").append(dialog);
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    return { dialog, message, controls };
  }

  function openRoleEditor(user) {
    const { dialog, message, controls } = makeDialog("Editar perfil", user);
    const label = document.createElement("label"); label.textContent = "Perfil";
    const select = createRoleSelect(user, false); label.append(select);
    const save = document.createElement("button"); save.type = "button"; save.className = "botao-salvar-papel"; save.textContent = "Salvar perfil";
    save.addEventListener("click", async () => {
      if (select.value === user.role) { dialog.close(); return; }
      save.disabled = true; select.disabled = true; message.textContent = "Salvando...";
      try {
        const role = select.value;
        const updated = await requestUsersApi(`/${encodeURIComponent(user.id)}/role`, { method: "PATCH", body: JSON.stringify({ role }) });
        if (updated.role !== role) throw new Error("A API não confirmou a atualização do perfil.");
        user.role = updated.role; dialog.close(); renderUsers(); setUsersMessage("Perfil atualizado.", "sucesso");
      } catch (error) { message.textContent = error.message; save.disabled = false; select.disabled = false; }
    });
    controls.append(label, save); dialog.showModal();
  }

  function openUserActions(user) {
    const { dialog, message, controls } = makeDialog("Ações do usuário", user);
    const toggle = document.createElement("button"); toggle.type = "button"; toggle.className = "botao-dialogo-secundario";
    toggle.textContent = user.isActive ? "Desativar conta" : "Ativar conta";
    toggle.addEventListener("click", async () => {
      if (!window.confirm(`${user.isActive ? "Desativar" : "Ativar"} a conta de ${user.email}?`)) return;
      toggle.disabled = true; remove.disabled = true; message.textContent = "Atualizando...";
      try {
        const updated = await requestUsersApi(`/${encodeURIComponent(user.id)}/status`, { method: "PATCH", body: JSON.stringify({ isActive: !user.isActive }) });
        user.isActive = updated.isActive; dialog.close(); renderUsers(); setUsersMessage("Status atualizado.", "sucesso");
      } catch (error) { message.textContent = error.message; toggle.disabled = false; remove.disabled = false; }
    });
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "botao-remover-usuario"; remove.textContent = "Remover conta";
    remove.addEventListener("click", async () => {
      if (!window.confirm(`Tem certeza de que deseja remover a conta ${user.email}? Esta ação não pode ser desfeita.`)) return;
      toggle.disabled = true; remove.disabled = true; message.textContent = "Removendo...";
      try {
        await requestUsersApi(`/${encodeURIComponent(user.id)}`, { method: "DELETE" });
        cachedUsers = cachedUsers.filter(item => item.id !== user.id); dialog.close(); renderUsers(); setUsersMessage(`A conta ${user.email} foi removida.`, "sucesso");
      } catch (error) { message.textContent = error.message; toggle.disabled = false; remove.disabled = false; }
    });
    controls.append(toggle, remove); dialog.showModal();
  }

  function createUserRow(user) {
    const currentUser = getCurrentUser();
    const isCurrentUser = Boolean((currentUser.id && currentUser.id === user.id) || (currentUser.email && user.email && currentUser.email.toLowerCase() === user.email.toLowerCase()));
    const row = document.createElement("tr"); row.dataset.userId = user.id;
    const identityCell = document.createElement("td");
    const identity = document.createElement("div"); identity.className = "identidade-usuario";
    const avatar = document.createElement("span"); avatar.className = "avatar-usuario"; avatar.dataset.role = user.role;
    avatar.setAttribute("aria-hidden", "true"); avatar.textContent = (user.name || user.email || "?").split(/\s+/).map(part => part[0]).slice(0, 2).join("").toUpperCase();
    const details = document.createElement("div"); const name = document.createElement("strong"); name.textContent = user.name || "Nome não informado";
    const email = document.createElement("span"); email.textContent = user.email; details.append(name, email);
    if (isCurrentUser) { const label = document.createElement("span"); label.className = "usuario-atual"; label.textContent = "Sua conta"; details.append(label); }
    identity.append(avatar, details); identityCell.append(identity);
    const roleCell = document.createElement("td"); const role = document.createElement("span"); role.className = "etiqueta-perfil-usuario"; role.dataset.role = user.role; role.textContent = USER_ROLES.find(([key]) => key === user.role)?.[1] || user.role || "Não informado"; roleCell.append(role);
    const statusCell = document.createElement("td"); const status = document.createElement("span"); status.className = "etiqueta-status-usuario"; status.dataset.active = String(user.isActive); status.textContent = user.isActive ? "Ativo" : "Inativo"; statusCell.append(status);
    const accessCell = document.createElement("td"); accessCell.className = "ultimo-acesso-usuario"; const date = user.lastAccessAt ? new Date(user.lastAccessAt) : null; accessCell.textContent = date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date) : "Ainda não acessou";
    const actionCell = document.createElement("td"); const actions = document.createElement("div"); actions.className = "acoes-usuario";
    const edit = document.createElement("button"); edit.type = "button"; edit.className = "botao-icone-usuario"; edit.disabled = isCurrentUser; edit.setAttribute("aria-label", `Editar perfil de ${user.name || user.email}`); edit.title = isCurrentUser ? "Não é possível alterar o próprio perfil." : "Editar perfil";
    edit.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="m10 14 9-9 2 2-9 9-3 1z"/></svg>';
    edit.addEventListener("click", () => openRoleEditor(user));
    const more = document.createElement("button"); more.type = "button"; more.className = "botao-icone-usuario"; more.disabled = isCurrentUser; more.setAttribute("aria-label", `Mais ações para ${user.name || user.email}`); more.title = isCurrentUser ? "Não é possível alterar a própria conta." : "Mais ações"; more.textContent = "⋯";
    more.addEventListener("click", () => openUserActions(user)); actions.append(edit, more); actionCell.append(actions);
    row.append(identityCell, roleCell, statusCell, accessCell, actionCell); return row;
  }

  async function loadUsers() {
    const tableBody = document.getElementById("lista-usuarios");
    const refreshButton = document.getElementById("atualizar-usuarios");
    if (!tableBody || !refreshButton) return;

    refreshButton.disabled = true;
    tableBody.replaceChildren();
    const loadingRow = document.createElement("tr");
    const loadingCell = document.createElement("td");
    loadingCell.colSpan = 5;
    loadingCell.textContent = "Carregando usuários...";
    loadingRow.append(loadingCell);
    tableBody.append(loadingRow);
    setUsersMessage("");

    try {
      const users = await requestUsersApi();
      if (!Array.isArray(users)) {
        throw new Error(
          "A API retornou uma lista de usuários em formato inválido.",
        );
      }

      tableBody.replaceChildren();
      cachedUsers = users;
      if (!users.length) {
        const emptyRow = document.createElement("tr");
        const emptyCell = document.createElement("td");
        emptyCell.colSpan = 5;
        emptyCell.textContent = "Nenhum usuário encontrado.";
        emptyRow.append(emptyCell);
        tableBody.append(emptyRow);
        document.getElementById("contagem-usuarios").textContent = "Mostrando 0 de 0 usuários";
        return;
      }

      cachedUsers = users;
      renderUsers();
    } catch (error) {
      tableBody.replaceChildren();
      setUsersMessage(error.message, "erro");
    } finally {
      refreshButton.disabled = false;
    }
  }

  function renderUsers() {
    const tbody = document.getElementById("lista-usuarios");
    if (!tbody) return;
    const term = (document.getElementById("busca-usuarios")?.value || "").trim().toLocaleLowerCase("pt-BR");
    const role = document.getElementById("filtro-perfil-usuarios")?.value || "";
    const status = document.getElementById("filtro-status-usuarios")?.value || "";
    const filtered = cachedUsers.filter(user => (!status || String(user.isActive) === status) && (!role || user.role === role) && `${user.name || ""} ${user.email}`.toLocaleLowerCase("pt-BR").includes(term));
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    currentPage = Math.min(currentPage, pages);
    const start = (currentPage - 1) * pageSize;
    const pageUsers = filtered.slice(start, start + pageSize);
    tbody.replaceChildren();
    pageUsers.forEach(user => tbody.append(createUserRow(user)));
    if (!filtered.length) { const row = tbody.insertRow(); const cell = row.insertCell(); cell.colSpan = 5; cell.textContent = "Nenhum usuário encontrado."; }
    const footer = document.getElementById("contagem-usuarios"); footer.replaceChildren();
    const count = document.createElement("span"); count.textContent = `Mostrando ${pageUsers.length} de ${filtered.length} usuários${filtered.length !== cachedUsers.length ? ` · ${cachedUsers.length} no total` : ""}`; footer.append(count);
    if (pages > 1) {
      const nav = document.createElement("nav"); nav.className = "paginacao-usuarios"; nav.setAttribute("aria-label", "Páginas de usuários");
      const makePageButton = (label, page, disabled = false) => { const button = document.createElement("button"); button.type = "button"; button.textContent = label; button.disabled = disabled; if (page === currentPage) button.setAttribute("aria-current", "page"); button.addEventListener("click", () => { currentPage = page; renderUsers(); }); nav.append(button); };
      makePageButton("‹", currentPage - 1, currentPage === 1);
      for (let page = Math.max(1, currentPage - 1); page <= Math.min(pages, currentPage + 1); page++) makePageButton(String(page), page);
      makePageButton("›", currentPage + 1, currentPage === pages); footer.append(nav);
    }
  }

  window.inicializarGerenciamentoUsuarios = () => {
    const refreshButton = document.getElementById("atualizar-usuarios");
    if (refreshButton && refreshButton.dataset.initialized !== "true") {
      refreshButton.addEventListener("click", loadUsers);
      refreshButton.dataset.initialized = "true";
    }
    for (const id of ["busca-usuarios", "filtro-perfil-usuarios", "filtro-status-usuarios"]) {
      const input = document.getElementById(id);
      if (input && !input.dataset.initialized) { input.addEventListener(id === "busca-usuarios" ? "input" : "change", () => { currentPage = 1; renderUsers(); }); input.dataset.initialized = "true"; }
    }
    loadUsers();
  };
})();
