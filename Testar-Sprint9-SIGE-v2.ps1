[CmdletBinding()]
param(
    [string]$BaseUrl = 'http://localhost:3000',
    [switch]$TestRateLimit
)

$ErrorActionPreference = 'Stop'
$BaseUrl = $BaseUrl.TrimEnd('/')
$results = New-Object 'System.Collections.Generic.List[object]'

function Add-Result {
    param(
        [string]$Name,
        [bool]$Passed,
        [string]$Details
    )

    $label = 'FALHOU'
    $color = 'Red'
    if ($Passed) {
        $label = 'PASSOU'
        $color = 'Green'
    }

    $results.Add([pscustomobject]@{
        Teste = $Name
        Status = $label
        Detalhes = $Details
    }) | Out-Null

    Write-Host ('[{0}] {1} - {2}' -f $label, $Name, $Details) -ForegroundColor $color
}

function Invoke-Probe {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [string]$Method = 'GET',
        [hashtable]$Headers = $null,
        [string]$Body = $null
    )

    $uri = $script:BaseUrl + $Path
    $params = @{
        Uri = $uri
        Method = $Method
        UseBasicParsing = $true
        TimeoutSec = 10
        ErrorAction = 'Stop'
    }

    if ($null -ne $Headers -and $Headers.Count -gt 0) {
        $params.Headers = $Headers
    }
    # Não envie Body vazio implicitamente: no Windows PowerShell 5.1, um
    # parâmetro [string] default $null pode ser coercido para ''. Se isso for
    # enviado num GET, Invoke-WebRequest pode falhar antes de receber HTTP.
    if ($PSBoundParameters.ContainsKey('Body') -and -not [string]::IsNullOrEmpty($Body)) {
        $params.ContentType = 'application/json; charset=utf-8'
        $params.Body = $Body
    }

    try {
        $r = Invoke-WebRequest @params
        return [pscustomobject]@{
            Status = [int]$r.StatusCode
            Headers = $r.Headers
            Content = [string]$r.Content
            Error = $null
        }
    }
    catch {
        $status = 0
        $headersOut = $null
        $content = ''
        $exceptionMessage = $_.Exception.Message
        try {
            $response = $_.Exception.Response
            if ($null -ne $response) {
                $status = [int]$response.StatusCode
                $headersOut = $response.Headers
            }
        }
        catch {
            # Preserve the original request error.
        }

        return [pscustomobject]@{
            Status = $status
            Headers = $headersOut
            Content = $content
            Error = $exceptionMessage
        }
    }
}

function Get-ProbeDetails {
    param($Probe)
    if ($Probe.Status -eq 0 -and $Probe.Error) {
        return ('HTTP 0; erro local: {0}' -f $Probe.Error)
    }
    return ('HTTP {0}' -f $Probe.Status)
}

Write-Host '============================================================' -ForegroundColor Cyan
Write-Host 'SIGE IFCE - TESTES DE SEGURANCA DA SPRINT 9' -ForegroundColor Cyan
Write-Host ('Base: {0}' -f $BaseUrl)
Write-Host 'Login probes use fictional credentials; no records should be created or changed.'
Write-Host '============================================================' -ForegroundColor Cyan

$root = Invoke-Probe -Path '/'
Add-Result -Name 'Pagina inicial responde' -Passed ($root.Status -eq 200) -Details (Get-ProbeDetails $root)

$staticItems = @(
    @{ Name = 'Dashboard HTML acessivel'; Path = '/web/views/modules/Dashboard/dashboard.html' },
    @{ Name = 'Relatorios HTML acessivel'; Path = '/web/views/modules/reports/reports.html' },
    @{ Name = 'JavaScript Sprint 8 acessivel'; Path = '/js/sprint8.js' },
    @{ Name = 'CSS Sprint 8 acessivel'; Path = '/css/sprint8.css' }
)
foreach ($item in $staticItems) {
    $r = Invoke-Probe -Path $item.Path
    Add-Result -Name $item.Name -Passed ($r.Status -eq 200) -Details (Get-ProbeDetails $r)
}

$privateItems = @(
    @{ Name = 'package.json nao e publico'; Path = '/package.json' },
    @{ Name = 'Codigo TypeScript nao e publico'; Path = '/src/main.ts' },
    @{ Name = 'Schema Prisma nao e publico'; Path = '/prisma/schema.prisma' },
    @{ Name = 'Diretorio storage nao e publico'; Path = '/storage/test-output/' }
)
foreach ($item in $privateItems) {
    $r = Invoke-Probe -Path $item.Path
    $passed = @(403, 404) -contains $r.Status
    Add-Result -Name $item.Name -Passed $passed -Details (Get-ProbeDetails $r)
}

$h = Invoke-Probe -Path '/'
foreach ($header in @('X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Content-Security-Policy')) {
    $value = $null
    if ($null -ne $h.Headers) {
        $value = $h.Headers[$header]
    }
    $passed = -not [string]::IsNullOrWhiteSpace([string]$value)
    $details = 'ausente'
    if ($passed) { $details = [string]$value }
    elseif ($h.Status -eq 0 -and $h.Error) { $details = ('nao foi possivel obter cabecalho: {0}' -f $h.Error) }
    Add-Result -Name ("Cabecalho {0}" -f $header) -Passed $passed -Details $details
}

$allowedCors = Invoke-Probe -Path '/auth/login' -Method 'OPTIONS' -Headers @{
    Origin = 'http://localhost:3000'
    'Access-Control-Request-Method' = 'POST'
    'Access-Control-Request-Headers' = 'content-type'
}
$allowedCorsOrigin = $null
if ($null -ne $allowedCors.Headers) {
    $allowedCorsOrigin = $allowedCors.Headers['Access-Control-Allow-Origin']
}
$allowedCorsPass = ([string]$allowedCorsOrigin -eq 'http://localhost:3000')
$allowedCorsDetails = 'Access-Control-Allow-Origin ausente'
if ($allowedCorsOrigin) { $allowedCorsDetails = [string]$allowedCorsOrigin }
Add-Result -Name 'CORS aceita origem local confiavel' -Passed $allowedCorsPass -Details $allowedCorsDetails

$blockedCors = Invoke-Probe -Path '/auth/login' -Method 'OPTIONS' -Headers @{
    Origin = 'https://sprint9-evil.invalid'
    'Access-Control-Request-Method' = 'POST'
    'Access-Control-Request-Headers' = 'content-type'
}
$blockedCorsOrigin = $null
if ($null -ne $blockedCors.Headers) {
    $blockedCorsOrigin = $blockedCors.Headers['Access-Control-Allow-Origin']
}
$blockedCorsPass = [string]::IsNullOrWhiteSpace([string]$blockedCorsOrigin)
$blockedCorsDetails = 'origem nao autorizada'
if ($blockedCorsOrigin) { $blockedCorsDetails = [string]$blockedCorsOrigin }
Add-Result -Name 'CORS nao autoriza origem arbitraria' -Passed $blockedCorsPass -Details $blockedCorsDetails

$evilHeaders = @{
    Origin = 'https://sprint9-evil.invalid'
    'Sec-Fetch-Site' = 'cross-site'
}
$csrf = Invoke-Probe -Path '/auth/logout' -Method 'POST' -Headers $evilHeaders -Body '{}'
Add-Result -Name 'CSRF bloqueia POST cross-site' -Passed ($csrf.Status -eq 403) -Details (Get-ProbeDetails $csrf)

$noAuth = Invoke-Probe -Path '/presences/actions/sprint9-probe/participants'
Add-Result -Name 'Consulta de presencas exige autenticacao' -Passed ($noAuth.Status -eq 401) -Details (Get-ProbeDetails $noAuth)

if ($TestRateLimit) {
    # Executar somente quando for desejável retestar a limitação: pode acionar
    # o bloqueio temporário do IP por até 60 segundos.
    $rateStatuses = @()
    for ($i = 1; $i -le 6; $i++) {
        $payload = @{ email = 'sprint9-invalid-probe@example.com'; password = 'IncorrectProbePassword123!' } | ConvertTo-Json -Compress
        $r = Invoke-Probe -Path '/auth/login' -Method 'POST' -Body $payload
        $rateStatuses += $r.Status
        if ($r.Status -eq 429) { break }
    }
    $ratePassed = $rateStatuses -contains 429
    Add-Result -Name 'Rate limiting do login' -Passed $ratePassed -Details ("Status observados: {0}" -f ($rateStatuses -join ', '))
} else {
    Write-Host '[IGNORADO] Rate limiting: ja observado como funcional na bateria anterior. Use -TestRateLimit para repetir.' -ForegroundColor Yellow
}

Write-Host "`n================ RESUMO ================" -ForegroundColor Cyan
$results | Format-Table -AutoSize
$passedCount = @($results | Where-Object { $_.Status -eq 'PASSOU' }).Count
$failedCount = @($results | Where-Object { $_.Status -eq 'FALHOU' }).Count
Write-Host ("PASSOU: {0} | FALHOU: {1}" -f $passedCount, $failedCount) -ForegroundColor Cyan
$reportPath = Join-Path $env:TEMP ('SIGE-Sprint9-Seguranca-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.csv')
$results | Export-Csv -Path $reportPath -NoTypeInformation -Encoding UTF8
Write-Host ("Relatorio: {0}" -f $reportPath) -ForegroundColor Cyan
if ($failedCount -gt 0) {
    $global:LASTEXITCODE = 1
} else {
    $global:LASTEXITCODE = 0
}
Write-Host ("Codigo de resultado: {0}" -f $global:LASTEXITCODE)
