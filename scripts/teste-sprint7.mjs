console.log("============================================================");
console.log(" SIGE IFCE - TESTE SPRINT 7");
console.log("============================================================");

const BASE = "http://localhost:3000";

try {
  const response = await fetch(BASE);

  if (response.status === 200) {
    console.log("✅ Servidor HTTP: OK");
  } else {
    console.log("❌ Servidor respondeu:", response.status);
    process.exit(1);
  }

  const stamp = Date.now();
  const email = `sprint7.${stamp}@sige.ifce`;
  const password = "Teste@123456";

  const register = await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: "Participante Sprint 7",
      email,
      password,
      passwordConfirmation: password
    })
  });

  console.log(`✅ Cadastro: ${register.status}`);

  if (register.status !== 201) {
    console.log(await register.text());
    process.exit(1);
  }

  let cookie = "";

  if (typeof register.headers.getSetCookie === "function") {
    cookie = register.headers
      .getSetCookie()
      .map(x => x.split(";")[0])
      .join("; ");
  }

  if (!cookie) {
    const login = await fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        password
      })
    });

    console.log(`✅ Login: ${login.status}`);

    if (typeof login.headers.getSetCookie === "function") {
      cookie = login.headers
        .getSetCookie()
        .map(x => x.split(";")[0])
        .join("; ");
    }
  }

  if (!cookie) {
    console.log("❌ Cookie de autenticação não encontrado.");
    process.exit(1);
  }

  console.log("✅ Autenticação: OK");

  const me = await fetch(`${BASE}/auth/me`, {
    headers: {
      Cookie: cookie
    }
  });

  console.log(`✅ /auth/me: ${me.status}`);

  const certificates = await fetch(`${BASE}/certificates/me`, {
    headers: {
      Cookie: cookie
    }
  });

  console.log(`✅ /certificates/me: ${certificates.status}`);

  if (certificates.status === 200) {
    const data = await certificates.json();
    console.log(
      `✅ Consulta de certificados funcionando. Quantidade: ${
        Array.isArray(data) ? data.length : "N/A"
      }`
    );
  } else {
    console.log(await certificates.text());
  }

  console.log("");
  console.log("============================================================");
  console.log(" TESTE BASE DA SPRINT 7 CONCLUÍDO");
  console.log("============================================================");

} catch (error) {
  console.log("");
  console.log("❌ ERRO:");
  console.log(error.message);
}
