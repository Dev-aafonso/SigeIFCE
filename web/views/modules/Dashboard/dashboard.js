import {
  getAllowedModules,
  getRoleLabel,
  MODULE_LABELS,
} from "../../../shared/core/access-control.mjs";

const storedUser = (() => {
  try {
    const user = JSON.parse(localStorage.getItem("sige_user") || "{}");
    return user && typeof user === "object" ? user : {};
  } catch (error) {
    console.error("Não foi possível ler o perfil salvo.", error);
    return {};
  }
})();

const role = typeof storedUser.role === "string" ? storedUser.role : "";
const name =
  storedUser.name || storedUser.nome || storedUser.email || "usuário";

window.inicializarPainelPerfil = () => {
  const description = document.getElementById("descricao-painel-perfil");
  const title = document.getElementById("titulo-painel-perfil");
  const shortcuts = document.getElementById("atalhos-painel-perfil");
  if (!shortcuts) return;

  if (title) title.textContent = `Olá, ${name}`;
  if (description)
    description.textContent = `Perfil atual: ${getRoleLabel(role)}. Acesse as áreas disponíveis para sua função.`;
  initializeAdministrativeMetrics(role);
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

    const label = document.createElement("strong");
    label.textContent = MODULE_LABELS[module];
    const hint = document.createElement("span");
    hint.textContent = "Abrir módulo";
    button.append(label, hint);
    button.addEventListener("click", () => {
      history.pushState({ module }, "", `/#/${module}`);
      window.navegarParaModulo?.(module);
    });
    shortcuts.append(button);
  });
};

function initializeAdministrativeMetrics(currentRole) {
  const panel = document.getElementById("painel-metricas-administrativas");
  if (!panel) return;
  if (!["ADMIN", "ORGANIZADOR"].includes(currentRole.trim().toUpperCase())) {
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
    const width = Math.max(340, actions.length * 94 + 44);
    const height = 164;
    const chartHeight = 112;
    const top = 10;
    const max = Math.max(
      1,
      ...actions.map(
        (action) =>
          toNumber(...maximumKeys.map((key) => action[key])) ??
          toNumber(...valueKeys.map((key) => action[key])) ??
          0,
      ),
    );
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("aria-hidden", "true");
    for (let tick = 0; tick <= 2; tick += 1) {
      const y = top + (chartHeight * tick) / 2;
      const line = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line",
      );
      line.setAttribute("x1", "32");
      line.setAttribute("x2", String(width - 8));
      line.setAttribute("y1", String(y));
      line.setAttribute("y2", String(y));
      line.setAttribute("class", "grade-grafico-dashboard");
      svg.append(line);
    }
    actions.forEach((action, index) => {
      const value = toNumber(...valueKeys.map((key) => action[key])) ?? 0;
      const limit = toNumber(...maximumKeys.map((key) => action[key]));
      const center = 44 + index * ((width - 48) / actions.length);
      const barWidth = Math.min(28, (width / actions.length) * 0.42);
      const addBar = (barValue, x, className) => {
        const bar = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "rect",
        );
        bar.setAttribute("x", String(x));
        bar.setAttribute(
          "y",
          String(top + chartHeight - (barValue / max) * chartHeight),
        );
        bar.setAttribute("width", String(barWidth));
        bar.setAttribute("height", String((barValue / max) * chartHeight));
        bar.setAttribute("rx", "3");
        bar.setAttribute("class", className);
        const titleNode = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "title",
        );
        titleNode.textContent = `${action.title || action.name || action.nome || "Ação"}: ${format(barValue)}`;
        bar.append(titleNode);
        svg.append(bar);
      };
      if (limit !== null) {
        addBar(limit, center - barWidth - 1, "barra-dashboard-secundaria");
        addBar(value, center + 1, "barra-dashboard-primaria");
      } else {
        addBar(value, center - barWidth / 2, "barra-dashboard-primaria");
      }
      const label = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text",
      );
      label.setAttribute("x", String(center));
      label.setAttribute("y", String(top + chartHeight + 18));
      label.setAttribute("text-anchor", "middle");
      const titleNode = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "title",
      );
      titleNode.textContent =
        action.title || action.name || action.nome || "Ação";
      label.textContent =
        titleNode.textContent.length > 12
          ? `${titleNode.textContent.slice(0, 11)}â€¦`
          : titleNode.textContent;
      label.append(titleNode);
      svg.append(label);
    });
    target.append(svg);
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
      const response = await readJson(
        `/relatorios/metricas/evento/${encodeURIComponent(eventId)}`,
      );
      if (currentSequence !== sequence) return;
      const envelope = unwrap(response) || {};
      const data =
        envelope.metrics ||
        envelope.metricas ||
        envelope.statistics ||
        envelope.estatisticas ||
        envelope;
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
      const response = await readJson("/events?limit=100&page=1");
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
