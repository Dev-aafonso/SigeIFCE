/** Rotas públicas da SPA SIGE IFCE — sem decisão de autorização. */
export const MODULES = Object.freeze([
  "auth", "dashboard", "events", "registrations", "participants",
  "certificates", "reports", "users", "config",
]);
export const AUTH_COMPONENTS = Object.freeze(["login", "cadastro", "selecao-funcao"]);

const moduleSet = new Set(MODULES);
const authSet = new Set(AUTH_COMPONENTS);

export function normalizarModulo(value) {
  const name = String(value ?? "").trim().toLowerCase();
  return moduleSet.has(name) ? name : null;
}

export function normalizarComponenteAuth(value) {
  const name = String(value ?? "").trim().toLowerCase();
  return authSet.has(name) ? name : "login";
}

export function interpretarRota(hash = "", pathname = "/") {
  const fromHash = String(hash).replace(/^#\/?/, "").split("/").filter(Boolean);
  if (fromHash.length) {
    const module = normalizarModulo(fromHash[0]);
    if (!module) return { module: "auth", component: "login" };
    return { module, component: module === "auth" ? normalizarComponenteAuth(fromHash[1]) : null };
  }
  const fromPath = String(pathname).split("/").filter(Boolean);
  const module = normalizarModulo(fromPath[0]) ?? "auth";
  return { module, component: module === "auth" ? normalizarComponenteAuth(fromPath[1]) : null };
}

export function caminhoDaRota(route) {
  const module = normalizarModulo(route?.module) ?? "auth";
  const component = module === "auth" ? `/${normalizarComponenteAuth(route?.component)}` : "";
  return `/#/${module}${component}`;
}

export function chaveDaRota(route) {
  return caminhoDaRota(route);
}
