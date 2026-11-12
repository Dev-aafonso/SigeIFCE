import {
  getAllowedModules,
  getRoleLabel,
  MODULE_LABELS,
} from "../../../shared/core/access-control.mjs";

function obterUsuarioAtual() {
  try {
    const user = JSON.parse(localStorage.getItem("sige_user") || "{}");
    return user && typeof user === "object" ? user : {};
  } catch {
    return {};
  }
}

window.inicializarPainelPerfil = () => {
  // O módulo é importado uma única vez; o usuário deve ser lido a cada navegação.
  const usuario = obterUsuarioAtual();
  const role = typeof usuario.role === "string" ? usuario.role : "";
  const name = usuario.name || usuario.nome || usuario.email || "usuário";
  const description = document.getElementById("descricao-painel-perfil");
  const title = document.getElementById("titulo-painel-perfil");
  const shortcuts = document.getElementById("atalhos-painel-perfil");
  if (!shortcuts) return;

  if (title) title.textContent = `Olá, ${name}`;
  if (description)
    description.textContent = `Perfil atual: ${getRoleLabel(role)}. Acesse as áreas disponíveis para sua função.`;
  initializeAdministrativeMetrics(role);
  initializeOverview(role);
  shortcuts.replaceChildren();

  const modules = getAllowedModules(role).filter(
    (module) => module !== "dashboard",
  );
  if (!modules.length) {
    const message = document.createElement("p");
    message.textContent = "Não há módulos disponíveis para este perfil.";
    shortcuts.append(message);
    return;
  }

  modules.forEach((module) => {
    const button = document.createElement("button");
    button.className = "atalho-perfil";
    button.type = "button";

    // Reutiliza os ícones da navegação para manter a identidade de cada módulo.
    const iconContainer = document.createElement("span");
    iconContainer.className = "icone-atalho-perfil";
    iconContainer.setAttribute("aria-hidden", "true");
    const menuButton = Array.from(document.querySelectorAll(".botao-menu[data-module]"))
      .find((item) => item.dataset.module === module);
    const icon = menuButton?.querySelector("svg")?.cloneNode(true);
    if (icon) iconContainer.append(icon);
    const text = document.createElement("span");
    text.className = "texto-atalho-perfil";
    const label = document.createElement("strong");
    label.textContent = MODULE_LABELS[module];
    const hint = document.createElement("span");
    hint.textContent = "Abrir módulo";
    text.append(label, hint);
    button.append(iconContainer, text);
    button.addEventListener("click", () => {
      window.navegarParaModulo?.(module);
    });
    shortcuts.append(button);
  });
};

function initializeAdministrativeMetrics(currentRole) {
  const panel = document.getElementById("painel-metricas-administrativas");
  if (!panel) return;
  if (!["ADMIN", "ORGANIZADOR", "PROFESSOR"].includes(currentRole.trim().toUpperCase())) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;

  const select = document.getElementById("evento-dashboard-administrativo");
  const state = document.getElementById("estado-dashboard-administrativo");
  let sequence = 0;

  const setState = (message, type = "") => {
    state.textContent = message;
    state.dataset.tipo = type;
  };
  const toNumber = (...values) => {
    const value = values.find(
      (item) => item !== undefined && item !== null && item !== "",
    );
    if (value === undefined) return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  };
  const format = (value) =>
    value === null
      ? "â€”"
      : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(
          value,
        );
  const unwrap = (value) =>
    value?.data && !Array.isArray(value.data) ? value.data : value;
  const readJson = async (path) => {

    let response;
    try {
      response = await fetch(path, { credentials: "same-origin",
        headers: {
          Accept: "application/json",

        },
      });
    } catch {
      throw new Error("Não foi possível conectar à API de métricas.");
    }
    if (!response.ok) {
      const error = new Error(
        `A solicitação falhou (HTTP ${response.status}).`,
      );
      error.status = response.status;
      throw error;
    }
    try {
      return await response.json();
    } catch {
      throw new Error("A API retornou uma resposta JSON inválida.");
    }
  };
  const updateIndicators = (data) => {
    const registrations = toNumber(
      data.registrations,
      data.registered,
      data.enrolled,
      data.inscritos,
      data.totalInscritos,
      data.registrationCount,
      data.registeredCount,
      data.totalParticipants,
    );
    const present = toNumber(
      data.present,
      data.presentes,
      data.attended,
      data.totalPresentes,
      data.presentCount,
      data.attendedCount,
    );
    const absent = toNumber(
      data.absent,
      data.ausentes,
      data.missed,
      data.totalAusentes,
      data.absentCount,
      data.absenceCount,
    );
    const capacity = toNumber(
      data.capacity,
      data.vagas,
      data.totalVagas,
      data.totalCapacity,
      data.capacityTotal,
    );
    const actions =
      data.actions ||
      data.acoes ||
      data.actionMetrics ||
      data.metricasAcoes ||
      data.statisticsByAction ||
      [];
    const numberFromActions = (keys) => {
      let found = false;
      const sum = actions.reduce((total, action) => {
        const value = toNumber(...keys.map((key) => action[key]));
        if (value === null) return total;
        found = true;
        return total + value;
      }, 0);
      return found ? sum : null;
    };
    const totalRegistrations =
      registrations ??
      numberFromActions([
        "registrations",
        "registered",
        "inscritos",
        "totalInscritos",
        "registrationCount",
        "registeredCount",
        "totalParticipants",
      ]);
    const totalPresent =
      present ??
      numberFromActions([
        "present",
        "presentes",
        "attended",
        "totalPresentes",
        "presentCount",
        "attendedCount",
      ]);
    const totalAbsent =
      absent ??
      (registrations !== null || present !== null
        ? Math.max(0, totalRegistrations - totalPresent)
        : numberFromActions([
            "absent",
            "ausentes",
            "missed",
            "totalAusentes",
            "absentCount",
            "absenceCount",
          ]));
    const totalCapacity =
      capacity ??
      numberFromActions([
        "capacity",
        "vagas",
        "totalVagas",
        "maxParticipants",
        "capacityTotal",
      ]);
    const occupancy =
      toNumber(
        data.occupancyRate,
        data.occupancyPercentage,
        data.taxaOcupacao,
        data.percentualOcupacao,
      ) ??
      (totalCapacity > 0 ? (totalRegistrations / totalCapacity) * 100 : null);
    const attendance =
      toNumber(
        data.attendanceRate,
        data.attendancePercentage,
        data.taxaFrequencia,
        data.percentualFrequencia,
      ) ??
      (totalRegistrations > 0
        ? (totalPresent / totalRegistrations) * 100
        : null);
    document.getElementById("dashboard-total-inscritos").textContent =
      format(totalRegistrations);
    document.getElementById("dashboard-total-presentes").textContent =
      format(totalPresent);
    document.getElementById("dashboard-total-ausentes").textContent =
      format(totalAbsent);
    document.getElementById("dashboard-ocupacao").textContent =
      occupancy === null ? "â€”" : `${format(occupancy)}%`;
    document.getElementById("dashboard-frequencia").textContent =
      attendance === null ? "â€”" : `${format(attendance)}%`;
    return actions;
  };
  const renderActionChart = (targetId, actions, valueKeys, maximumKeys) => {
    const target = document.getElementById(targetId);
    target.replaceChildren();
    if (!actions.length) {
      const empty = document.createElement("p");
      empty.className = "estado-dashboard-administrativo";
      empty.textContent = "Sem dados por ação para este evento.";
      target.append(empty);
      return;
    }
    const isAttendance = targetId === "dashboard-grafico-frequencia";
    const primaryLabel = isAttendance ? "Presentes" : "Inscritos";
    const comparisonLabel = isAttendance ? "Inscritos" : "Capacidade";
    const values = actions.map((action) => ({
      name: action.title || action.name || action.nome || "Ação",
      value: Math.max(0, toNumber(...valueKeys.map((key) => action[key])) ?? 0),
      limit: toNumber(...maximumKeys.map((key) => action[key])),
    }));
    const max = Math.max(1, ...values.flatMap(({ value, limit }) => [value, Math.max(0, limit ?? 0)]));
    const legend = document.createElement("div");
    legend.className = "legenda-acoes-dashboard";
    for (const [label, className] of [[comparisonLabel, "comparacao"], [primaryLabel, "principal"]]) {
      const item = document.createElement("span");
      const swatch = document.createElement("i");
      swatch.className = className;
      swatch.setAttribute("aria-hidden", "true");
      item.append(swatch, document.createTextNode(label));
      legend.append(item);
    }
    target.append(legend);
    const scroll = document.createElement("div");
    scroll.className = "grafico-acoes-rolagem";
    const chart = document.createElement("div");
    chart.className = "grafico-acoes-colunas";
    chart.setAttribute("role", "list");
    values.forEach(({ name, value, limit }) => {
      const column = document.createElement("div");
      column.className = "grafico-acao-coluna";
      column.setAttribute("role", "listitem");
      const bars = document.createElement("div");
      bars.className = "grafico-acao-barras";
      bars.setAttribute("aria-hidden", "true");
      const addBar = (amount, className) => {
        const bar = document.createElement("span");
        bar.className = `grafico-acao-barra ${className}`;
        bar.style.height = `${(Math.max(0, amount) / max) * 100}%`;
        bars.append(bar);
      };
      if (limit !== null) addBar(limit, "comparacao");
      addBar(value, "principal");
      const label = document.createElement("span");
      label.className = "grafico-acao-nome";
      label.textContent = name;
      const detail = document.createElement("span");
      detail.className = "grafico-acao-valores";
      detail.textContent = `${primaryLabel}: ${format(value)}${limit !== null ? ` · ${comparisonLabel}: ${format(limit)}` : ""}`;
      column.append(bars, label, detail);
      chart.append(column);
    });
    scroll.append(chart);
    target.append(scroll);
  };
  const loadMetrics = async () => {
    const eventId = select.value;
    const currentSequence = ++sequence;
    [
      "dashboard-total-inscritos",
      "dashboard-total-presentes",
      "dashboard-total-ausentes",
      "dashboard-ocupacao",
      "dashboard-frequencia",
    ].forEach((id) => {
      document.getElementById(id).textContent = "â€”";
    });
    document.getElementById("dashboard-graficos-acoes").hidden = true;
    if (!eventId) {
      setState("Selecione um evento para carregar os indicadores.");
      return;
    }
    setState("Carregando indicadores...");
    try {
      const [overview, actionRows] = await Promise.all([
        readJson(`/dashboard/overview?eventId=${encodeURIComponent(eventId)}`),
        readJson(`/dashboard/actions?eventId=${encodeURIComponent(eventId)}`),
      ]);
      if (currentSequence !== sequence) return;
      const totals = overview.totals || {};
      const entries = Array.isArray(actionRows) ? actionRows : [];
      const actionsForCharts = entries.map((action) => ({
        ...action,
        registrations: action.activeRegistrations ?? 0,
        present: action.presentRegistrations ?? 0,
      }));
      const data = {
        registrations: totals.activeRegistrations ?? 0,
        present: totals.presentRegistrations ?? 0,
        absent: totals.absentRegistrations ?? 0,
        attendanceRate: totals.attendanceRate ?? 0,
        capacity: entries.reduce((sum, action) => sum + Number(action.capacity || 0), 0),
        actions: actionsForCharts,
      };
      const certificatesInfo = document.getElementById('dashboard-resumo-certificados');
      if (certificatesInfo) {
        certificatesInfo.textContent = `Certificados válidos: ${totals.certificatesValid ?? 0} · Eventos: ${totals.certificatesConsolidated ?? 0} · Ações legadas: ${totals.certificatesLegacy ?? 0}`;
      }
      const actions = updateIndicators(data);
      const hasSummary =
        [
          "registrations",
          "registered",
          "enrolled",
          "inscritos",
          "totalInscritos",
          "registrationCount",
          "registeredCount",
          "totalParticipants",
          "present",
          "presentes",
          "attended",
          "totalPresentes",
          "presentCount",
          "attendedCount",
          "absent",
          "ausentes",
          "missed",
          "totalAusentes",
          "absentCount",
          "absenceCount",
          "capacity",
          "vagas",
          "totalVagas",
          "totalCapacity",
          "capacityTotal",
        ].some((field) => data[field] !== undefined) || actions.length > 0;
      setState(
        hasSummary
          ? "Indicadores atualizados conforme as informações disponíveis para seu escopo."
          : "A API não retornou indicadores para este evento.",
      );
      document.getElementById("dashboard-graficos-acoes").hidden =
        !actions.length;
      renderActionChart(
        "dashboard-grafico-inscritos",
        actions,
        ["registrations", "registered", "inscritos", "totalInscritos"],
        ["capacity", "vagas", "totalVagas"],
      );
      renderActionChart(
        "dashboard-grafico-frequencia",
        actions,
        ["present", "presentes", "attended", "totalPresentes"],
        ["registrations", "registered", "inscritos", "totalInscritos"],
      );
    } catch (error) {
      if (currentSequence !== sequence) return;
      setState(
        error.status === 401
          ? "Sua sessão expirou. Entre novamente para visualizar os indicadores."
          : error.status === 403
            ? "Seu perfil não tem permissão para consultar as métricas deste evento."
            : error.status === 404
              ? "Não há métricas disponíveis para este evento ou a API ainda não está implementada."
              : error.message,
        "erro",
      );
    }
  };

  const loadEvents = async () => {
    select.disabled = true;
    try {
      const response = await readJson("/dashboard/filters");
      const envelope = unwrap(response);
      const events = Array.isArray(response)
        ? response
        : Array.isArray(response?.data)
          ? response.data
          : Array.isArray(envelope)
            ? envelope
            : envelope?.items || envelope?.events || envelope?.eventos || [];
      select.replaceChildren(
        new Option(
          events.length ? "Selecione um evento" : "Nenhum evento disponível",
          "",
        ),
      );
      events.forEach((event) =>
        select.add(
          new Option(
            event.title || event.name || event.nome || "Evento sem título",
            String(event.id || ""),
          ),
        ),
      );
      if (!events.length) setState("Nenhum evento disponível para consulta.");
    } catch (error) {
      select.replaceChildren(new Option("Eventos indisponíveis", ""));
      setState(
        error.status === 401
          ? "Sua sessão expirou. Entre novamente para acessar os indicadores."
          : error.status === 403
            ? "Seu perfil não tem permissão para consultar eventos."
            : "Não foi possível carregar a lista de eventos. Tente atualizar.",
        "erro",
      );
    } finally {
      select.disabled = false;
    }
  };

  select.addEventListener("change", loadMetrics);
  document
    .getElementById("atualizar-dashboard-administrativo")
    .addEventListener("click", () =>
      select.value ? loadMetrics() : loadEvents(),
    );
  loadEvents();
}


function initializeOverview(role) {
  const panel = document.getElementById("dashboard-visao-geral");
  if (!panel) return;
  panel.hidden = !["ADMIN", "ORGANIZADOR", "PROFESSOR"].includes(role.trim().toUpperCase());
  if (panel.hidden) return;
  const state = document.getElementById("dashboard-visao-estado");
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const empty = (target, message) => target.replaceChildren(el("p", message, "dashboard-vazio"));
  document.getElementById("dashboard-ver-eventos").onclick = () => window.navegarParaModulo?.("events");
  state.textContent = "Carregando visão geral...";
  fetch("/dashboard/summary", { credentials: "same-origin", headers: { Accept: "application/json" } })
    .then(response => { if (!response.ok) throw new Error(); return response.json(); })
    .then(data => {
      state.textContent = "";
      const upcoming = document.getElementById("dashboard-proximos");
      upcoming.replaceChildren();
      if (!data.upcoming.length) empty(upcoming, "Nenhum evento próximo disponível.");
      data.upcoming.forEach(event => {
        const date = new Date(event.startDate);
        const row = el("div", null, "dashboard-linha");
        const badge = el("span", null, "dashboard-data");
        badge.append(el("strong", new Intl.DateTimeFormat("pt-BR", { day: "2-digit" }).format(date)), el("small", new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", "").toUpperCase()));
        const info = el("div", null, "dashboard-linha-info");
        info.append(el("strong", event.title), el("small", `${event.location || "Local não informado"} · ${new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date)}`));
        row.append(badge, info, el("span", event.status === "EM_ANDAMENTO" ? "Em andamento" : "Publicado", "dashboard-situacao"));
        upcoming.append(row);
      });
      const activity = document.getElementById("dashboard-atividade");
      activity.replaceChildren();
      if (!data.activity.length) empty(activity, "Nenhuma atividade recente disponível.");
      data.activity.forEach(item => {
        const row = el("div", null, "dashboard-linha");
        const initials = item.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
        const info = el("div", null, "dashboard-linha-info");
        const text = el("p"); text.append(el("strong", item.name), document.createTextNode(` ${item.kind} `), el("strong", item.event, "dashboard-destaque"));
        info.append(text, el("small", new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(item.date))));
        row.append(el("span", initials, "dashboard-avatar"), info); activity.append(row);
      });
      drawOverviewChart("dashboard-eventos-grafico", data.events.slice(0, 5), false);
      drawOverviewChart("dashboard-tendencia", data.trend, true);
    }).catch(() => { state.textContent = "Não foi possível carregar a visão geral. Atualize a página para tentar novamente."; });
}

function drawOverviewChart(id, rows, lineChart) {
  const target = document.getElementById(id); target.replaceChildren();
  if (!rows.length) { const p = document.createElement("p"); p.className = "dashboard-vazio"; p.textContent = "Sem dados disponíveis."; target.append(p); return; }
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg"); svg.setAttribute("viewBox", "0 0 600 220"); svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", lineChart ? "Participantes únicos por mês: inscrições e presenças" : "Inscrições e capacidade por evento");
  const node = (tag, attrs, text) => { const n = document.createElementNS(ns, tag); Object.entries(attrs).forEach(([key, value]) => n.setAttribute(key, String(value))); if (text != null) n.textContent = text; svg.append(n); return n; };
  const first = row => lineChart ? row.registrations : row.capacity;
  const second = row => lineChart ? row.presences : row.registrations;
  const max = Math.max(1, ...rows.flatMap(row => [first(row), second(row)]));
  for (let i = 0; i <= 4; i++) { const y = 20 + i * 38; node("line", { x1: 42, x2: 585, y1: y, y2: y, class: "dashboard-gridline" }); node("text", { x: 35, y: y + 4, "text-anchor": "end" }, Math.round(max * (4-i)/4)); }
  const x = index => 60 + (index + .5) * 510 / rows.length;
  const y = value => 172 - value / max * 152;
  if (lineChart) {
    for (const [get, cls] of [[first, "dashboard-line-secondary"], [second, "dashboard-line-primary"]]) {
      node("polyline", { points: rows.map((row, i) => `${x(i)},${y(get(row))}`).join(" "), class: cls });
      rows.forEach((row, i) => { const dot = node("circle", { cx: x(i), cy: y(get(row)), r: 4, class: cls }); const title = document.createElementNS(ns, "title"); title.textContent = `${row.label}: ${get(row)}`; dot.append(title); });
    }
  } else rows.forEach((row, i) => {
    [[first(row), "dashboard-bar-secondary", -22], [second(row), "dashboard-bar-primary", 1]].forEach(([value, cls, offset]) => { const bar = node("rect", { x: x(i) + offset, y: y(value), width: 21, height: 172 - y(value), rx: 3, class: cls }); const title = document.createElementNS(ns, "title"); title.textContent = `${row.title}: ${value}`; bar.append(title); });
  });
  rows.forEach((row, i) => { const label = lineChart ? row.label : row.title; node("text", { x: x(i), y: 194, "text-anchor": "middle" }, label.length > 13 ? `${label.slice(0, 12)}…` : label); });
  target.append(svg);
  const legend = document.createElement("p"); legend.className = "dashboard-legenda"; legend.textContent = lineChart ? "Cinza: inscritos · Verde: presentes" : "Cinza: capacidade · Verde: inscrições"; target.append(legend);
}
