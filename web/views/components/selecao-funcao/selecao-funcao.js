window.selecionarFuncaoECadastrar = function(funcao) {
    sessionStorage.setItem('funcao_cadastro', funcao);
    window.carregarComponenteAuth('cadastro');
};