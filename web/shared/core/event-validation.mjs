function requiredText(value, label, minLength, maxLength) {
  const text = String(value ?? "").trim();
  if (text.length < minLength || text.length > maxLength) {
    throw new Error(
      `${label} deve ter entre ${minLength} e ${maxLength} caracteres.`,
    );
  }
  return text;
}

function toIsoDate(value, label) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    throw new Error(`Informe uma data e hora válidas para ${label}.`);
  }
  return date.toISOString();
}

export function buildEventPayload(fields) {
  const title = requiredText(fields.title, "O título", 3, 200);
  const description = requiredText(fields.description, "A descrição", 10, 5000);
  const startDate = toIsoDate(fields.startDate, "o início do evento");
  const endDate = toIsoDate(fields.endDate, "o término do evento");

  if (new Date(endDate) <= new Date(startDate)) {
    throw new Error("O término deve ocorrer depois do início.");
  }

  const location = String(fields.location ?? "").trim();
  if (location.length > 255)
    throw new Error("O local pode ter no máximo 255 caracteres.");

  const rn = {};
  if (fields.category) rn.category = requiredText(fields.category, "A categoria", 1, 100);
  for (const key of ["workloadMinutes", "totalCapacity"]) {
    if (fields[key] !== undefined && fields[key] !== "") {
      const value = Number(fields[key]);
      if (!Number.isInteger(value) || value <= 0) throw new Error("Carga horária e vagas devem ser inteiros positivos.");
      rn[key] = value;
    }
  }
  if (fields.registrationStartDate || fields.registrationEndDate) {
    rn.registrationStartDate = toIsoDate(fields.registrationStartDate, "a abertura das inscrições");
    rn.registrationEndDate = toIsoDate(fields.registrationEndDate, "o encerramento das inscrições");
    if (rn.registrationStartDate >= rn.registrationEndDate || rn.registrationEndDate > endDate)
      throw new Error("A janela de inscrições deve ter início antes do fim e terminar até o fim do evento.");
  }
  return {
    ...rn,
    title,
    description,
    startDate,
    endDate,
    location,
  };
}

export function buildActionPayload(fields, event) {
  const title = requiredText(fields.title, "O título da ação", 3, 200);
  const description = requiredText(
    fields.description,
    "A descrição da ação",
    3,
    5000,
  );
  const startDate = toIsoDate(fields.startDate, "o início da ação");
  const endDate = toIsoDate(fields.endDate, "o término da ação");
  const durationMs =
    new Date(endDate).getTime() - new Date(startDate).getTime();
  const durationMinutes = durationMs / 60_000;
  const capacity = Number(fields.capacity);

  if (!Number.isInteger(durationMinutes) || durationMinutes < 1) {
    throw new Error(
      "A ação precisa ter duração de pelo menos um minuto inteiro.",
    );
  }
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new Error("A capacidade deve ser um número inteiro maior que zero.");
  }

  const eventStart = new Date(event.startDate);
  const eventEnd = new Date(event.endDate);
  if (
    Number.isNaN(eventStart.getTime()) ||
    Number.isNaN(eventEnd.getTime()) ||
    new Date(startDate) < eventStart ||
    new Date(endDate) > eventEnd
  ) {
    throw new Error(
      "A ação deve ocorrer integralmente dentro do período do evento.",
    );
  }

  const location = String(fields.location ?? "").trim();
  if (location.length > 255)
    throw new Error("O local pode ter no máximo 255 caracteres.");

  return {
    title,
    description,
    startDate,
    endDate,
    durationMinutes,
    capacity,
    location,
  };
}
