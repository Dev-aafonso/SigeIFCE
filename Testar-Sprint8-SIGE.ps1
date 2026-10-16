[CmdletBinding()]
param(
    [string]$BaseUrl = 'http://localhost:3000',
    [string]$OutputDirectory = (Join-Path $env:TEMP 'SIGE-Sprint8-Testes')
)

$ErrorActionPreference = 'Stop'
$BaseUrl = $BaseUrl.TrimEnd('/')
$results = New-Object 'System.Collections.Generic.List[object]'

function Add-TestResult {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][ValidateSet('PASSOU','FALHOU','PENDENTE','AVISO')][string]$Status,
        [string]$Details = ''
    )
    $script:results.Add([pscustomobject]@{
        Teste = $Name
        Status = $Status
        Detalhes = $Details
    })
    $color = switch ($Status) {
        'PASSOU' { 'Green' }
        'FALHOU' { 'Red' }
        'PENDENTE' { 'Yellow' }
        default { 'Cyan' }
    }
    Write-Host ('[{0}] {1}{2}' -f $Status, $Name, $(if ($Details) { " — $Details" } else { '' })) -ForegroundColor $color
}

function Get-ResponseStatusCode {
    param($Response)
    if ($null -eq $Response) { return 0 }
    try { return [int]$Response.StatusCode } catch {}
    try { return [int]$Response.StatusCode.value__ } catch {}
    return 0
}

function Invoke-SigeRequest {
    param(
        [Parameter(Mandatory)][string]$Path,
        [ValidateSet('GET','POST')][string]$Method = 'GET',
        [Microsoft.PowerShell.Commands.WebRequestSession]$WebSession,
        $Body,
        [string]$OutFile
    )

    $uri = $script:BaseUrl + $Path


    # Download binário: captura o status HTTP real e preserva os bytes.
    if ($OutFile) {
        $request = [System.Net.HttpWebRequest]::Create($uri)
        $request.Method = $Method
        $request.Timeout = 20000
        $request.ReadWriteTimeout = 20000

        if ($null -ne $WebSession) {
            $request.CookieContainer = $WebSession.Cookies
        } else {
            $request.CookieContainer = New-Object System.Net.CookieContainer
        }

        try {
            $response = $request.GetResponse()
            try {
                $stream = $response.GetResponseStream()
                try {
                    $fileStream = [System.IO.File]::Create($OutFile)
                    try {
                        $stream.CopyTo($fileStream)
                    } finally {
                        $fileStream.Dispose()
                    }
                } finally {
                    $stream.Dispose()
                }

                return [pscustomobject]@{
                    StatusCode = [int]$response.StatusCode
                    Content = ''
                    Headers = $response.Headers
                    Error = $null
                    Uri = $uri
                }
            } finally {
                $response.Close()
            }
        } catch [System.Net.WebException] {
            $erro = $_.Exception
            $respostaErro = $erro.Response
            $status = Get-ResponseStatusCode $respostaErro
            $conteudoErro = ''

            if ($null -ne $respostaErro) {
                try {
                    $streamErro = $respostaErro.GetResponseStream()
                    if ($null -ne $streamErro) {
                        $reader = New-Object System.IO.StreamReader($streamErro)
                        try {
                            $conteudoErro = $reader.ReadToEnd()
                        } finally {
                            $reader.Dispose()
                        }
                    }
                } catch {
                    # Mantém o erro HTTP original.
                } finally {
                    $respostaErro.Close()
                }
            }

            return [pscustomobject]@{
                StatusCode = $status
                Content = $conteudoErro
                Headers = $(if ($null -ne $respostaErro) {
                    $respostaErro.Headers
                } else {
                    $null
                })
                Error = $erro.Message
                Uri = $uri
            }
        } catch {
            return [pscustomobject]@{
                StatusCode = 0
                Content = ''
                Headers = $null
                Error = $_.Exception.Message
                Uri = $uri
            }
        }
    }


    $params = @{
        Uri = $uri
        Method = $Method
        UseBasicParsing = $true
        TimeoutSec = 20
        ErrorAction = 'Stop'
    }
    if ($null -ne $WebSession) { $params.WebSession = $WebSession }
    if ($null -ne $Body) {
        $params.ContentType = 'application/json; charset=utf-8'
        $params.Body = ($Body | ConvertTo-Json -Depth 10 -Compress)
    }

    try {
        $response = Invoke-WebRequest @params
        $content = ''
        if (-not $OutFile -and $null -ne $response.Content) { $content = [string]$response.Content }
        return [pscustomobject]@{
            StatusCode = (Get-ResponseStatusCode $response)
            Content = $content
            Headers = $response.Headers
            Error = $null
            Uri = $uri
        }
    }
    catch {
        $response = $_.Exception.Response
        $status = Get-ResponseStatusCode $response
        $content = ''
        if ($null -ne $response) {
            try {
                $stream = $response.GetResponseStream()
                if ($null -ne $stream) {
                    $reader = New-Object System.IO.StreamReader($stream)
                    $content = $reader.ReadToEnd()
                    $reader.Dispose()
                }
            } catch {}
        }
        return [pscustomobject]@{
            StatusCode = $status
            Content = $content
            Headers = $(if ($null -ne $response) { $response.Headers } else { $null })
            Error = $_.Exception.Message
            Uri = $uri
        }
    }
}

function Test-ExpectedStatus {
    param(
        [string]$Name,
        $Result,
        [int[]]$Expected,
        [string]$SuccessDetails = ''
    )
    if ($Expected -contains [int]$Result.StatusCode) {
        Add-TestResult -Name $Name -Status 'PASSOU' -Details $(if ($SuccessDetails) { $SuccessDetails } else { "HTTP $($Result.StatusCode)" })
        return $true
    }
    $detail = "Esperado HTTP $($Expected -join ' ou '), recebido HTTP $($Result.StatusCode)"
    if ($Result.Error) { $detail += "; $($Result.Error)" }
    if ($Result.Content) { $detail += "; resposta: $($Result.Content -replace '\s+',' ' | Select-Object -First 1)" }
    Add-TestResult -Name $Name -Status 'FALHOU' -Details $detail
    return $false
}

function Test-JsonEndpoint {
    param(
        [string]$Name,
        [string]$Path,
        [Microsoft.PowerShell.Commands.WebRequestSession]$WebSession,
        [int[]]$ExpectedStatus = @(200)
    )
    $response = Invoke-SigeRequest -Path $Path -WebSession $WebSession
    if (-not (Test-ExpectedStatus -Name $Name -Result $response -Expected $ExpectedStatus)) { return $null }
    if ($response.StatusCode -ne 200) { return $null }
    try {
        $payload = $response.Content | ConvertFrom-Json -ErrorAction Stop
        if ($null -eq $payload) { throw 'A resposta JSON está vazia.' }
        Add-TestResult -Name "$Name — JSON válido" -Status 'PASSOU'
        return $payload
    }
    catch {
        Add-TestResult -Name "$Name — JSON válido" -Status 'FALHOU' -Details $_.Exception.Message
        return $null
    }
}

Write-Host ''
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ' SIGE IFCE — BATERIA DE TESTES FUNCIONAIS DA SPRINT 8' -ForegroundColor Cyan
Write-Host " Base: $BaseUrl" -ForegroundColor Cyan
Write-Host ' Testes somente de leitura; não são criados nem alterados registros.' -ForegroundColor Cyan
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ''

# 1) Verifica se o processo responde.
$root = Invoke-SigeRequest -Path '/'
if (-not (Test-ExpectedStatus -Name 'Servidor e página inicial' -Result $root -Expected @(200))) {
    Add-TestResult -Name 'Continuação dos testes' -Status 'PENDENTE' -Details 'Inicie a aplicação com npm run start:dev e execute este script novamente.'
    $results | Format-Table -AutoSize
    exit 2
}

# 2) Arquivos estáticos e telas da Sprint 8.
$staticPaths = @(
    @{ Name = 'JavaScript Sprint 8'; Path = '/js/sprint8.js' },
    @{ Name = 'CSS Sprint 8'; Path = '/css/sprint8.css' },
    @{ Name = 'HTML do dashboard'; Path = '/web/views/modules/Dashboard/dashboard.html' },
    @{ Name = 'HTML de relatórios'; Path = '/web/views/modules/reports/reports.html' }
)
foreach ($item in $staticPaths) {
    $r = Invoke-SigeRequest -Path $item.Path
    Test-ExpectedStatus -Name $item.Name -Result $r -Expected @(200) | Out-Null
    if ($r.StatusCode -eq 200 -and $item.Path -eq '/js/sprint8.js' -and $r.Content.Length -lt 100) {
        Add-TestResult -Name 'Conteúdo do JavaScript Sprint 8' -Status 'FALHOU' -Details 'O arquivo respondeu 200, mas parece vazio/incompleto.'
    }
}

# 3) Os endpoints administrativos devem exigir autenticação.
$protectedPaths = @(
    @{ Name = 'Dashboard sem autenticação'; Path = '/dashboard/overview' },
    @{ Name = 'Catálogo de relatórios sem autenticação'; Path = '/reports' },
    @{ Name = 'Exportação sem autenticação'; Path = '/reports/events/export?format=csv' }
)
foreach ($item in $protectedPaths) {
    $r = Invoke-SigeRequest -Path $item.Path
    Test-ExpectedStatus -Name $item.Name -Result $r -Expected @(401,403) -SuccessDetails "Acesso negado corretamente (HTTP $($r.StatusCode))" | Out-Null
}

# 4) Login real opcional, para testar endpoints autorizados e exportações.
Write-Host ''
Write-Host 'Para testar dashboard, relatórios, filtros e exportações, informe uma conta existente.' -ForegroundColor Cyan
$email = Read-Host 'E-mail da conta (Enter para pular testes autenticados)'
if ([string]::IsNullOrWhiteSpace($email)) {
    Add-TestResult -Name 'Testes autenticados e exportações' -Status 'PENDENTE' -Details 'O usuário optou por pular o login interativo.'
} else {
    $securePassword = Read-Host 'Senha (entrada oculta)' -AsSecureString
    $bstr = [IntPtr]::Zero
    $password = $null
    try {
        $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
        $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
        $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
        $loginBody = @{ email = $email.Trim(); password = $password }
        $login = Invoke-SigeRequest -Path '/auth/login' -Method POST -WebSession $session -Body $loginBody

        if (-not (Test-ExpectedStatus -Name 'Login com conta existente' -Result $login -Expected @(200,201))) {
            Add-TestResult -Name 'Endpoints autenticados' -Status 'PENDENTE' -Details 'Login não concluído; verifique e-mail/senha e tente novamente.'
        } else {
            try { $user = $login.Content | ConvertFrom-Json -ErrorAction Stop }
            catch { $user = $null }
            $role = if ($user -and $user.role) { [string]$user.role } else { 'DESCONHECIDO' }
            Add-TestResult -Name 'Identificação do perfil após login' -Status $(if ($role -ne 'DESCONHECIDO') { 'PASSOU' } else { 'AVISO' }) -Details "Perfil: $role"

            $cookies = $session.Cookies.GetCookies([Uri]($script:BaseUrl + '/'))
            $authCookie = $false
            foreach ($cookie in $cookies) { if ($cookie.Name -eq 'access_token' -and -not [string]::IsNullOrWhiteSpace($cookie.Value)) { $authCookie = $true } }
            if ($authCookie) {
                Add-TestResult -Name 'Cookie de sessão access_token' -Status 'PASSOU' -Details 'Cookie presente na sessão HTTP; valor não será exibido.'
            } else {
                Add-TestResult -Name 'Cookie de sessão access_token' -Status 'FALHOU' -Details 'O login respondeu, mas o cookie de sessão access_token esperado não foi encontrado.'
            }

            if ($role -in @('ADMIN','ORGANIZADOR')) {
                $dashboardPaths = @(
                    @{ Name='Dashboard overview autenticado'; Path='/dashboard/overview' },
                    @{ Name='Filtros do dashboard'; Path='/dashboard/filters' },
                    @{ Name='Indicadores por evento'; Path='/dashboard/events' },
                    @{ Name='Indicadores por ação'; Path='/dashboard/actions' }
                )
                foreach ($item in $dashboardPaths) {
                    Test-JsonEndpoint -Name $item.Name -Path $item.Path -WebSession $session | Out-Null
                }

                $catalog = Test-JsonEndpoint -Name 'Catálogo de relatórios autenticado' -Path '/reports' -WebSession $session
                foreach ($type in @('events','registrations','attendance','certificates')) {
                    Test-JsonEndpoint -Name "Relatório JSON: $type" -Path "/reports/$type" -WebSession $session | Out-Null
                }

                # Filtro de intervalo invertido precisa ser recusado (HTTP 400).
                $badDateQuery = '?startDateFrom=2026-12-31&startDateTo=2026-01-01'
                $badDashboard = Invoke-SigeRequest -Path ("/dashboard/overview" + $badDateQuery) -WebSession $session
                Test-ExpectedStatus -Name 'Validação de intervalo de datas no dashboard' -Result $badDashboard -Expected @(400) | Out-Null
                $badReport = Invoke-SigeRequest -Path ("/reports/events" + $badDateQuery) -WebSession $session
                Test-ExpectedStatus -Name 'Validação de intervalo de datas nos relatórios' -Result $badReport -Expected @(400) | Out-Null

                # Exporta todas as categorias em PDF e CSV e confere assinatura/conteúdo.
                New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
                foreach ($type in @('events','registrations','attendance','certificates')) {
                    foreach ($format in @('csv','pdf')) {
                        $file = Join-Path $OutputDirectory "sige-ifce-$type-test.$format"
                        Remove-Item $file -Force -ErrorAction SilentlyContinue
                        $path = "/reports/$type/export?format=$format"
                        $download = Invoke-SigeRequest -Path $path -WebSession $session -OutFile $file
                        if (Test-ExpectedStatus -Name "Exportação $type ($($format.ToUpper()))" -Result $download -Expected @(200)) {
                            if (-not (Test-Path $file) -or (Get-Item $file).Length -eq 0) {
                                Add-TestResult -Name "Arquivo exportado $type ($format)" -Status 'FALHOU' -Details 'Arquivo ausente ou vazio.'
                                continue
                            }
                            $bytes = [System.IO.File]::ReadAllBytes($file)
                            if ($format -eq 'pdf') {
                                $signature = [System.Text.Encoding]::ASCII.GetString($bytes, 0, [Math]::Min(5, $bytes.Length))
                                if ($signature -eq '%PDF-') {
                                    Add-TestResult -Name "Integridade básica PDF: $type" -Status 'PASSOU' -Details "$($bytes.Length) bytes; assinatura PDF reconhecida."
                                } else {
                                    Add-TestResult -Name "Integridade básica PDF: $type" -Status 'FALHOU' -Details 'Arquivo não começa com %PDF-.'
                                }
                            } else {
                                $csvText = [System.Text.Encoding]::UTF8.GetString($bytes)
                                if ($csvText.Trim().Length -gt 0 -and $csvText -match '[;\r\n]') {
                                    Add-TestResult -Name "Integridade básica CSV: $type" -Status 'PASSOU' -Details "$($bytes.Length) bytes; conteúdo tabular detectado."
                                } else {
                                    Add-TestResult -Name "Integridade básica CSV: $type" -Status 'FALHOU' -Details 'CSV vazio ou sem separadores/linhas esperados.'
                                }
                            }
                        }
                    }
                }
                Add-TestResult -Name 'Arquivos de exportação para inspeção' -Status 'AVISO' -Details "Gerados em: $OutputDirectory"
            } else {
                # Para ALUNO/PROFESSOR, confirmar que a API proíbe os endpoints de gestão.
                $denied = Invoke-SigeRequest -Path '/dashboard/overview' -WebSession $session
                Test-ExpectedStatus -Name 'Perfil não administrativo bloqueado no dashboard' -Result $denied -Expected @(403) -SuccessDetails 'Acesso administrativo negado (HTTP 403)' | Out-Null
                $deniedReport = Invoke-SigeRequest -Path '/reports' -WebSession $session
                Test-ExpectedStatus -Name 'Perfil não administrativo bloqueado nos relatórios' -Result $deniedReport -Expected @(403) -SuccessDetails 'Acesso a relatórios negado (HTTP 403)' | Out-Null
                Add-TestResult -Name 'Testes de dados e exportações administrativos' -Status 'PENDENTE' -Details 'A conta não é ADMIN/ORGANIZADOR; use um perfil autorizado para validar as consultas e exportações.'
            }
        }
    }
    finally {
        if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
        $password = $null
        $loginBody = $null
        $securePassword = $null
    }
}

Write-Host ''
Write-Host '==================== RESUMO ====================' -ForegroundColor Cyan
$results | Format-Table -Wrap -AutoSize
$passed = @($results | Where-Object Status -eq 'PASSOU').Count
$failed = @($results | Where-Object Status -eq 'FALHOU').Count
$pending = @($results | Where-Object Status -eq 'PENDENTE').Count
$warnings = @($results | Where-Object Status -eq 'AVISO').Count
Write-Host "PASSOU: $passed | FALHOU: $failed | PENDENTE: $pending | AVISOS: $warnings" -ForegroundColor Cyan

$reportPath = Join-Path $env:TEMP ('SIGE-Sprint8-Resultado-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.csv')
$results | Export-Csv -Path $reportPath -NoTypeInformation -Encoding UTF8
Write-Host "Relatório de testes: $reportPath" -ForegroundColor Cyan
if ($failed -gt 0) { $global:LASTEXITCODE = 1 }
elseif ($pending -gt 0) { $global:LASTEXITCODE = 2 }
else { $global:LASTEXITCODE = 0 }
Write-Host "Codigo de resultado: $global:LASTEXITCODE (0=sucesso, 1=falhas, 2=testes pendentes)" -ForegroundColor Cyan
