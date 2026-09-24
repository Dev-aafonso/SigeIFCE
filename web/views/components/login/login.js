window.alternarSenha = function(botao) {
    const input = botao?.previousElementSibling;
    if (!input) return;
    const ehSenha = input.type === 'password';
    
    input.type = ehSenha ? 'text' : 'password';
    botao.style.opacity = ehSenha ? '1' : '0.5';
};

window.realizarLogin = function(evento) {
    evento.preventDefault();
    history.pushState({ module: 'dashboard' }, "", `/dashboard`);
    window.navegarParaModulo('dashboard');
};