const PAPEIS_API = {
    gestor: 'ORGANIZADOR',
    professor: 'PROFESSOR',
    aluno: 'ALUNO'
};

function mensagemSelecao(texto, tipo = 'erro') {
    const area = document.querySelector('.envoltorio-selecao-funcao');
    if (!area) return;

    let mensagem = area.querySelector('.mensagem-selecao-funcao');
    if (!mensagem) {
        mensagem = document.createElement('p');
        mensagem.className = 'mensagem-selecao-funcao';
        mensagem.setAttribute('role', 'alert');
        mensagem.setAttribute('aria-live', 'polite');
        area.querySelector('.subtitulo-selecao-funcao')?.after(mensagem);
    }

    mensagem.textContent = texto;
    mensagem.dataset.tipo = tipo;
}

async function selecionarPapel(funcao, botao) {
    const papel = PAPEIS_API[funcao];
    if (!papel) {
        mensagemSelecao('A função selecionada não é válida.');
        return;
    }

    const token = localStorage.getItem('sige_access_token');
    if (!token) {
        sessionStorage.setItem('funcao_cadastro', funcao);
        window.carregarComponenteAuth('cadastro');
        return;
    }

    const textoOriginal = botao.textContent;
    botao.disabled = true;
    botao.setAttribute('aria-busy', 'true');
    botao.textContent = 'Salvando...';
    mensagemSelecao('Salvando sua função...', 'info');

    try {
        const response = await fetch('/users/me/role', {
            method: 'PATCH',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ role: papel })
        });
        const texto = await response.text();
        const contentType = response.headers.get('content-type') || '';
        let data = {};

        if (texto && contentType.includes('application/json')) {
            try {
                data = JSON.parse(texto);
            } catch {
                throw new Error('A API retornou uma resposta JSON inválida.');
            }
        } else if (texto) {
            data.message = new DOMParser().parseFromString(texto, 'text/html').body.textContent.trim();
        }

        if (!response.ok) {
            const detalhe = data.message || data.error || `Não foi possível salvar a função (HTTP ${response.status}).`;
            throw new Error(Array.isArray(detalhe) ? detalhe.join(' ') : detalhe);
        }

        let usuario = {};
        try {
            usuario = JSON.parse(localStorage.getItem('sige_user') || '{}');
        } catch (erro) {
            console.error('Não foi possível ler os dados locais do usuário.', erro);
        }
        usuario.role = data.role || papel;
        localStorage.setItem('sige_user', JSON.stringify(usuario));

        mensagemSelecao('Função salva. Abrindo o sistema...', 'sucesso');
        history.pushState({ module: 'dashboard' }, '', '/dashboard');
        if (window.navegarParaModulo) await window.navegarParaModulo('dashboard');
        else window.location.assign('/dashboard');
    } catch (erro) {
        const textoErro = erro instanceof TypeError
            ? 'Não foi possível conectar à API. Verifique sua conexão e tente novamente.'
            : erro.message || 'Não foi possível salvar sua função.';
        mensagemSelecao(textoErro);
        botao.disabled = false;
        botao.removeAttribute('aria-busy');
        botao.textContent = textoOriginal;
    }
}

window.selecionarFuncaoECadastrar = function(funcao, botao) {
    selecionarPapel(funcao, botao || document.activeElement);
};