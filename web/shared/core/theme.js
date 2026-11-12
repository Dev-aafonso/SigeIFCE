/** SIGE IFCE — preferência visual compartilhada (não armazena credenciais). */
const KEY = "sige_theme";
const VALUES = new Set(["light", "dark", "auto"]);
const media = window.matchMedia?.("(prefers-color-scheme: dark)");
let inicializado = false;

export function obterPreferenciaTema() {
  try {
    const value = localStorage.getItem(KEY);
    return VALUES.has(value) ? value : "auto";
  } catch { return "auto"; }
}

export function obterTemaEfetivo() {
  const preference = obterPreferenciaTema();
  return preference === "auto" ? (media?.matches ? "dark" : "light") : preference;
}

function publicarTema() {
  const theme = obterTemaEfetivo();
  document.documentElement.setAttribute("theme", theme);
  document.documentElement.dataset.themePreference = obterPreferenciaTema();
  document.documentElement.style.colorScheme = theme;
  document.dispatchEvent(new CustomEvent("sige:theme-changed", {
    detail: { theme, preference: obterPreferenciaTema() },
  }));
}

export function definirPreferenciaTema(preference) {
  if (!VALUES.has(preference)) throw new TypeError("Preferência de tema inválida");
  try { localStorage.setItem(KEY, preference); } catch {}
  publicarTema();
}

export function inicializarTema() {
  if (inicializado) return;
  inicializado = true;
  publicarTema();
  const onChange = () => {
    if (obterPreferenciaTema() === "auto") publicarTema();
  };
  if (media?.addEventListener) media.addEventListener("change", onChange);
  else media?.addListener?.(onChange);
  window.addEventListener("storage", (event) => {
    if (event.key === KEY) publicarTema();
  });
}
