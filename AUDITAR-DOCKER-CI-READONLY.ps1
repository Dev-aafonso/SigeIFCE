$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\Afonso\SIGEIFCE\SigeIFCE'
Set-Location $repo
Write-Host '=== BRANCH / GIT ==='
$branch = (git branch --show-current).Trim()
if ($branch -ne 'feature/modernizacao-ui-figma') { throw "Branch inesperada: $branch" }
git status -sb
Write-Host '=== INTEGRIDADE ==='
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'git diff --check falhou' }
Write-Host '=== DOCKER ==='
if (Get-Command docker -ErrorAction SilentlyContinue) {
  docker version --format '{{.Client.Version}}'
  if ($LASTEXITCODE -ne 0) { Write-Warning 'Docker Desktop nao esta funcional' }
} else { Write-Warning 'Docker nao instalado: teste de infraestrutura pendente' }
Write-Host '=== CONFIGURACOES NAO-SENSIVEIS ==='
Select-String -Path 'Dockerfile','.github/workflows/ci.yml','docker-compose.yml' -Pattern 'node:|node-version:|APP_URL:|COOKIE_SECURE:|prisma migrate|image: postgres' | ForEach-Object { Write-Host "$($_.Path):$($_.LineNumber): $($_.Line.Trim())" }
Write-Host '=== CONTAGEM DE TESTES / REQUISITOS ==='
Get-ChildItem src -Recurse -Filter '*.spec.ts' | Measure-Object | Select-Object Count
Write-Host '[OK] Coleta local somente leitura. Nenhum deploy, dump ou migracao executado.'
