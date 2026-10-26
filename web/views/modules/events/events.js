import {
  buildActionPayload,
  buildEventPayload,
} from "../../../shared/core/event-validation.mjs";

(() => {
  const PAGE_SIZE = 20;
  const EVENTS_API = "/events";
  const ACTIONS_API = "/actions";
  const EVENT_STATUSES = {
    RASCUNHO: "Rascunho",
    PUBLICADO: "Publicado",
    ENCERRADO: "Encerrado",
    CANCELADO: "Cancelado",
  };
  const ACTION_STATUSES = {
    ATIVA: "Ativa",
    ENCERRADA: "Encerrada",
    CANCELADA: "Cancelada",
  };
  const EVENT_TYPE_LABELS = {
    CONGRESSO: "Congresso",
    SIMPOSIO: "Simpósio",
    WORKSHOP: "Workshop",
    MINICURSO: "Minicurso",
    HACKATHON: "Hackathon",
    FEIRA: "Feira",
  };
  const MAX_COVER_IMAGE_SIZE = 5 * 1024 * 1024;
  const ALLOWED_COVER_IMAGE_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

  let currentPage = 1;
  let currentManagerEvent = null;
  let searchSequence = 0;
  let searchDebounceTimer = null;
  let currentPublicEvents = [];
  let currentPublicMeta = null;
  let currentRole = "";
  let createWizardStep = 0;
  let draftActionSequence = 0;
  let lastEventDetailsTrigger = null;
  const registeredActionIds = new Set();
  const coverPreviewUrls = new WeakMap();

  const byId = (id) => document.getElementById(id);

  function showMessage(text, type = "") {
    const message = byId("mensagem-eventos");
    if (!message) return;
    message.textContent = text;
    message.dataset.tipo = type;
  }

  function currentUser() {
    try {
      const user = JSON.parse(localStorage.getItem("sige_user") || "{}");
      return user && typeof user === "object" ? user : {};
    } catch (error) {
      console.error("Não foi possível ler o perfil local.", error);
      return {};
    }
  }

  function canManage() {
    return ["ADMIN", "ORGANIZADOR"].includes(currentRole);
  }

  function managerStorageKey() {
    const user = currentUser();
    const identity = user.id || user.email || "unknown";
    return `sige_managed_events_${identity}`;
  }

  function getSavedEvents() {
    try {
      const saved = JSON.parse(
        localStorage.getItem(managerStorageKey()) || "[]",
      );
      return Array.isArray(saved)
        ? saved.filter(
            (event) =>
              event &&
              typeof event.id === "string" &&
              typeof event.title === "string",
          )
        : [];
    } catch (error) {
      console.error(
        "Não foi possível ler os eventos salvos neste navegador.",
        error,
      );
      return [];
    }
  }

  function saveManagedEvent(event) {
    if (!event?.id) return;
    const saved = getSavedEvents().filter((item) => item.id !== event.id);
    saved.unshift({ id: event.id, title: event.title || event.id });
    try {
      localStorage.setItem(
        managerStorageKey(),
        JSON.stringify(saved.slice(0, 30)),
      );
    } catch (error) {
      console.error("Não foi possível salvar o evento neste navegador.", error);
    }
    renderSavedEvents();
  }

  function renderSavedEvents() {
    const select = byId("eventos-recentes");
    if (!select) return;
    const selected = select.value;
    select.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Selecione um evento salvo";
    select.append(placeholder);

    getSavedEvents().forEach((event) => {
      const option = document.createElement("option");
      option.value = event.id;
      option.textContent = event.title;
      select.append(option);
    });
    if (getSavedEvents().some((event) => event.id === selected))
      select.value = selected;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function formatDate(value) {
    if (!value) return "Não informado";
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? "Data inválida"
      : new Intl.DateTimeFormat("pt-BR", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(date);
  }

  function formatCardDate(value) {
    if (!value) return "Data não informada";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Data inválida";
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
      .format(date)
      .replace(".", "")
      .replace(",", " ·");
  }

  function eventCategory(event) {
    const actions = Array.isArray(event.actions) ? event.actions : [];
    const actionWithType = actions.find(
      (action) => action.category || action.type,
    );
    const value =
      event.category?.name ||
      event.category ||
      event.type ||
      actionWithType?.category?.name ||
      actionWithType?.category ||
      actionWithType?.type;
    if (typeof value !== "string" || !value.trim()) return "Evento";
    const normalized = value.trim();
    return EVENT_TYPE_LABELS[normalized.toUpperCase()] || normalized;
  }

  function registrationStatus(event) {
    const actions = Array.isArray(event.actions) ? event.actions : [];
    const activeActions = actions.filter((action) => action.status === "ATIVA");
    if (event.status !== "PUBLICADO" || activeActions.length === 0) {
      return {
        key: "UNAVAILABLE",
        label: "Indisponível",
        activeActions,
        capacity: 0,
        remaining: null,
      };
    }

    const availability = activeActions.map(actionAvailability);
    const capacity = availability.reduce(
      (sum, item) => sum + (item.capacity ?? 0),
      0,
    );
    const countsKnown = availability.every(
      (item) => item.capacity !== null && item.remaining !== null,
    );
    const remaining = countsKnown
      ? availability.reduce((sum, item) => sum + item.remaining, 0)
      : null;

    if (countsKnown && remaining === 0) {
      return {
        key: "FULL",
        label: "Lotado",
        activeActions,
        capacity,
        remaining,
      };
    }
    return {
      key: "OPEN",
      label: "Inscrições abertas",
      activeActions,
      capacity,
      remaining,
    };
  }

  function updateCategoryFilter(events) {
    const select = byId("filtro-categoria-eventos");
    if (!select) return;
    const selected = select.value;
    const categories = [...new Set(events.map(eventCategory))].sort(
      (first, second) => first.localeCompare(second, "pt-BR"),
    );
    select.replaceChildren(new Option("Categoria: Todas", ""));
    categories.forEach((category) =>
      select.add(new Option(category, category)),
    );
    if (categories.includes(selected)) select.value = selected;
  }

  function toLocalDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  }

  async function api(path, options = {}) {
    const token = localStorage.getItem("sige_access_token");
    const headers = {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...options.headers,
    };

    let response;
    try {
      response = await fetch(path, { ...options, headers });
    } catch {
      throw new Error(
        "Não foi possível conectar à API. Verifique a conexão e tente novamente.",
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
      const errorMessage =
        data.message ||
        data.error ||
        `A solicitação falhou (HTTP ${response.status}).`;
      const error = new Error(
        Array.isArray(errorMessage) ? errorMessage.join(" ") : errorMessage,
      );
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function makeButton(label, className, action, value = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `botao-evento ${className}`;
    button.dataset.eventAction = action;
    button.dataset.testid = `event-action-${action}`;
    if (value) button.dataset.value = value;
    button.textContent = label;
    return button;
  }

  function actionAvailability(action) {
    const capacity = Number(action.capacity);
    const hasCapacity =
      action.capacity !== null &&
      action.capacity !== undefined &&
      action.capacity !== "" &&
      Number.isFinite(capacity) &&
      capacity >= 0;
    if (hasCapacity && capacity === 0) return { capacity, remaining: 0 };
    const directAvailability = [
      action.availableSeats,
      action.availableSlots,
      action.remainingCapacity,
      action.spotsAvailable,
      action.remaining,
    ].find(
      (value) =>
        value !== null &&
        value !== undefined &&
        value !== "" &&
        Number.isFinite(Number(value)),
    );
    if (directAvailability !== undefined) {
      return {
        capacity: hasCapacity ? capacity : null,
        remaining: Math.max(0, Number(directAvailability)),
      };
    }

    const registeredCount = [
      action.registrationCount,
      action.registeredCount,
      action.enrolledCount,
      action.participantCount,
      action._count?.registrations,
    ].find(
      (value) =>
        value !== null &&
        value !== undefined &&
        value !== "" &&
        Number.isFinite(Number(value)),
    );
    if (hasCapacity && registeredCount !== undefined) {
      return {
        capacity,
        remaining: Math.max(0, capacity - Number(registeredCount)),
      };
    }
    if (hasCapacity && Array.isArray(action.registrations)) {
      const activeRegistrations = action.registrations.filter((registration) =>
        ["ACTIVE", "ATIVA", "CONFIRMED", "CONFIRMADA"].includes(
          String(registration.status || "").toUpperCase(),
        ),
      ).length;
      return {
        capacity,
        remaining: Math.max(0, capacity - activeRegistrations),
      };
    }
    return { capacity: hasCapacity ? capacity : null, remaining: null };
  }

  function actionDetailsText(action) {
    const availability = actionAvailability(action);
    const capacityDescription =
      availability.remaining === null
        ? `capacidade: ${action.capacity ?? "—"}`
        : `${availability.remaining} ${availability.remaining === 1 ? "vaga disponível" : "vagas disponíveis"}${availability.capacity === null ? "" : ` de ${availability.capacity}`}`;
    return `${formatDate(action.startDate)} – ${formatDate(action.endDate)} · ${action.durationMinutes ?? "?"} min · ${capacityDescription}${action.location ? ` · ${action.location}` : ""}`;
  }

  function renderActionSummary(
    action,
    editable = false,
    allowRegistration = false,
  ) {
    const card = document.createElement("article");
    card.className = "item-acao-evento";
    const heading = document.createElement("div");
    heading.className = "cabecalho-cartao-evento";
    const title = document.createElement("strong");
    title.textContent = action.title || "Ação sem título";
    const status = document.createElement("span");
    status.className = "status-acao";
    status.textContent =
      ACTION_STATUSES[action.status] || action.status || "Status desconhecido";
    heading.append(title, status);

    const details = document.createElement("p");
    details.className = "detalhes-acao-evento";
    details.textContent = actionDetailsText(action);
    const description = document.createElement("p");
    description.className = "cartao-evento-descricao";
    description.textContent = action.description || "";
    card.append(heading, details, description);

    if (editable && action.status === "ATIVA") {
      const controls = document.createElement("div");
      controls.className = "acoes-acao-evento";
      controls.append(
        makeButton(
          "Editar ação",
          "botao-evento-secundario",
          "edit-action",
          action.id,
        ),
        makeButton(
          "Encerrar",
          "botao-evento-secundario",
          "close-action",
          action.id,
        ),
        makeButton(
          "Cancelar ação",
          "botao-evento-perigo",
          "cancel-action",
          action.id,
        ),
      );
      card.append(controls);
    } else if (allowRegistration && action.status === "ATIVA") {
      const controls = document.createElement("div");
      controls.className = "acoes-acao-evento";
      const actionId = String(action.id);
      const availability = actionAvailability(action);
      if (registeredActionIds.has(actionId)) {
        const registered = makeButton(
          "Inscrito",
          "botao-evento-primario",
          "register-action",
          actionId,
        );
        registered.disabled = true;
        controls.append(registered);
      } else if (availability.remaining === 0 || availability.capacity === 0) {
        const full = makeButton(
          "Ação esgotada",
          "botao-evento-secundario",
          "register-action",
          actionId,
        );
        full.disabled = true;
        full.title = "Não há vagas disponíveis nesta ação.";
        controls.append(full);
      } else {
        controls.append(
          makeButton(
            "Inscrever-se nesta ação",
            "botao-evento-primario",
            "register-action",
            actionId,
          ),
        );
      }
      card.append(controls);
    }
    return card;
  }

  function decrementKnownActionAvailability(actionId) {
    const directKeys = [
      "availableSeats",
      "availableSlots",
      "remainingCapacity",
      "spotsAvailable",
      "remaining",
    ];
    const countKeys = [
      "registrationCount",
      "registeredCount",
      "enrolledCount",
      "participantCount",
    ];
    for (const event of currentPublicEvents) {
      if (!Array.isArray(event.actions)) continue;
      const action = event.actions.find(
        (item) => String(item.id) === String(actionId),
      );
      if (!action) continue;
      const directKey = directKeys.find(
        (key) =>
          action[key] !== null &&
          action[key] !== undefined &&
          action[key] !== "" &&
          Number.isFinite(Number(action[key])),
      );
      if (directKey) {
        action[directKey] = Math.max(0, Number(action[directKey]) - 1);
      } else {
        const countKey = countKeys.find(
          (key) =>
            action[key] !== null &&
            action[key] !== undefined &&
            action[key] !== "" &&
            Number.isFinite(Number(action[key])),
        );
        if (countKey) action[countKey] = Number(action[countKey]) + 1;
      }
      const dialogAction = [
        ...byId("dialog-detalhes-evento").querySelectorAll(
          '[data-event-action="register-action"]',
        ),
      ].find((button) => button.dataset.value === String(actionId));
      const details = dialogAction
        ?.closest(".item-acao-evento")
        ?.querySelector(".detalhes-acao-evento");
      if (details) details.textContent = actionDetailsText(action);
    }
  }

  function addDraftAction(form) {
    const container = byId("acoes-rascunho-evento");
    if (!container) return;
    const index = ++draftActionSequence;
    const card = document.createElement("article");
    card.className = "formulario-acao-rascunho";
    card.dataset.draftAction = String(index);
    card.innerHTML = `
            <div class="cabecalho-acao-rascunho">
                <h5>Ação ${container.children.length + 1}</h5>
                <button class="botao-evento botao-evento-perigo botao-remover-acao-rascunho" type="button" data-event-action="remove-draft-action">Remover</button>
            </div>
            <label class="campo-evento"><span>Título da ação *</span><input data-draft-field="title" data-testid="draft-action-title" required minlength="3" maxlength="200"></label>
            <label class="campo-evento"><span>Descrição *</span><textarea data-draft-field="description" data-testid="draft-action-description" required minlength="3" maxlength="5000" rows="2"></textarea></label>
            <div class="campos-data-evento">
                <label class="campo-evento"><span>Início *</span><input data-draft-field="startDate" data-testid="draft-action-start-date" type="datetime-local" required></label>
                <label class="campo-evento"><span>Término *</span><input data-draft-field="endDate" data-testid="draft-action-end-date" type="datetime-local" required></label>
            </div>
            <div class="campos-data-evento">
                <label class="campo-evento"><span>Capacidade *</span><input data-draft-field="capacity" data-testid="draft-action-capacity" type="number" min="1" step="1" required value="1"></label>
                <label class="campo-evento"><span>Local</span><input data-draft-field="location" maxlength="255"></label>
            </div>`;

    const start = form.elements.namedItem("startDate")?.value;
    const end = form.elements.namedItem("endDate")?.value;
    card.querySelector('[data-draft-field="startDate"]').value = start || "";
    card.querySelector('[data-draft-field="endDate"]').value = end || "";
    container.append(card);
    updateDraftActionLabels();
  }

  function updateDraftActionLabels() {
    byId("acoes-rascunho-evento")
      ?.querySelectorAll(".formulario-acao-rascunho h5")
      .forEach((heading, index) => {
        heading.textContent = `Ação ${index + 1}`;
      });
  }

  function readDraftActions(eventPayload) {
    const cards = [
      ...(byId("acoes-rascunho-evento")?.querySelectorAll(
        "[data-draft-action]",
      ) || []),
    ];
    if (!cards.length)
      throw new Error("Adicione pelo menos uma ação à programação do evento.");
    return cards.map((card) => {
      const value = (field) =>
        card.querySelector(`[data-draft-field="${field}"]`).value;
      return buildActionPayload(
        {
          title: value("title"),
          description: value("description"),
          startDate: value("startDate"),
          endDate: value("endDate"),
          capacity: value("capacity"),
          location: value("location"),
        },
        eventPayload,
      );
    });
  }

  function renderEventDraftSummary(eventPayload, actions, form) {
    const summary = byId("resumo-rascunho-evento");
    if (!summary) return;
    summary.replaceChildren();
    const title = document.createElement("h5");
    title.textContent = eventPayload.title;
    const details = document.createElement("dl");
    const selectedType =
      form.elements.namedItem("eventType").selectedOptions[0]?.textContent ||
      "Não informado";
    const coverFile = form.elements.namedItem("coverImage").files?.[0];
    [
      ["Tipo", selectedType],
      ["Descrição", eventPayload.description],
      [
        "Período",
        `${formatDate(eventPayload.startDate)} – ${formatDate(eventPayload.endDate)}`,
      ],
      ["Local", eventPayload.location || "Não informado"],
      ["Imagem de capa", coverFile?.name || "Não selecionada"],
    ].forEach(([label, value]) => {
      const term = document.createElement("dt");
      term.textContent = label;
      const description = document.createElement("dd");
      description.textContent = value;
      details.append(term, description);
    });
    summary.append(title, details);

    const settingsHeading = document.createElement("h5");
    settingsHeading.textContent = "Configurações selecionadas";
    const settings = document.createElement("ul");
    settings.className = "resumo-configuracoes-evento";
    [
      ["registrationOpenAutomatically", "Inscrições abertas automaticamente"],
      ["allowRegistrationCancellation", "Permitir cancelamento de inscrição"],
      ["issueCertificateAutomatically", "Emitir certificado automaticamente"],
      ["notifyParticipantsByEmail", "Notificar participantes por e-mail"],
    ].forEach(([name, label]) => {
      const item = document.createElement("li");
      item.textContent = `${label}: ${form.elements.namedItem(name).checked ? "Sim" : "Não"}`;
      settings.append(item);
    });
    summary.append(settingsHeading, settings);

    const notice = document.createElement("p");
    notice.className = "aviso-configuracoes-evento";
    notice.textContent =
      "A API atual não salva o tipo, as preferências ou o arquivo de capa. A imagem serve apenas como prévia neste formulário.";
    summary.append(notice);

    const actionsHeading = document.createElement("h5");
    actionsHeading.textContent = `Programação (${actions.length} ${actions.length === 1 ? "ação" : "ações"})`;
    summary.append(actionsHeading);
    actions.forEach((action) => {
      const item = document.createElement("div");
      item.className = "resumo-acao-rascunho";
      const actionTitle = document.createElement("strong");
      actionTitle.textContent = action.title;
      const actionInfo = document.createElement("p");
      actionInfo.textContent = `${formatDate(action.startDate)} – ${formatDate(action.endDate)} · ${action.durationMinutes} min · capacidade: ${action.capacity}${action.location ? ` · ${action.location}` : ""}`;
      const actionDescription = document.createElement("p");
      actionDescription.textContent = action.description;
      item.append(actionTitle, actionInfo, actionDescription);
      summary.append(item);
    });
  }

  function validateDraftStep(step) {
    const form = byId("form-criar-evento");
    const error = byId("erro-wizard-evento");
    error.textContent = "";
    try {
      if (step === 0) {
        const fields = [
          ...form
            .querySelector('[data-wizard-step="0"]')
            .querySelectorAll('input:not([type="file"]), textarea, select'),
        ];
        const invalidField = fields.find((input) => !input.checkValidity());
        if (invalidField) {
          invalidField.reportValidity();
          return false;
        }
        const imageError = validateCoverImage(
          form.elements.namedItem("coverImage").files?.[0],
        );
        if (imageError) {
          form.querySelector(".erro-imagem-capa").textContent = imageError;
          return false;
        }
        readEventForm(form);
        return true;
      }
      if (step === 1) return true;
      const eventPayload = readEventForm(form);
      const actions = readDraftActions(eventPayload);
      if (step >= 2) renderEventDraftSummary(eventPayload, actions, form);
      return true;
    } catch (validationError) {
      error.textContent = validationError.message;
      return false;
    }
  }

  function showCreateWizardStep(step) {
    createWizardStep = step;
    document
      .querySelectorAll("#form-criar-evento [data-wizard-step]")
      .forEach((section, index) => {
        section.hidden = index !== step;
      });
    document
      .querySelectorAll("#form-criar-evento [data-wizard-indicator]")
      .forEach((indicator, index) => {
        indicator.classList.toggle("ativa", index === step);
        indicator.classList.toggle("concluida", index < step);
        if (index === step) indicator.setAttribute("aria-current", "step");
        else indicator.removeAttribute("aria-current");
      });
    byId("voltar-etapa-evento").hidden = step === 0;
    byId("avancar-etapa-evento").hidden = step === 3;
    byId("salvar-rascunho-evento").hidden = step !== 3;
    byId("descricao-wizard-evento").textContent = [
      "Preencha as informações gerais do evento.",
      "Defina as preferências de inscrição, certificado e comunicação.",
      "Configure as ações que farão parte da programação.",
      "Confira os dados do evento e suas ações antes de salvar.",
    ][step];
    byId("erro-wizard-evento").textContent = "";
  }

  function resetCreateWizard() {
    const form = byId("form-criar-evento");
    form.reset();
    byId("acoes-rascunho-evento").replaceChildren();
    draftActionSequence = 0;
    addDraftAction(form);
    updateCoverPreview(form, "");
    showCreateWizardStep(0);
  }

  function releaseCoverPreview(form) {
    const image = form?.querySelector(".preview-capa-evento img");
    const preview = image && coverPreviewUrls.get(image);
    if (!preview) return;
    URL.revokeObjectURL(preview.url);
    coverPreviewUrls.delete(image);
  }

  function validateCoverImage(file) {
    if (!file) return "";
    if (!ALLOWED_COVER_IMAGE_TYPES.has(file.type))
      return "Escolha uma imagem JPG, PNG ou WebP.";
    if (file.size > MAX_COVER_IMAGE_SIZE)
      return "A imagem deve ter no máximo 5 MB.";
    return "";
  }

  function updateCoverPreview(
    form,
    fallbackUrl = form.dataset.currentCoverUrl || "",
  ) {
    const input = form.elements.namedItem("coverImage");
    const preview = form.querySelector(".preview-capa-evento");
    const image = preview?.querySelector("img");
    const message = form.querySelector(".erro-imagem-capa");
    if (!input || !preview || !image || !message) return;

    const file = input.files?.[0];
    const validationMessage = validateCoverImage(file);
    const previous = coverPreviewUrls.get(image);
    if (previous && previous.file !== file) {
      URL.revokeObjectURL(previous.url);
      coverPreviewUrls.delete(image);
    }
    message.textContent = validationMessage;
    if (validationMessage) {
      preview.hidden = true;
      image.removeAttribute("src");
      return;
    }

    let url = fallbackUrl;
    if (file) {
      let localPreview = coverPreviewUrls.get(image);
      if (!localPreview) {
        localPreview = { file, url: URL.createObjectURL(file) };
        coverPreviewUrls.set(image, localPreview);
      }
      url = localPreview.url;
    }
    image.onerror = () => {
      if (image.src !== url) return;
      preview.hidden = true;
      message.textContent = "Não foi possível carregar a prévia desta imagem.";
    };
    if (!url) {
      image.removeAttribute("src");
      preview.hidden = true;
      return;
    }
    image.src = url;
    preview.hidden = false;
  }

  function eventImageUrl(event) {
    const candidates = [
      event.coverImageUrl,
      event.imageUrl,
      event.bannerUrl,
      event.bannerImageUrl,
      event.thumbnailUrl,
      event.coverImage?.url,
      event.image?.url,
      event.banner?.url,
      event.picture?.url,
      event.coverImage,
      event.image,
      event.banner,
    ];
    const value = candidates.find(
      (candidate) => typeof candidate === "string" && candidate.trim(),
    );
    if (!value) return "";

    try {
      const url = new URL(value.trim(), window.location.origin);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  function openEventDetails(eventId, trigger) {
    const eventIndex = currentPublicEvents.findIndex(
      (item) => String(item.id) === String(eventId),
    );
    if (eventIndex < 0) {
      showMessage(
        "Não foi possível localizar os dados deste evento. Atualize a lista e tente novamente.",
        "erro",
      );
      return;
    }

    const event = currentPublicEvents[eventIndex];
    const dialog = byId("dialog-detalhes-evento");
    const cover = dialog.querySelector(".capa-modal-evento");
    const image = byId("imagem-modal-evento");
    const content = byId("conteudo-modal-detalhes-evento");
    const category = eventCategory(event);
    const imageUrl = eventImageUrl(event);

    cover.className = `capa-modal-evento capa-evento--${(eventIndex % 6) + 1}`;
    byId("categoria-modal-evento").textContent = category;
    image.hidden = true;
    image.removeAttribute("src");
    image.onerror = () => {
      if (image.src !== imageUrl) return;
      image.hidden = true;
      image.removeAttribute("src");
    };
    if (imageUrl) {
      image.src = imageUrl;
      image.hidden = false;
    }

    content.replaceChildren();
    const heading = document.createElement("header");
    heading.className = "cabecalho-modal-evento";
    const titleGroup = document.createElement("div");
    const title = document.createElement("h3");
    title.id = "titulo-modal-detalhes-evento";
    title.textContent = event.title || "Evento sem título";
    const metadata = document.createElement("div");
    metadata.className = "metadados-modal-evento";
    const metadataEntries = [
      ["Início", formatDate(event.startDate), "time", event.startDate],
      ["Término", formatDate(event.endDate), "time", event.endDate],
      ["Local", event.location || "Local a confirmar", "address"],
      [
        "Organização",
        event.organizer?.name || event.organizer?.email || "Não informada",
        "span",
      ],
    ];
    metadataEntries.forEach(([label, value, tagName, dateTime]) => {
      const entry = document.createElement("div");
      entry.className = "metadado-modal-evento";
      const entryLabel = document.createElement("span");
      entryLabel.className = "rotulo-metadado-modal-evento";
      entryLabel.textContent = label;
      const entryValue = document.createElement(tagName);
      if (tagName === "time" && dateTime) entryValue.dateTime = dateTime;
      if (tagName === "address") entryValue.className = "endereco-modal-evento";
      entryValue.textContent = value;
      entry.append(entryLabel, entryValue);
      metadata.append(entry);
    });
    titleGroup.append(title, metadata);

    const status = document.createElement("span");
    const registration = registrationStatus(event);
    status.className = "status-evento";
    status.dataset.status = registration.key;
    status.textContent = registration.label;
    heading.append(titleGroup, status);

    const description = document.createElement("p");
    description.className = "descricao-modal-evento";
    description.textContent =
      event.description || "Não há descrição cadastrada para este evento.";
    content.append(heading, description);

    const actions = document.createElement("section");
    actions.className = "acoes-modal-evento";
    const actionsHeading = document.createElement("h4");
    const eventActions = Array.isArray(event.actions) ? event.actions : [];
    actionsHeading.textContent = `Programação${eventActions.length ? ` (${eventActions.length})` : ""}`;
    actions.append(actionsHeading);
    if (eventActions.length) {
      const list = document.createElement("div");
      list.className = "lista-acoes-evento";
      eventActions.forEach((action) => {
        list.append(
          renderActionSummary(
            action,
            false,
            Boolean(localStorage.getItem("sige_access_token")),
          ),
        );
      });
      actions.append(list);
    } else {
      const empty = document.createElement("p");
      empty.className = "detalhes-evento";
      empty.textContent = "Este evento ainda não possui ações cadastradas.";
      actions.append(empty);
    }
    content.append(actions);

    lastEventDetailsTrigger = trigger;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector(".botao-fechar-detalhes-evento").focus();
  }

  function renderPublicEvent(event, index) {
    const card = document.createElement("article");
    card.className = "cartao-evento-publico";
    card.setAttribute("role", "listitem");
    const category = eventCategory(event);
    const registration = registrationStatus(event);

    const cover = document.createElement("figure");
    cover.className = `capa-evento capa-evento--${(index % 6) + 1}`;
    cover.setAttribute("aria-hidden", "true");
    const coverUrl = eventImageUrl(event);
    if (coverUrl) {
      const coverImage = document.createElement("img");
      coverImage.src = coverUrl;
      coverImage.alt = "";
      coverImage.loading = "lazy";
      coverImage.onerror = () => coverImage.remove();
      cover.append(coverImage);
    }
    const categoryLabel = document.createElement("figcaption");
    categoryLabel.className = "categoria-evento";
    categoryLabel.textContent = category;
    cover.append(categoryLabel);

    const content = document.createElement("div");
    content.className = "conteudo-cartao-evento";
    const accessibleCategory = document.createElement("span");
    accessibleCategory.className = "rotulo-somente-leitor";
    accessibleCategory.textContent = `Categoria: ${category}`;
    const heading = document.createElement("header");
    const title = document.createElement("h4");
    title.textContent = event.title || "Evento sem título";
    heading.append(title);

    const metadata = document.createElement("ul");
    metadata.className = "metadados-evento";
    const dateItem = document.createElement("li");
    const dateIcon = document.createElement("span");
    dateIcon.className = "metadado-icone-evento";
    dateIcon.setAttribute("aria-hidden", "true");
    dateIcon.textContent = "◷";
    const date = document.createElement("time");
    date.dateTime = event.startDate || "";
    date.textContent = formatCardDate(event.startDate);
    dateItem.append(dateIcon, date);
    const locationItem = document.createElement("li");
    const locationIcon = document.createElement("span");
    locationIcon.className = "metadado-icone-evento";
    locationIcon.setAttribute("aria-hidden", "true");
    locationIcon.textContent = "⌖";
    const location = document.createElement("address");
    location.textContent = event.location || "Local a confirmar";
    locationItem.append(locationIcon, location);
    metadata.append(dateItem, locationItem);

    const stats = document.createElement("ul");
    stats.className = "estatisticas-evento";
    stats.setAttribute("aria-label", "Resumo da programação");
    const actionStat = document.createElement("li");
    const actionCount = Array.isArray(event.actions) ? event.actions.length : 0;
    actionStat.textContent = `${actionCount} ${actionCount === 1 ? "ação" : "ações"}`;
    stats.append(actionStat);
    if (registration.capacity > 0) {
      const capacityStat = document.createElement("li");
      capacityStat.textContent =
        registration.remaining === null
          ? `Capacidade: ${registration.capacity} vagas`
          : `${registration.remaining} ${registration.remaining === 1 ? "vaga disponível" : "vagas disponíveis"}`;
      stats.append(capacityStat);
    }

    content.append(accessibleCategory, heading, metadata, stats);
    if (registration.remaining !== null && registration.capacity > 0) {
      const progress = document.createElement("div");
      progress.className = "estado-inscricoes";
      progress.dataset.status = registration.key;
      progress.setAttribute("role", "progressbar");
      progress.setAttribute("aria-label", "Ocupação total das ações");
      progress.setAttribute("aria-valuemin", "0");
      progress.setAttribute("aria-valuemax", String(registration.capacity));
      progress.setAttribute(
        "aria-valuenow",
        String(registration.capacity - registration.remaining),
      );
      const fill = document.createElement("span");
      fill.style.width = `${Math.min(100, ((registration.capacity - registration.remaining) / registration.capacity) * 100)}%`;
      progress.append(fill);
      content.append(progress);
    }

    const footer = document.createElement("footer");
    footer.className = "rodape-cartao-evento";
    const status = document.createElement("span");
    status.className = "status-evento";
    status.dataset.status = registration.key;
    status.textContent = registration.label;
    const detailsButton = document.createElement("button");
    detailsButton.type = "button";
    detailsButton.className = "botao-detalhes-evento";
    detailsButton.dataset.eventAction = "open-event-details";
    detailsButton.dataset.value = String(event.id);
    detailsButton.setAttribute("aria-haspopup", "dialog");
    detailsButton.setAttribute("aria-controls", "dialog-detalhes-evento");
    detailsButton.textContent = "Ver evento";
    footer.append(status, detailsButton);

    content.append(footer);
    card.append(cover, content);
    return card;
  }

  function updatePublicResults() {
    const list = byId("lista-eventos-publicos");
    const emptyState = byId("estado-vazio-eventos");
    const count = byId("contagem-eventos");
    const category = byId("filtro-categoria-eventos")?.value || "";
    const status = byId("filtro-status-eventos")?.value || "";
    if (!list || !emptyState || !count) return;

    const filtered = currentPublicEvents.filter((event) => {
      const matchesCategory = !category || eventCategory(event) === category;
      const matchesStatus = !status || registrationStatus(event).key === status;
      return matchesCategory && matchesStatus;
    });

    list.replaceChildren(
      ...filtered.map((event, index) => renderPublicEvent(event, index)),
    );
    emptyState.hidden = filtered.length > 0;
    emptyState.textContent = currentPublicEvents.length
      ? "Nenhum evento nesta página corresponde aos filtros selecionados."
      : "Nenhum evento publicado corresponde à sua pesquisa.";
    const total = Number(currentPublicMeta?.total) || 0;
    const hasLocalFilters = Boolean(category || status);
    count.textContent = `Exibindo ${filtered.length} ${filtered.length === 1 ? "evento" : "eventos"}${total > filtered.length ? ` · ${total} no total` : ""}${hasLocalFilters ? " · categoria e status filtrados nesta página" : ""}`;
  }

  function setPublicLoading(text) {
    const list = byId("lista-eventos-publicos");
    const emptyState = byId("estado-vazio-eventos");
    if (!list || !emptyState) return;
    list.setAttribute("aria-busy", "true");
    list.replaceChildren();
    emptyState.textContent = text;
    emptyState.hidden = false;
    byId("contagem-eventos").textContent = text;
  }

  async function loadPublicEvents(page = 1) {
    const list = byId("lista-eventos-publicos");
    const pagination = byId("paginacao-eventos");
    const form = byId("filtros-eventos");
    if (!list || !pagination || !form) return;

    currentPage = page;
    const sequence = ++searchSequence;
    setPublicLoading("Buscando eventos...");
    pagination.replaceChildren();

    const query = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
    });
    const formData = new FormData(form);
    const title = String(formData.get("title") || "").trim();
    const startDateFrom = String(formData.get("startDateFrom") || "");
    const startDateTo = String(formData.get("startDateTo") || "");
    if (title) query.set("title", title);
    if (startDateFrom)
      query.set(
        "startDateFrom",
        new Date(`${startDateFrom}T00:00:00`).toISOString(),
      );
    if (startDateTo)
      query.set(
        "startDateTo",
        new Date(`${startDateTo}T23:59:59.999`).toISOString(),
      );

    if (startDateFrom && startDateTo && startDateTo < startDateFrom) {
      setPublicLoading(
        "A data final deve ser igual ou posterior à data inicial.",
      );
      list.setAttribute("aria-busy", "false");
      showMessage("Revise o intervalo de datas dos filtros.", "erro");
      return;
    }

    try {
      const result = await api(`${EVENTS_API}?${query.toString()}`);
      if (sequence !== searchSequence) return;
      if (!result || !Array.isArray(result.data) || !result.meta) {
        throw new Error(
          "A API retornou uma lista de eventos em formato inesperado.",
        );
      }
      currentPublicEvents = result.data;
      currentPublicMeta = result.meta;
      updateCategoryFilter(currentPublicEvents);
      updatePublicResults();
      list.setAttribute("aria-busy", "false");

      const pageNumber = Number(result.meta.page) || page;
      const pages = Number(result.meta.pages) || 0;
      if (pageNumber > 1) {
        pagination.append(
          makeButton("Anterior", "botao-evento-secundario", "previous-page"),
        );
      }
      if (pages > 1) {
        const pageInfo = document.createElement("span");
        pageInfo.className = "detalhes-evento";
        pageInfo.textContent = `Página ${pageNumber} de ${pages}`;
        pagination.append(pageInfo);
      }
      if (pages && pageNumber < pages) {
        pagination.append(
          makeButton("Próxima", "botao-evento-secundario", "next-page"),
        );
      }
      showMessage("");
    } catch (error) {
      if (sequence !== searchSequence) return;
      currentPublicEvents = [];
      currentPublicMeta = null;
      updatePublicResults();
      setPublicLoading(error.message);
      list.setAttribute("aria-busy", "false");
      showMessage(error.message, "erro");
    }
  }

  function renderEventEditForm(event) {
    const form = document.createElement("form");
    form.className = "formulario-editar-evento";
    form.dataset.formType = "edit-event";
    form.innerHTML = `
            <h5>Dados do evento</h5>
            <label class="campo-evento"><span>Título *</span><input name="title" required minlength="3" maxlength="200" value="${escapeHtml(event.title)}"></label>
            <label class="campo-evento"><span>Descrição *</span><textarea name="description" required minlength="10" maxlength="5000" rows="4">${escapeHtml(event.description)}</textarea></label>
            <div class="campos-data-evento">
                <label class="campo-evento"><span>Início *</span><input name="startDate" type="datetime-local" required value="${toLocalDateTime(event.startDate)}"></label>
                <label class="campo-evento"><span>Término *</span><input name="endDate" type="datetime-local" required value="${toLocalDateTime(event.endDate)}"></label>
            </div>
            <label class="campo-evento"><span>Local</span><input name="location" maxlength="255" value="${escapeHtml(event.location)}"></label>
            <label class="campo-evento campo-imagem-evento">
                <span>Substituir imagem de capa</span>
                <input name="coverImage" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="ajuda-imagem-capa-edicao">
                <span id="ajuda-imagem-capa-edicao" class="ajuda-imagem-capa">JPG, PNG ou WebP de até 5 MB. A API atual ainda não oferece upload; a seleção serve apenas como prévia.</span>
                <span class="preview-capa-evento" hidden><img alt="Prévia da imagem de capa do evento"></span>
                <span class="erro-imagem-capa" role="status" aria-live="polite"></span>
            </label>
            <div class="acoes-formulario-evento">
                <button class="botao-evento botao-evento-primario" type="submit">Salvar alterações</button>
            </div>`;
    form.dataset.currentCoverUrl = eventImageUrl(event);
    updateCoverPreview(form);
    return form;
  }

  function renderActionForm(event, action = null) {
    const form = document.createElement("form");
    form.className = "formulario-acao-evento";
    form.dataset.formType = action ? "edit-action" : "create-action";
    if (action) form.dataset.actionId = action.id;
    const startValue = action?.startDate
      ? toLocalDateTime(action.startDate)
      : toLocalDateTime(event.startDate);
    const endValue = action?.endDate
      ? toLocalDateTime(action.endDate)
      : toLocalDateTime(event.endDate);
    form.innerHTML = `
            <h5>${action ? "Editar ação" : "Adicionar ação"}</h5>
            <label class="campo-evento"><span>Título *</span><input name="title" required minlength="3" maxlength="200" value="${escapeHtml(action?.title || "")}"></label>
            <label class="campo-evento"><span>Descrição *</span><textarea name="description" required minlength="3" maxlength="5000" rows="3">${escapeHtml(action?.description || "")}</textarea></label>
            <div class="campos-data-evento">
                <label class="campo-evento"><span>Início *</span><input name="startDate" type="datetime-local" required value="${startValue}"></label>
                <label class="campo-evento"><span>Término *</span><input name="endDate" type="datetime-local" required value="${endValue}"></label>
            </div>
            <div class="campos-data-evento">
                <label class="campo-evento"><span>Capacidade *</span><input name="capacity" type="number" min="1" step="1" required value="${escapeHtml(action?.capacity ?? 1)}"></label>
                <label class="campo-evento"><span>Local</span><input name="location" maxlength="255" value="${escapeHtml(action?.location || "")}"></label>
            </div>
            <p class="detalhes-evento">A duração será calculada entre início e término; o backend valida que a ação ocorra dentro do evento.</p>
            <div class="acoes-formulario-evento">
                <button class="botao-evento botao-evento-primario" type="submit">${action ? "Salvar ação" : "Adicionar ação"}</button>
                ${action ? '<button class="botao-evento botao-evento-perigo botao-evento-secundario" type="button" data-event-action="cancel-edit-action">Fechar edição</button>' : ""}
            </div>`;
    return form;
  }

  function renderManagedEvent(event) {
    currentManagerEvent = event;
    saveManagedEvent(event);
    const panel = byId("painel-gerenciamento-evento");
    if (!panel) return;
    releaseCoverPreview(panel);
    panel.replaceChildren();

    const card = document.createElement("article");
    card.className = "cartao-gerenciamento-evento";
    const heading = document.createElement("div");
    heading.className = "cabecalho-gerenciamento-evento";
    const summary = document.createElement("div");
    const title = document.createElement("h4");
    title.textContent = event.title || "Evento sem título";
    const details = document.createElement("p");
    details.className = "detalhes-evento";
    details.textContent = `${EVENT_STATUSES[event.status] || event.status} · ID: ${event.id} · ${formatDate(event.startDate)} – ${formatDate(event.endDate)}`;
    summary.append(title, details);

    const controls = document.createElement("div");
    controls.className = "acoes-gerenciamento-evento";
    if (["RASCUNHO", "PUBLICADO"].includes(event.status)) {
      controls.append(
        makeButton("Editar evento", "botao-evento-secundario", "edit-event"),
      );
    }
    if (event.status === "RASCUNHO") {
      const publish = makeButton(
        "Publicar",
        "botao-evento-primario",
        "publish-event",
      );
      const hasActiveAction =
        Array.isArray(event.actions) &&
        event.actions.some((action) => action.status === "ATIVA");
      const eventHasNotEnded = new Date(event.endDate).getTime() > Date.now();
      publish.disabled = !hasActiveAction || !eventHasNotEnded;
      if (!hasActiveAction)
        publish.title = "Adicione pelo menos uma ação antes de publicar.";
      else if (!eventHasNotEnded)
        publish.title = "Não é possível publicar um evento que já terminou.";
      controls.append(publish);
    }
    if (event.status === "PUBLICADO") {
      controls.append(
        makeButton("Encerrar evento", "botao-evento-secundario", "close-event"),
      );
    }
    if (["RASCUNHO", "PUBLICADO"].includes(event.status)) {
      controls.append(
        makeButton("Cancelar evento", "botao-evento-perigo", "cancel-event"),
      );
    }
    heading.append(summary, controls);
    card.append(heading);
    if (["RASCUNHO", "PUBLICADO"].includes(event.status)) {
      card.append(renderEventEditForm(event));
    }

    const actionsSection = document.createElement("section");
    actionsSection.className = "lista-acoes-gerenciaveis";
    const actionsTitle = document.createElement("h5");
    actionsTitle.textContent = "Ações do evento";
    actionsSection.append(actionsTitle);

    const actions = Array.isArray(event.actions) ? event.actions : [];
    if (actions.length) {
      actions.forEach((action) =>
        actionsSection.append(
          renderActionSummary(
            action,
            ["RASCUNHO", "PUBLICADO"].includes(event.status),
          ),
        ),
      );
    } else {
      const empty = document.createElement("p");
      empty.className = "detalhes-evento";
      empty.textContent =
        event.status === "RASCUNHO"
          ? "Este evento ainda não possui ações. Adicione pelo menos uma para poder publicá-lo."
          : "Este evento não possui ações cadastradas.";
      actionsSection.append(empty);
    }

    if (canManage() && ["RASCUNHO", "PUBLICADO"].includes(event.status)) {
      actionsSection.append(renderActionForm(event));
    }
    card.append(actionsSection);
    panel.append(card);
  }

  async function openManagedEvent(id) {
    const eventId = id.trim();
    if (!eventId) {
      showMessage("Informe o identificador do evento.", "erro");
      return;
    }
    showMessage("Carregando evento e verificando seu escopo...");
    byId("painel-gerenciamento-evento")?.replaceChildren();
    try {
      const event = await api(
        `${EVENTS_API}/${encodeURIComponent(eventId)}/manage`,
      );
      if (!event || event.id !== eventId) {
        throw new Error("A API retornou um evento diferente do solicitado.");
      }
      renderManagedEvent(event);
      showMessage(
        "Evento carregado. As ações disponíveis respeitam o status atual.",
        "sucesso",
      );
      return true;
    } catch (error) {
      currentManagerEvent = null;
      showMessage(error.message, "erro");
      return false;
    }
  }

  function readEventForm(form) {
    const data = new FormData(form);
    return buildEventPayload({
      title: data.get("title"),
      description: data.get("description"),
      startDate: data.get("startDate"),
      endDate: data.get("endDate"),
      location: data.get("location"),
    });
  }

  function readActionForm(form) {
    const data = new FormData(form);
    return buildActionPayload(
      {
        title: data.get("title"),
        description: data.get("description"),
        startDate: data.get("startDate"),
        endDate: data.get("endDate"),
        capacity: data.get("capacity"),
        location: data.get("location"),
      },
      currentManagerEvent,
    );
  }

  async function createEvent(form) {
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    const wizardError = byId("erro-wizard-evento");
    try {
      const payload = readEventForm(form);
      const actions = readDraftActions(payload);
      const event = await api(EVENTS_API, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!event?.id) {
        byId("dialog-criar-evento").close();
        resetCreateWizard();
        showMessage(
          "A API não retornou o identificador do evento criado. Confirme se o rascunho foi registrado antes de tentar criar outro para evitar duplicatas.",
          "erro",
        );
        return;
      }
      saveManagedEvent(event);
      byId("dialog-criar-evento").close();
      const opened = await openManagedEvent(event.id);
      if (!opened) {
        resetCreateWizard();
        showMessage(
          `Evento criado com ID ${event.id}, mas a API não permitiu abrir seu gerenciamento.`,
          "erro",
        );
        return;
      }

      try {
        for (const action of actions) {
          await api(`${EVENTS_API}/${encodeURIComponent(event.id)}/actions`, {
            method: "POST",
            body: JSON.stringify(action),
          });
        }
      } catch (actionError) {
        resetCreateWizard();
        let refreshFailure = "";
        try {
          const updated = await api(
            `${EVENTS_API}/${encodeURIComponent(event.id)}/manage`,
          );
          renderManagedEvent(updated);
        } catch (refreshError) {
          refreshFailure = ` Não foi possível atualizar o painel: ${refreshError.message}`;
        }
        showMessage(
          `O rascunho ${event.id} foi criado, mas uma ação não foi salva: ${actionError.message} Confira as ações existentes antes de tentar novamente para evitar duplicatas.${refreshFailure}`,
          "erro",
        );
        return;
      }

      resetCreateWizard();
      try {
        const updated = await api(
          `${EVENTS_API}/${encodeURIComponent(event.id)}/manage`,
        );
        renderManagedEvent(updated);
        showMessage(
          "Evento e programação criados como rascunho. Tipo, preferências e imagem não foram salvos porque a API ainda não os aceita.",
          "sucesso",
        );
      } catch (refreshError) {
        showMessage(
          `Evento e programação foram salvos no rascunho ${event.id}, mas não foi possível atualizar o painel: ${refreshError.message}`,
          "erro",
        );
      }
    } catch (creationError) {
      if (byId("dialog-criar-evento").open) {
        wizardError.textContent = creationError.message;
      } else {
        showMessage(creationError.message, "erro");
      }
    } finally {
      button.disabled = false;
    }
  }

  async function saveEventChanges(form) {
    if (!currentManagerEvent) return;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const event = await api(
        `${EVENTS_API}/${encodeURIComponent(currentManagerEvent.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify(readEventForm(form)),
        },
      );
      renderManagedEvent(event);
      const selectedCover = form.elements.namedItem("coverImage").files?.[0];
      showMessage(
        selectedCover
          ? "Alterações do evento salvas; a imagem selecionada não foi enviada porque a API não oferece upload."
          : "Alterações do evento salvas.",
        "sucesso",
      );
    } catch (error) {
      showMessage(error.message, "erro");
    } finally {
      button.disabled = false;
    }
  }

  async function saveAction(form) {
    if (!currentManagerEvent) return;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const payload = readActionForm(form);
      const actionId = form.dataset.actionId;
      const path = actionId
        ? `${ACTIONS_API}/${encodeURIComponent(actionId)}`
        : `${EVENTS_API}/${encodeURIComponent(currentManagerEvent.id)}/actions`;
      const action = await api(path, {
        method: actionId ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      const updated = await api(
        `${EVENTS_API}/${encodeURIComponent(currentManagerEvent.id)}/manage`,
      );
      renderManagedEvent(updated);
      showMessage(
        actionId ? "Ação atualizada." : "Ação adicionada ao evento.",
        "sucesso",
      );
    } catch (error) {
      showMessage(error.message, "erro");
    } finally {
      button.disabled = false;
    }
  }

  async function transition(path, label) {
    if (!currentManagerEvent) return;
    try {
      await api(path, { method: "POST" });
      const updated = await api(
        `${EVENTS_API}/${encodeURIComponent(currentManagerEvent.id)}/manage`,
      );
      renderManagedEvent(updated);
      showMessage(label, "sucesso");
    } catch (error) {
      showMessage(error.message, "erro");
    }
  }

  async function registerForAction(actionId, button) {
    button.disabled = true;
    button.textContent = "Inscrevendo...";
    try {
      const action = await api(
        `${ACTIONS_API}/${encodeURIComponent(actionId)}`,
      );
      if (
        action?.id !== actionId ||
        action.status !== "ATIVA" ||
        action.event?.status !== "PUBLICADO"
      ) {
        throw new Error("Esta ação não está mais disponível para inscrição.");
      }
      const result = await api(
        `/registrations/actions/${encodeURIComponent(actionId)}`,
        {
          method: "POST",
        },
      );
      if (!result?.id || result.actionId !== actionId) {
        throw new Error("A API não confirmou a inscrição nesta ação.");
      }
      registeredActionIds.add(String(actionId));
      decrementKnownActionAvailability(actionId);
      updatePublicResults();
      button.textContent = "Inscrito";
      button.disabled = true;
      showMessage("Inscrição realizada nesta ação.", "sucesso");
    } catch (error) {
      button.disabled = false;
      button.textContent = "Inscrever-se nesta ação";
      const lowerMessage = error.message.toLocaleLowerCase("pt-BR");
      if (
        error.status === 409 ||
        /já (está )?inscrit|duplicad/.test(lowerMessage)
      ) {
        showMessage(
          "A API recusou a inscrição porque ela já existe ou a ação foi alterada. Atualize a página e confira seu histórico.",
          "erro",
        );
      } else if (/vaga|capacidade|lotad|esgotad/.test(lowerMessage)) {
        showMessage(
          "As vagas desta ação podem ter acabado. Atualize a página e tente novamente.",
          "erro",
        );
      } else {
        showMessage(error.message, "erro");
      }
    }
  }

  function onEventsClick(event) {
    const button = event.target.closest("[data-event-action]");
    if (!button) return;
    const action = button.dataset.eventAction;
    const value = button.dataset.value;
    if (action === "open-event-details") {
      openEventDetails(value, button);
      return;
    }
    if (action === "close-event-details") {
      byId("dialog-detalhes-evento")?.close();
      return;
    }
    if (action === "close-create" || action === "wizard-cancel") {
      byId("dialog-criar-evento")?.close();
      resetCreateWizard();
    }
    if (action === "wizard-next") {
      if (validateDraftStep(createWizardStep))
        showCreateWizardStep(createWizardStep + 1);
    }
    if (action === "wizard-back")
      showCreateWizardStep(Math.max(0, createWizardStep - 1));
    if (action === "remove-draft-action") {
      button.closest("[data-draft-action]")?.remove();
      updateDraftActionLabels();
    }
    if (action === "publish-event") {
      if (
        window.confirm(
          "Publicar este evento? Ele ficará disponível para consulta pública.",
        )
      ) {
        transition(
          `${EVENTS_API}/${encodeURIComponent(currentManagerEvent.id)}/publish`,
          "Evento publicado.",
        );
      }
    }
    if (action === "cancel-event") {
      if (
        window.confirm(
          "Cancelar este evento? O cancelamento não poderá ser desfeito.",
        )
      ) {
        transition(
          `${EVENTS_API}/${encodeURIComponent(currentManagerEvent.id)}/cancel`,
          "Evento cancelado.",
        );
      }
    }
    if (action === "close-event") {
      if (window.confirm("Encerrar este evento?")) {
        transition(
          `${EVENTS_API}/${encodeURIComponent(currentManagerEvent.id)}/close`,
          "Evento encerrado.",
        );
      }
    }
    if (action === "edit-action") {
      const item = button.closest(".item-acao-evento");
      const selected = currentManagerEvent.actions?.find(
        (itemAction) => itemAction.id === value,
      );
      if (item && selected)
        item.replaceWith(renderActionForm(currentManagerEvent, selected));
    }
    if (action === "cancel-edit-action") {
      if (currentManagerEvent) renderManagedEvent(currentManagerEvent);
    }
    if (action === "cancel-action" || action === "close-action") {
      const label =
        action === "cancel-action"
          ? "Cancelar esta ação?"
          : "Encerrar esta ação?";
      if (window.confirm(label)) {
        const transitionName = action === "cancel-action" ? "cancel" : "close";
        const done =
          action === "cancel-action" ? "Ação cancelada." : "Ação encerrada.";
        transition(
          `${ACTIONS_API}/${encodeURIComponent(value)}/${transitionName}`,
          done,
        );
      }
    }
    if (action === "register-action") {
      registerForAction(value, button);
    }
    if (action === "previous-page" || action === "next-page") {
      loadPublicEvents(currentPage + (action === "next-page" ? 1 : -1));
    }
  }

  function initializeEvents() {
    currentRole = String(currentUser().role || "")
      .trim()
      .toUpperCase();
    byId("novo-evento").hidden = !canManage();
    byId("secao-gerenciamento-eventos").hidden = !canManage();
    renderSavedEvents();

    byId("eventos-recentes")?.addEventListener("change", (event) => {
      if (event.target.value)
        byId("identificador-evento").value = event.target.value;
    });
    byId("abrir-evento-form")?.addEventListener("submit", (event) => {
      event.preventDefault();
      openManagedEvent(byId("identificador-evento").value);
    });
    byId("novo-evento")?.addEventListener("click", () => {
      resetCreateWizard();
      byId("dialog-criar-evento")?.showModal();
    });
    byId("dialog-criar-evento")?.addEventListener("click", onEventsClick);
    const eventDetailsDialog = byId("dialog-detalhes-evento");
    eventDetailsDialog?.addEventListener("click", onEventsClick);
    eventDetailsDialog?.addEventListener("cancel", (event) => {
      event.preventDefault();
    });
    eventDetailsDialog?.addEventListener("close", () => {
      if (lastEventDetailsTrigger?.isConnected) lastEventDetailsTrigger.focus();
      lastEventDetailsTrigger = null;
    });
    byId("adicionar-acao-rascunho")?.addEventListener("click", () =>
      addDraftAction(byId("form-criar-evento")),
    );
    byId("form-criar-evento")
      ?.elements.namedItem("coverImage")
      ?.addEventListener("change", () =>
        updateCoverPreview(byId("form-criar-evento")),
      );
    byId("form-criar-evento")?.addEventListener("submit", (event) => {
      event.preventDefault();
      if (createWizardStep !== 3) {
        if (validateDraftStep(createWizardStep))
          showCreateWizardStep(createWizardStep + 1);
        return;
      }
      if (validateDraftStep(3)) createEvent(event.currentTarget);
    });
    byId("filtros-eventos")?.addEventListener("submit", (event) => {
      event.preventDefault();
      showMessage("");
      loadPublicEvents(1);
    });
    byId("busca-eventos")?.addEventListener("input", () => {
      window.clearTimeout(searchDebounceTimer);
      searchDebounceTimer = window.setTimeout(() => loadPublicEvents(1), 300);
    });
    byId("filtro-categoria-eventos")?.addEventListener(
      "change",
      updatePublicResults,
    );
    byId("filtro-status-eventos")?.addEventListener(
      "change",
      updatePublicResults,
    );
    byId("filtros-eventos")
      ?.querySelectorAll('input[type="date"]')
      .forEach((input) =>
        input.addEventListener("change", () => loadPublicEvents(1)),
      );
    byId("limpar-filtros-eventos")?.addEventListener("click", () => {
      window.clearTimeout(searchDebounceTimer);
      byId("filtros-eventos")?.reset();
      showMessage("");
      loadPublicEvents(1);
    });
    byId("lista-eventos-publicos")?.addEventListener("click", onEventsClick);
    byId("paginacao-eventos")?.addEventListener("click", onEventsClick);
    byId("painel-gerenciamento-evento")?.addEventListener(
      "click",
      onEventsClick,
    );
    byId("painel-gerenciamento-evento")?.addEventListener("change", (event) => {
      if (event.target.matches('[name="coverImage"]')) {
        updateCoverPreview(event.target.form);
      }
    });
    byId("painel-gerenciamento-evento")?.addEventListener("submit", (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      event.preventDefault();
      if (form.dataset.formType === "edit-event") saveEventChanges(form);
      if (
        form.dataset.formType === "edit-action" ||
        form.dataset.formType === "create-action"
      )
        saveAction(form);
    });
    loadPublicEvents(1);
  }

  window.inicializarModuloEventos = initializeEvents;
})();
