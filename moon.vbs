' ==============================================================================
' SCRIPT        : moon.vbs
' DESCRIÇÃO     : Orquestra a finalização de uma tarefa. Valida a integridade 
'                 da branch, constrói um commit semanticamente correto e envia
'                 o código para nuvem, abrindo o Pull Request automaticamente.
' AUTOR         : Carlos Natan
' DATA          : Setembro/2026
' VERSÃO        : 0.3
' ==============================================================================

' ------------------------------------------------------------------------------
' INICIALIZAÇÃO E CONTEXTO DE DIRETÓRIO
' ------------------------------------------------------------------------------
Set shell_windows = CreateObject("WScript.Shell")
Set sistema_arquivos = CreateObject("Scripting.FileSystemObject")

' NOTE: Força o VBScript a operar na mesma pasta de onde foi chamado.
' Isso previne bugs silenciosos onde comandos Git são executados na pasta System32.
diretorio_atual = sistema_arquivos.GetParentFolderName(WScript.ScriptFullName)
shell_windows.CurrentDirectory = diretorio_atual
arquivo_temporario_saida = diretorio_atual & "\sige_temp.txt"

' ------------------------------------------------------------------------------
' VERIFICAÇÃO DE IDENTIDADE DO DESENVOLVEDOR (ONBOARDING)
' ------------------------------------------------------------------------------
nome_usuario_git = ExecutarComandoRetornarSaida("git config --global user.name", arquivo_temporario_saida)
If nome_usuario_git = "" Then
    ' NOTE: A captura de identidade garante que todo código enviado tenha rastreabilidade.
    ' Facilita a vida do tech lead ao analisar o histórico de commits.
    novo_nome = InputBox("Qual o seu NOME COMPLETO para o Git?" & vbCrLf & "(Sera pedido apenas esta vez na sua maquina)", "Configuracao Git")
    If novo_nome = "" Then WScript.Quit
    shell_windows.Run "cmd /c git config --global user.name """ & novo_nome & """", 0, True
End If

email_usuario_git = ExecutarComandoRetornarSaida("git config --global user.email", arquivo_temporario_saida)
If email_usuario_git = "" Then
    novo_email = InputBox("Qual o seu E-MAIL para o Git?" & vbCrLf & "(Sera pedido apenas esta vez na sua maquina)", "Configuracao Git")
    If novo_email = "" Then WScript.Quit
    shell_windows.Run "cmd /c git config --global user.email """ & novo_email & """", 0, True
End If

' ------------------------------------------------------------------------------
' VALIDAÇÕES DE INTEGRIDADE E SEGURANÇA (PRE-COMMIT)
' ------------------------------------------------------------------------------
branch_atual = ExecutarComandoRetornarSaida("git rev-parse --abbrev-ref HEAD", arquivo_temporario_saida)

' XXX: Trava Crítica de Arquitetura. Bloqueia commits acidentais nas branches de produção.
' Todo código deve passar obrigatoriamente por um Pull Request antes de entrar aqui.
If branch_atual = "main" Or branch_atual = "master" Or branch_atual = "develop" Then
    MsgBox "BLOQUEADO: Nao e permitido salvar alteracoes diretamente na branch '" & branch_atual & "'!", 48, "Acesso Negado"
    If sistema_arquivos.FileExists(arquivo_temporario_saida) Then sistema_arquivos.DeleteFile(arquivo_temporario_saida)
    WScript.Quit
End If

status_repositorio = ExecutarComandoRetornarSaida("git status --porcelain", arquivo_temporario_saida)

' NOTE: Impede que o script rode a esteira inteira caso o desenvolvedor
' tenha esquecido de salvar o arquivo (Ctrl+S) no VS Code.
If status_repositorio = "" Then
    MsgBox "Nenhuma alteracao encontrada no projeto." & vbCrLf & vbCrLf & "Voce editou algo, mas esqueceu de salvar os arquivos no VS Code (Ctrl + S)?", 48, "Aviso"
    If sistema_arquivos.FileExists(arquivo_temporario_saida) Then sistema_arquivos.DeleteFile(arquivo_temporario_saida)
    WScript.Quit
End If

' ------------------------------------------------------------------------------
' PADRONIZAÇÃO DE MENSAGENS (CONVENTIONAL COMMITS)
' ------------------------------------------------------------------------------
texto_menu_commits = "Escolha o tipo de alteracao:" & vbCrLf & vbCrLf & _
                     "1 - feat (Nova funcionalidade)" & vbCrLf & _
                     "2 - fix (Correcao de erro)" & vbCrLf & _
                     "3 - refactor (Melhoria de codigo)" & vbCrLf & _
                     "4 - test (Testes automatizados)" & vbCrLf & _
                     "5 - docs (Documentacao)" & vbCrLf & _
                     "6 - chore (Manutencao/dependencias)"

opcao_tipo_commit = InputBox(texto_menu_commits, "Salvar e Enviar", "1")
If opcao_tipo_commit = "" Then 
    If sistema_arquivos.FileExists(arquivo_temporario_saida) Then sistema_arquivos.DeleteFile(arquivo_temporario_saida)
    WScript.Quit
End If

tipo_commit_padronizado = "feat"
If opcao_tipo_commit = "2" Then tipo_commit_padronizado = "fix"
If opcao_tipo_commit = "3" Then tipo_commit_padronizado = "refactor"
If opcao_tipo_commit = "4" Then tipo_commit_padronizado = "test"
If opcao_tipo_commit = "5" Then tipo_commit_padronizado = "docs"
If opcao_tipo_commit = "6" Then tipo_commit_padronizado = "chore"

' PAIR: O escopo e a descrição bem definidos ajudam o Kauã e o Victor a baterem
' o olho no log e entenderem o que foi mexido na lógica ou na infraestrutura.
escopo_alteracao = InputBox("Modulo/Escopo (Ex: web, mobile, auth) [Opcional - Pode deixar em branco]:", "Escopo")
descricao_alteracao = InputBox("O que foi feito? (Ex: cria componente de botao)", "Descricao")

If descricao_alteracao = "" Then
    MsgBox "A descricao e obrigatoria!", 16, "Erro"
    If sistema_arquivos.FileExists(arquivo_temporario_saida) Then sistema_arquivos.DeleteFile(arquivo_temporario_saida)
    WScript.Quit
End If

If escopo_alteracao = "" Then
    mensagem_commit_final = tipo_commit_padronizado & ": " & descricao_alteracao
Else
    mensagem_commit_final = tipo_commit_padronizado & "(" & escopo_alteracao & "): " & descricao_alteracao
End If

' ------------------------------------------------------------------------------
' ENVIO PARA NUVEM (PUSH)
' ------------------------------------------------------------------------------
shell_windows.Run "cmd /c git add -A", 0, True
resultado_commit = shell_windows.Run("cmd /c git commit -m """ & mensagem_commit_final & """", 0, True)

If resultado_commit <> 0 Then
    ' BUG: O commit pode falhar silenciosamente se o Git local estiver rodando 
    ' algum hook de validação pré-commit. Mantemos o alerta para rastreio.
    MsgBox "Falha ao registrar alteracoes (Commit vazio ou bloqueado). Nenhuma alteracao foi enviada.", 16, "Erro no Commit"
    If sistema_arquivos.FileExists(arquivo_temporario_saida) Then sistema_arquivos.DeleteFile(arquivo_temporario_saida)
    WScript.Quit
End If

resultado_envio = shell_windows.Run("cmd /c git push -u origin " & branch_atual, 0, True)

If resultado_envio <> 0 Then
    MsgBox "Falha ao enviar para o GitHub. Verifique sua conexao.", 16, "Erro no Push"
    If sistema_arquivos.FileExists(arquivo_temporario_saida) Then sistema_arquivos.DeleteFile(arquivo_temporario_saida)
    WScript.Quit
End If

' ------------------------------------------------------------------------------
' ABERTURA AUTOMÁTICA DE REVISÃO (PULL REQUEST)
' ------------------------------------------------------------------------------
url_remota_bruta = ExecutarComandoRetornarSaida("git config --get remote.origin.url", arquivo_temporario_saida)

' CHORE: Limpa os rastros do script na máquina do usuário antes de abrir o browser.
If sistema_arquivos.FileExists(arquivo_temporario_saida) Then sistema_arquivos.DeleteFile(arquivo_temporario_saida)

' FIXME: Esta substituição converte URLs SSH e HTTPS do Git para o formato web do GitHub.
' Se o projeto mudar para GitLab ou Bitbucket no futuro, esta lógica inteira quebrará.
url_web_repositorio = Replace(url_remota_bruta, "git@github.com:", "https://github.com/")
url_web_repositorio = Replace(url_web_repositorio, ".git", "")

' NOTE: Aponta sempre o PR da branch atual contra a branch `develop`.
url_pull_request = url_web_repositorio & "/compare/develop..." & branch_atual & "?expand=1"

shell_windows.Run url_pull_request

MsgBox "Alteracoes enviadas com sucesso!" & vbCrLf & "O navegador foi aberto para a criacao do Pull Request.", 64, "Sucesso"

' ==============================================================================
' FUNÇÕES AUXILIARES
' ==============================================================================
' Função    : ExecutarComandoRetornarSaida
' Descrição : Captura STDOUT de programas externos rodando invisivelmente.
' ==============================================================================
Function ExecutarComandoRetornarSaida(comando_terminal, caminho_arquivo_temporario)
    Set shell_interno = CreateObject("WScript.Shell")
    Set sistema_arquivos_interno = CreateObject("Scripting.FileSystemObject")
    
    ' HACK: Desvio obrigatório para arquivo local. O VBScript falha ao ler STDOUT direto da memória.
    shell_interno.Run "cmd /c " & comando_terminal & " > """ & caminho_arquivo_temporario & """", 0, True
    
    Set arquivo_leitura = sistema_arquivos_interno.OpenTextFile(caminho_arquivo_temporario, 1, True)
    If Not arquivo_leitura.AtEndOfStream Then
        texto_puro = arquivo_leitura.ReadAll()
        
        ' OPTIMIZE: Sanitização de saída. O prompt do Windows insere quebras 
        ' de linha fantasmas que corrompem nomes de variáveis e comparações IF.
        texto_puro = Replace(texto_puro, vbCr, "")
        texto_puro = Replace(texto_puro, vbLf, "")
        
        ExecutarComandoRetornarSaida = Trim(texto_puro)
    Else
        ExecutarComandoRetornarSaida = ""
    End If
    
    arquivo_leitura.Close
End Function