import { router } from "./router.js";
import { inicializarTema, definirPreferenciaTema, obterTemaEfetivo } from "./theme.js";

document.addEventListener("DOMContentLoaded", () => {
  const menuNavegacao = document.querySelector(".menu-navegacao");
  const alternadorBarraLateral = document.getElementById("alternador-barra-lateral");
  const painelFundoLateral = document.getElementById("painel-fundo-lateral");
  const barraLateral = document.getElementById("barra-lateral");
  const botaoTema = document.getElementById("botao-tema");

  // Uma única origem de verdade para o tema, inclusive para a tela Configurações.
  inicializarTema();
  if (botaoTema) {
    const escuro = obterTemaEfetivo() === "dark";
    botaoTema.setAttribute("aria-pressed", String(escuro));
    botaoTema.setAttribute("aria-label", escuro ? "Ativar tema claro" : "Ativar tema escuro");
  }
  botaoTema?.addEventListener("click", () => {
    const proximo = obterTemaEfetivo() === "dark" ? "light" : "dark";
    definirPreferenciaTema(proximo);
  });

  document.addEventListener("sige:theme-changed", (evento) => {
    if (!botaoTema) return;
    const escuro = evento.detail.theme === "dark";
    botaoTema.setAttribute("aria-pressed", String(escuro));
    botaoTema.setAttribute("aria-label", escuro ? "Ativar tema claro" : "Ativar tema escuro");
    botaoTema.setAttribute("title", escuro ? "Ativar tema claro" : "Ativar tema escuro");
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

    window.navegarParaModulo?.(modulo);
    fecharBarraLateral();
  });

  const botaoNotificacoes = document.getElementById("botao-notificacoes");
  const popoverNotificacoes = document.getElementById("popover-notificacoes");
  const listaNotificacoes = document.getElementById("notificacoes-lista");
  const statusNotificacoes = document.getElementById("notificacoes-status");
  async function carregarNotificacoes() {
    statusNotificacoes.textContent = "Carregando avisos...";
    try {
      const resposta = await fetch("/notifications", { credentials: "same-origin" });
      if (!resposta.ok) throw new Error();
      const avisos = await resposta.json();
      listaNotificacoes.replaceChildren();
      statusNotificacoes.textContent = avisos.length ? `${avisos.filter(item => !item.read).length} não lida(s)` : "Nenhuma notificação por enquanto.";
      for (const aviso of avisos) {
        const item = document.createElement("li");
        const texto = document.createElement("p"); texto.textContent = aviso.message;
        const data = document.createElement("time"); data.dateTime = aviso.date;
        data.textContent = new Date(aviso.date).toLocaleString("pt-BR");
        item.append(texto, data);
        if (!aviso.read) {
          const botao = document.createElement("button"); botao.type = "button"; botao.textContent = "Marcar como lida";
          botao.addEventListener("click", async () => {
            botao.disabled = true;
            try {
              const resposta = await fetch(`/notifications/${encodeURIComponent(aviso.key)}/read`, { method: "PATCH", credentials: "same-origin" });
              if (!resposta.ok) throw new Error();
              await carregarNotificacoes();
            } catch { statusNotificacoes.textContent = "Não foi possível marcar o aviso como lido."; botao.disabled = false; }
          });
          item.append(botao);
        }
        listaNotificacoes.append(item);
      }
    } catch { listaNotificacoes.replaceChildren(); statusNotificacoes.textContent = "Não foi possível carregar as notificações."; }
  }
  botaoNotificacoes?.addEventListener("click", () => {
    if (!popoverNotificacoes) return;
    popoverNotificacoes.togglePopover();
  });
  popoverNotificacoes?.addEventListener("toggle", event => {
    const aberto = event.newState === "open";
    botaoNotificacoes?.setAttribute("aria-expanded", String(aberto));
    if (aberto) carregarNotificacoes();
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