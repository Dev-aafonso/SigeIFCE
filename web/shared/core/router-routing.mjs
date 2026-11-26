/** Rotas públicas da SPA SIGE IFCE — sem decisão de autorização. */
export const MODULES = Object.freeze([
  "auth", "dashboard", "events", "registrations", "participants",
  "certificates", "reports", "users", "config",
]);
export const AUTH_COMPONENTS = Object.freeze(["login", "cadastro", "selecao-funcao"]);

const moduleSet = new Set(MODULES);
const authSet = new Set(AUTH_COMPONENTS);
// Portuguese UI routes are deliberately distinct from the JSON API endpoints.
export const MODULE_PATHS = Object.freeze({ dashboard: '/painel', events: '/eventos', registrations: '/inscricoes', participants: '/participantes', certificates: '/certificados', reports: '/relatorios', users: '/usuarios', config: '/configuracoes' });
export const AUTH_PATHS = Object.freeze({ login: '/entrar', cadastro: '/cadastro', 'selecao-funcao': '/escolher-perfil' });

export function normalizarModulo(value) {
  const name = String(value ?? "").trim().toLowerCase();
  return moduleSet.has(name) ? name : null;
}

export function normalizarComponenteAuth(value) {
  const name = String(value ?? "").trim().toLowerCase();
  return authSet.has(name) ? name : "login";
}

export function interpretarRota(hash = "", pathname = "/") {
  const fromHash = String(hash).startsWith('#/') ? String(hash).slice(2).split('/').filter(Boolean) : [];
  if (fromHash.length) {
    const module = normalizarModulo(fromHash[0]);
    if (!module) return { module: "auth", component: "login" };
    return { module, component: module === "auth" ? normalizarComponenteAuth(fromHash[1]) : null };
  }
  const clean = String(pathname).replace(/\/+$/, '') || '/';
  for (const [module, path] of Object.entries(MODULE_PATHS)) if (clean === path) return { module, component: null };
  for (const [component, path] of Object.entries(AUTH_PATHS)) if (clean === path) return { module: 'auth', component };
  const fromPath = clean.split("/").filter(Boolean);
  const module = normalizarModulo(fromPath[0]) ?? "auth";
  return { module, component: module === "auth" ? normalizarComponenteAuth(fromPath[1]) : null };
}

export function caminhoDaRota(route) {
  const module = normalizarModulo(route?.module) ?? "auth";
  return module === 'auth' ? AUTH_PATHS[normalizarComponenteAuth(route?.component)] : MODULE_PATHS[module];
}

export function chaveDaRota(route) {
  return caminhoDaRota(route);
}
