import { router } from "./router.js";

document.addEventListener("DOMContentLoaded", () => {
  const menuNavegacao = document.querySelector(".menu-navegacao");
  const alternadorBarraLateral = document.getElementById("alternador-barra-lateral");
  const painelFundoLateral = document.getElementById("painel-fundo-lateral");
  const barraLateral = document.getElementById("barra-lateral");
  const botaoTema = document.getElementById("botao-tema");

  let temaAtual = "light";
  try {
    const temaSalvo = localStorage.getItem("sige_theme");
    if (temaSalvo === "light" || temaSalvo === "dark") temaAtual = temaSalvo;
  } catch {}

  function aplicarTema(tema, salvar = false) {
    temaAtual = tema;
    document.documentElement.style.colorScheme = tema;
    document.documentElement.setAttribute("theme", tema);
    if (botaoTema) {
      botaoTema.setAttribute("aria-pressed", String(tema === "dark"));
      botaoTema.setAttribute(
        "aria-label",
        tema === "dark" ? "Ativar tema claro" : "Ativar tema escuro",
      );
    }
    if (salvar) {
      try {
        localStorage.setItem("sige_theme", tema);
      } catch {}
    }
  }

  aplicarTema(temaAtual);
  botaoTema?.addEventListener("click", () => {
    aplicarTema(temaAtual === "dark" ? "light" : "dark", true);
  });

  function fecharBarraLateral() {
    barraLateral?.classList.remove("abrir");
    painelFundoLateral?.classList.remove("mostrar");
    document.body.classList.remove("menu-lateral-aberto");
  }

  alternadorBarraLateral?.addEventListener("click", () => {
    const aberta = barraLateral?.classList.toggle("abrir") ?? false;
    painelFundoLateral?.classList.toggle("mostrar", aberta);
    document.body.classList.toggle("menu-lateral-aberto", aberta);
  });

  painelFundoLateral?.addEventListener("click", fecharBarraLateral);

  menuNavegacao?.addEventListener("click", (evento) => {
    const alvo = evento.target;
    if (!(alvo instanceof Element)) return;
    const botao = alvo.closest(".botao-menu");
    if (!botao || botao.hidden) return;

    evento.preventDefault();
    const modulo = botao.getAttribute("data-module");
    if (!modulo) return;

    history.pushState({ module: modulo }, "", `/#/${modulo}`);
    window.navegarParaModulo?.(modulo);
    fecharBarraLateral();
  });

  router.init();

  // O token permanece no cookie HttpOnly; nunca o lemos do localStorage.
  fetch("/auth/me", {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  })
    .then(async (resposta) => {
      if (!resposta.ok) return null;
      return resposta.json();
    })
    .then((usuario) => {
      if (!usuario || typeof usuario !== "object") return;

      const nome = usuario.name || usuario.nome || usuario.email || "Usuário";
      const cargo = String(usuario.role || "").toUpperCase();
      const papeis = {
        ADMIN: "Administrador",
        ORGANIZADOR: "Organizador",
        PROFESSOR: "Professor",
        ALUNO: "Aluno",
      };

      for (const id of ["nome-usuario", "nome-usuario-modal"]) {
        const elemento = document.getElementById(id);
        if (elemento) elemento.textContent = nome;
      }

      for (const id of ["cargo-usuario", "cargo-usuario-modal"]) {
        const elemento = document.getElementById(id);
        if (elemento && cargo) elemento.textContent = papeis[cargo] || "Usuário";
      }

      try {
        const usuarioAtualizado = {
          name: nome,
          email: usuario.email || "",
          role: cargo,
        };
        localStorage.setItem("sige_user", JSON.stringify(usuarioAtualizado));
        window.dispatchEvent(
          new CustomEvent("sige:user-updated", {
            detail: usuarioAtualizado,
          }),
        );
      } catch {}
    })
    .catch((erro) => {
      console.error("Não foi possível consultar a sessão atual.", erro);
    });
});