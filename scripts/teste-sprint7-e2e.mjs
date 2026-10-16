import crypto from "node:crypto";
import fs from "node:fs";
import { execSync } from "node:child_process";

const BASE = "http://localhost:3000";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

const suffix = Date.now();

const organizerId = crypto.randomUUID();
const participantEmail = `sprint7.participante.${suffix}@sige.ifce`;
const participantPassword = "Teste@123456";

const eventId = crypto.randomUUID();
const actionId = crypto.randomUUID();

let registrationId = null;
let certificateId = null;
let validationCode = null;

const sqlFile = `./scripts/.sprint7-${suffix}.sql`;

function runSql(sql) {
  fs.writeFileSync(sqlFile, sql, "utf8");

  try {
    execSync(
      `npx prisma db execute --file "${sqlFile}"`,
      {
        cwd: process.cwd(),
        stdio: "inherit",
        shell: true
      }
    );
  } finally {
    if (fs.existsSync(sqlFile)) {
      fs.unlinkSync(sqlFile);
    }
  }
}

function check(label, condition, details = "") {
  if (!condition) {
    throw new Error(
      `${label} FALHOU${details ? `: ${details}` : ""}`
    );
  }

  console.log(`✅ ${label}`);
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, options);

  const contentType =
    response.headers.get("content-type") || "";

  let data;

  if (contentType.includes("application/json")) {
    data = await response.json();
  } else {
    data = Buffer.from(
      await response.arrayBuffer()
    );
  }

  return { response, data };
}

function getCookie(response) {
  if (
    typeof response.headers.getSetCookie !==
    "function"
  ) {
    return "";
  }

  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}

let cookie = "";

try {
  console.log("");
  console.log("============================================================");
  console.log(" SIGE IFCE - TESTE E2E SPRINT 7");
  console.log("============================================================");
  console.log("");

  // ----------------------------------------------------------
  // 1. Servidor
  // ----------------------------------------------------------

  const health = await fetch(BASE);

  check(
    "Servidor HTTP",
    health.status === 200,
    `status ${health.status}`
  );

  // ----------------------------------------------------------
  // 2. Criar participante pela API
  // ----------------------------------------------------------

  const register = await request(
    "/auth/register",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "Participante Sprint 7",
        email: participantEmail,
        password: participantPassword,
        passwordConfirmation:
          participantPassword
      })
    }
  );

  check(
    "Cadastro do participante",
    register.response.status === 201,
    `status ${register.response.status}`
  );

  cookie = getCookie(register.response);

  if (!cookie) {
    const login = await request(
      "/auth/login",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: participantEmail,
          password: participantPassword
        })
      }
    );

    check(
      "Login do participante",
      login.response.status === 200 ||
        login.response.status === 201
    );

    cookie = getCookie(login.response);
  }

  check(
    "Autenticação",
    cookie.length > 0
  );

  // ----------------------------------------------------------
  // 3. Criar organizador/evento/ação via Prisma CLI
  // ----------------------------------------------------------
  
  runSql(`
INSERT INTO "User"
("id", "name", "email", "password", "role")
VALUES
(
  '${organizerId}',
  'Organizador Sprint 7',
  'organizador.${suffix}@sige.ifce',
  'TESTE_SPRINT_7',
  'ORGANIZADOR'
);

INSERT INTO "Event"
(
  "id",
  "title",
  "description",
  "startDate",
  "endDate",
  "location",
  "status",
  "minAttendancePercent",
  "organizerId",
  "createdAt",
  "updatedAt"
)
VALUES
(
  '${eventId}',
  'Evento Teste Sprint 7',
  'Evento criado automaticamente para validar certificados.',
  '2026-10-01T08:00:00Z',
  '2026-10-01T18:00:00Z',
  'Auditório IFCE',
  'PUBLICADO',
  75,
  '${organizerId}',
  NOW(),
  NOW()
);

INSERT INTO "Action"
(
  "id",
  "eventId",
  "title",
  "description",
  "startDate",
  "endDate",
  "durationMinutes",
  "capacity",
  "location",
  "status",
  "createdAt",
  "updatedAt"
)
VALUES
(
  '${actionId}',
  '${eventId}',
  'Ação Teste Sprint 7',
  'Ação utilizada no teste de certificado.',
  '2026-10-01T09:00:00Z',
  '2026-10-01T11:00:00Z',
  120,
  50,
  'Auditório IFCE',
  'ATIVA',
  NOW(),
  NOW()
);
`);

  console.log("✅ Evento e ação criados");

  // ----------------------------------------------------------
  // 4. Inscrição
  // ----------------------------------------------------------

  const registration = await request(
    `/registrations/actions/${actionId}`,
    {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    }
  );

  check(
    "Inscrição",
    registration.response.status === 201,
    `status ${registration.response.status}`
  );

  registrationId = registration.data.id;

  check(
    "ID da inscrição",
    Boolean(registrationId)
  );

  // ----------------------------------------------------------
  // 5. Presença
  // ----------------------------------------------------------

  const presence = await request(
    "/presences",
    {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        registrationId
      })
    }
  );

  check(
    "Registro de presença",
    presence.response.status === 201,
    `status ${presence.response.status}`
  );

  // ----------------------------------------------------------
  // 6. Confirmar presente
  // ----------------------------------------------------------

  const present = await request(
    `/presences/actions/${actionId}/present`,
    {
      headers: {
        Cookie: cookie
      }
    }
  );

  check(
    "Consulta de presentes",
    present.response.status === 200,
    `HTTP ${present.response.status} - ${JSON.stringify(present.data)}`
  );

  check(
    "Participante está presente",
    Array.isArray(present.data) &&
      present.data.some(
        (item) =>
          item.id === registrationId ||
          item.registrationId === registrationId
      ),
    `Resposta recebida: ${JSON.stringify(present.data)}`
  );

  // ----------------------------------------------------------
  // 7. Encerrar ação e evento
  // ----------------------------------------------------------

  runSql(`
UPDATE "Action"
SET
  "status" = 'ENCERRADA',
  "closedAt" = NOW(),
  "updatedAt" = NOW()
WHERE "id" = '${actionId}';

UPDATE "Event"
SET
  "status" = 'ENCERRADO',
  "closedAt" = NOW(),
  "updatedAt" = NOW()
WHERE "id" = '${eventId}';
`);

  console.log("✅ Evento encerrado");

  // ----------------------------------------------------------
  // 8. Emitir certificado
  // ----------------------------------------------------------

  const issue = await request(
    `/certificates/me/events/${eventId}`,
    {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    }
  );

  check(
    "Emissão do certificado",
    issue.response.status === 200 ||
      issue.response.status === 201,
    `status ${issue.response.status}`
  );

  const certificate =
    issue.data.certificate;

  certificateId = certificate.id;
  validationCode =
    certificate.validationCode;

  check(
    "Certificado criado",
    Boolean(certificateId)
  );

  check(
    "Código único",
    typeof validationCode === "string" &&
      validationCode.startsWith("SIGE-")
  );

  check(
    "Carga horária",
    certificate.certifiedHours === 2
  );

  check(
    "Presença mínima atingida",
    certificate.attendancePercent === 100
  );

  // ----------------------------------------------------------
  // 9. Consulta
  // ----------------------------------------------------------

  const consultation = await request(
    `/certificates/${certificateId}`,
    {
      headers: {
        Cookie: cookie
      }
    }
  );

  check(
    "Consulta do certificado",
    consultation.response.status === 200
  );

  check(
    "Nome do participante",
    consultation.data.participant?.name ===
      "Participante Sprint 7"
  );

  check(
    "Nome do evento",
    consultation.data.event?.title ===
      "Evento Teste Sprint 7"
  );

  // ----------------------------------------------------------
  // 10. Meus certificados
  // ----------------------------------------------------------

  const mine = await request(
    "/certificates/me",
    {
      headers: {
        Cookie: cookie
      }
    }
  );

  check(
    "Lista de certificados",
    mine.response.status === 200
  );

  check(
    "Certificado aparece na lista",
    Array.isArray(mine.data) &&
      mine.data.some(
        (item) => item.id === certificateId
      )
  );

  // ----------------------------------------------------------
  // 11. Download
  // ----------------------------------------------------------

  const download = await request(
    `/certificates/${certificateId}/download`,
    {
      headers: {
        Cookie: cookie
      }
    }
  );

  check(
    "Download do PDF",
    download.response.status === 200
  );

  check(
    "Content-Type PDF",
    (
      download.response.headers.get(
        "content-type"
      ) || ""
    ).includes("application/pdf")
  );

  check(
    "Arquivo PDF válido",
    Buffer.isBuffer(download.data) &&
      download.data.subarray(0, 5)
        .toString() === "%PDF-"
  );

  const pdfPath =
    `storage/certificates/SPRINT7-${validationCode}.pdf`;

  fs.writeFileSync(
    pdfPath,
    download.data
  );

  console.log(
    `✅ PDF salvo: ${pdfPath}`
  );

  // ----------------------------------------------------------
  // 12. Validação pública
  // ----------------------------------------------------------

  const validation = await request(
    `/certificates/validate/${validationCode}`
  );

  check(
    "Validação pública",
    validation.response.status === 200
  );

  check(
    "Código válido",
    validation.data.valid === true
  );

  check(
    "Nome retornado na validação",
    validation.data.certificate
      ?.participantName ===
      "Participante Sprint 7"
  );

  // ----------------------------------------------------------
  // 13. Código inválido
  // ----------------------------------------------------------

  const invalid = await request(
    "/certificates/validate/SIGE-CODIGO-INVALIDO"
  );

  check(
    "Código inválido rejeitado",
    invalid.response.status === 200 &&
      invalid.data.valid === false
  );

  // ----------------------------------------------------------
  // 14. Duplicidade
  // ----------------------------------------------------------

  const duplicate = await request(
    `/certificates/me/events/${eventId}`,
    {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    }
  );

  check(
    "Prevenção de duplicidade",
    (duplicate.response.status === 200 ||
      duplicate.response.status === 201) &&
      duplicate.data.alreadyExisted === true
  );

  console.log("");
  console.log("============================================================");
  console.log(" SPRINT 7 - TESTE E2E PASSOU");
  console.log("============================================================");
  console.log("");
  console.log(`Evento:      ${eventId}`);
  console.log(`Ação:        ${actionId}`);
  console.log(`Inscrição:   ${registrationId}`);
  console.log(`Certificado: ${certificateId}`);
  console.log(`Código:      ${validationCode}`);
  console.log(`PDF:         ${pdfPath}`);
  console.log("");

} catch (error) {

  console.log("");
  console.log("============================================================");
  console.log(" ❌ SPRINT 7 - TESTE E2E FALHOU");
  console.log("============================================================");
  console.log("");
  console.log(
    error?.stack ||
    error?.message ||
    error
  );

} finally {

  try {
    runSql(`
DELETE FROM "Certificate"
WHERE "id" = '${certificateId ?? ""}';

DELETE FROM "Registration"
WHERE "id" = '${registrationId ?? ""}';

DELETE FROM "Action"
WHERE "id" = '${actionId}';

DELETE FROM "Event"
WHERE "id" = '${eventId}';

DELETE FROM "User"
WHERE "id" = '${organizerId}';
`);

    console.log(
      "✅ Dados temporários removidos."
    );

  } catch (cleanupError) {

    console.log(
      "⚠️ Limpeza:",
      cleanupError?.message ||
      cleanupError
    );
  }
}




