// A API valida o código do perfil escolhido no cadastro.
const PAPEIS_CADASTRO = new Set(['gestor', 'professor', 'aluno']);
document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const botao = event.target.closest('[data-select-role]');
  if (!botao || !botao.closest('.envoltorio-selecao-funcao')) return;
  const funcao = botao.dataset.selectRole;
  if (!PAPEIS_CADASTRO.has(funcao)) return;
  try { sessionStorage.setItem('funcao_cadastro', funcao); } catch {}
  window.carregarComponenteAuth?.('cadastro');
});
