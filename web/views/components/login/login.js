window.alternarSenha = function (botao) {
    const input = botao?.previousElementSibling;
    if (!input) return;

    const ehSenha = input.type === 'password';
    input.type = ehSenha ? 'text' : 'password';
    botao.style.opacity = ehSenha ? '1' : '0.5';
};

window.realizarLogin = async function (evento) {
    evento.preventDefault();

    const formulario = evento.currentTarget || evento.target;
    const email = formulario.querySelector('#email-login')?.value?.trim();
    const password = formulario.querySelector('#senha-login')?.value;
    const botao = formulario.querySelector('button[type="submit"]');

    let feedback = formulario.querySelector('#sprint8-login-feedback');
    if (!feedback) {
        feedback = document.createElement('p');
        feedback.id = 'sprint8-login-feedback';
        feedback.setAttribute('role', 'status');
        feedback.setAttribute('aria-live', 'polite');
        feedback.style.marginTop = '12px';
        formulario.appendChild(feedback);
    }

    const mostrarMensagem = (mensagem, erro = false) => {
        feedback.textContent = mensagem;
        feedback.style.color = erro ? '#B42318' : '#267343';
        feedback.setAttribute('role', erro ? 'alert' : 'status');
    };

    if (!email || !password) {
        mostrarMensagem('Informe seu e-mail e sua senha.', true);
        return;
    }

    if (botao) {
        botao.disabled = true;
        botao.setAttribute('aria-busy', 'true');
    }
    mostrarMensagem('Validando suas credenciais...');

    try {
        const resposta = await fetch('/auth/login', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const texto = await resposta.text();
        let dados = {};
        if (texto) {
            try { dados = JSON.parse(texto); }
            catch { throw new Error('O servidor retornou uma resposta inesperada.'); }
        }

        if (!resposta.ok) {
            const mensagem = Array.isArray(dados.message)
                ? dados.message.join(' ')
                : (dados.message || 'NÃ£o foi possÃ­vel realizar o login. Verifique suas credenciais.');
            throw new Error(mensagem);
        }

        const papel = String(dados.role || '').toUpperCase();
        const destino = ['ADMIN', 'ORGANIZADOR'].includes(papel) ? 'dashboard' : 'events';
        history.pushState({ module: destino }, '', `/#/${destino}`);
        mostrarMensagem('Login realizado com sucesso.');

        if (typeof window.navegarParaModulo === 'function') {
            window.navegarParaModulo(destino);
        } else {
            window.location.assign(`/#/${destino}`);
        }
    } catch (erro) {
        mostrarMensagem(erro instanceof Error ? erro.message : 'Falha ao realizar login.', true);
    } finally {
        if (botao) {
            botao.disabled = false;
            botao.removeAttribute('aria-busy');
        }
    }
};