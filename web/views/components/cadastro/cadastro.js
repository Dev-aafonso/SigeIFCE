import "../login/login.js";

document.addEventListener("sige:auth-component-loaded", (event) => {
  if (event.detail?.component !== "cadastro") return;
  const group = document.getElementById("grupo-codigo-gestor");
  const input = document.getElementById("codigo-gestor");
  let gestor = false;
  try { gestor = sessionStorage.getItem("funcao_cadastro") === "gestor"; } catch {}
  if (group) group.hidden = !gestor;
  if (input) input.required = gestor;
});
