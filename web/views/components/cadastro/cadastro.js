import "../login/login.js";

document.addEventListener("sige:auth-component-loaded", (event) => {
  if (event.detail?.component !== "cadastro") return;
  const group = document.getElementById("grupo-codigo-gestor");
  const input = document.getElementById("codigo-gestor");
  let role;
  try { role = sessionStorage.getItem("funcao_cadastro"); } catch {}
  const protectedRole = role === "professor" || role === "gestor";
  if (!group || !input) return;
  group.hidden = !protectedRole;
  input.required = protectedRole;
  input.disabled = !protectedRole;
  if (protectedRole) group.querySelector("label").textContent = `Código de acesso de ${role} *`;
});
