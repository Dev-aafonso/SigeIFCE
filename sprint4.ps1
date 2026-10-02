#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$ProjectRoot = 'C:\Users\Afonso\SIGEIFCE\SigeIFCE',
    [switch]$ApplyMigration
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Nesta versão, o caminho do projeto é explícito para evitar falhas de descoberta.
# O valor padrão corresponde ao caminho informado no ambiente do SIGE IFCE.
if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    throw 'ProjectRoot não pode ser vazio.'
}

try {
    $rootItem = Get-Item -LiteralPath $ProjectRoot -ErrorAction Stop
    if (-not $rootItem.PSIsContainer) {
        throw "ProjectRoot não é uma pasta: $ProjectRoot"
    }
    $Root = $rootItem.FullName
} catch {
    throw "A pasta do projeto não foi encontrada: $ProjectRoot"
}

$packageFile = Join-Path $Root 'package.json'
if (-not (Test-Path -LiteralPath $packageFile -PathType Leaf)) {
    throw "A pasta informada não parece ser a raiz do SIGE IFCE porque package.json não foi encontrado: $Root"
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = Join-Path $Root ".sprint4-backup\BACK-4-FIX-$stamp"
$logPath = Join-Path $Root ".sprint4-backup\SPRINT4-$stamp.log"

function Ensure-Dir([string]$Path) {
    if ([string]::IsNullOrWhiteSpace($Path)) { return }
    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

function Write-Utf8NoBom([string]$Path, [string]$Content) {
    if ([string]::IsNullOrWhiteSpace($Path)) {
        throw 'Caminho de escrita vazio.'
    }

    $parent = Split-Path -Parent $Path
    if ($parent) {
        Ensure-Dir $parent
    }

    [IO.File]::WriteAllText(
        $Path,
        $Content,
        (New-Object System.Text.UTF8Encoding($false))
    )
}

function Clean-BadNestedArtifacts {
    $badPaths = @(
        (Join-Path $Root 'src/modules/actions/actions'),
        (Join-Path $Root 'src/modules/events/events'),
        (Join-Path $Root 'src/generated/prisma/prisma'),
        (Join-Path $Root 'prisma/migrations/migrations')
    )

    foreach ($badPath in $badPaths) {
        if (Test-Path -LiteralPath $badPath) {
            Write-Host "`n[>] Removendo artefato duplicado: $badPath" -ForegroundColor Yellow
            Remove-Item -LiteralPath $badPath -Recurse -Force
        }
    }
}

function Backup-Path([string]$Path) {
    if ([string]::IsNullOrWhiteSpace($Path)) { return }
    if (-not (Test-Path -LiteralPath $Path)) { return }

    $item = Get-Item -LiteralPath $Path -ErrorAction Stop
    if (-not $item) { return }

    $fullPath = $item.FullName
    $rootPrefix = $Root.TrimEnd('\','/') + '\'
    $rel = $fullPath.Substring($rootPrefix.Length).TrimStart('\','/')
    $dest = Join-Path $backup $rel

    if ($item.PSIsContainer) {
        Ensure-Dir $dest
        Copy-Item -LiteralPath $fullPath -Destination $dest -Recurse -Force
    } else {
        $destParent = Split-Path -Parent $dest
        if (-not [string]::IsNullOrWhiteSpace($destParent)) {
            Ensure-Dir $destParent
        }

        Copy-Item -LiteralPath $fullPath -Destination $dest -Force
    }
}

function Run-Step(
    [string]$Exe,
    [string[]]$Arguments,
    [string]$Label
) {
    Write-Host "`n[>] $Label" -ForegroundColor Cyan
    Write-Host ("    Comando: {0} {1}" -f $Exe, ($Arguments -join ' ')) -ForegroundColor DarkGray

    & $Exe @Arguments
    $exitCode = $LASTEXITCODE

    if ($exitCode -ne 0) {
        throw "$Label falhou (exit code $exitCode)."
    }
}

# No Windows, usamos explicitamente npm.cmd/npx.cmd para evitar que os shims .ps1
# abram um shell interativo inesperado. O parâmetro de argumentos usa o nome
# $Arguments porque $args é uma variável automática do PowerShell.
function Assert-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Comando obrigatório não encontrado no PATH: $Name"
    }
}

function Get-DotEnvValue([string]$Path, [string]$Name) {
    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }

    $lines = Get-Content -LiteralPath $Path

    foreach ($line in $lines) {
        if ($line -match "^\s*$([regex]::Escape($Name))\s*=\s*(.*)\s*$") {
            $value = $Matches[1].Trim()

            if (($value.StartsWith('"')) -and
                ($value.EndsWith('"')) -and
                ($value.Length -ge 2)) {
                return $value.Substring(1, $value.Length - 2)
            }

            if (($value.StartsWith("'")) -and
                ($value.EndsWith("'")) -and
                ($value.Length -ge 2)) {
                return $value.Substring(1, $value.Length - 2)
            }

            return $value
        }
    }

    return $null
}

function Assert-PrismaEnvironment {
    $configPath = Join-Path $Root 'prisma.config.ts'
    $envPath = Join-Path $Root '.env'

    $config = Get-Content -LiteralPath $configPath -Raw

    if ($config -notmatch 'DATABASE_URL') {
        throw 'prisma.config.ts não referencia DATABASE_URL. Corrija a configuração do Prisma antes da Sprint 4.'
    }

    $databaseUrl = [Environment]::GetEnvironmentVariable(
        'DATABASE_URL',
        'Process'
    )

    if ([string]::IsNullOrWhiteSpace($databaseUrl)) {
        $databaseUrl = Get-DotEnvValue -Path $envPath -Name 'DATABASE_URL'
    }

    if ([string]::IsNullOrWhiteSpace($databaseUrl)) {
        throw 'DATABASE_URL não foi encontrada no ambiente nem no arquivo .env.'
    }

    $databaseUrl = $databaseUrl.Trim()

    if ($databaseUrl -notmatch '^postgres(ql)?://') {
        throw 'DATABASE_URL inválida para a Sprint 4. Use uma URL PostgreSQL iniciando com postgresql:// ou postgres://.'
    }
}

function Ensure-JestTypes {
    Write-Host "`n[>] Verificando dependências de teste Jest + ESM..." -ForegroundColor Cyan

    & 'npm.cmd' 'install' '--save-dev' 'jest@^30.0.0' '@types/jest@^30.0.0' 'ts-jest@^29.4.14' '@jest/globals@^30.0.0'
    $exitCode = $LASTEXITCODE

    if ($exitCode -ne 0) {
        throw "Não foi possível instalar as dependências Jest (exit code $exitCode)."
    }
}

function Ensure-NestBuildConfig([string]$Path) {
    $config = @'
{
  "extends": "./tsconfig.json",
  "exclude": [
    "node_modules",
    "test",
    "dist",
    "**/*.spec.ts",
    "**/*.test.ts"
  ]
}
'@

    Write-Utf8NoBom $Path $config
}

function Ensure-JestTestConfig {
    $tsConfigPath = Join-Path $Root 'tsconfig.spec.json'
    $jestConfigPath = Join-Path $Root 'jest.sprint4.config.cjs'

    $tsConfig = @'
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": ".",
    "module": "ES2022",
    "target": "ES2022",
    "moduleResolution": "Bundler",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "types": ["node", "jest"],
    "isolatedModules": true
  },
  "include": ["src/**/*.ts"],
  "exclude": [
    "node_modules",
    "dist",
    ".sprint4-backup",
    ".sprint4-recovery"
  ]
}
'@

    Write-Utf8NoBom $tsConfigPath $tsConfig

    $jestConfig = @'
module.exports = {
  rootDir: __dirname,
  roots: ["<rootDir>/src"],
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  testMatch: ["**/*.spec.ts"],
  moduleFileExtensions: ["js", "json", "ts", "mjs"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: "<rootDir>/tsconfig.spec.json"
      }
    ]
  },
  modulePathIgnorePatterns: [
    "<rootDir>/.sprint4-backup/",
    "<rootDir>/.sprint4-recovery/",
    "<rootDir>/src/modules/actions/actions/",
    "<rootDir>/src/modules/events/events/",
    "<rootDir>/prisma/migrations/migrations/",
    "<rootDir>/src/generated/prisma/prisma/"
  ],
  testPathIgnorePatterns: [
    "<rootDir>/.sprint4-backup/",
    "<rootDir>/.sprint4-recovery/",
    "<rootDir>/src/modules/actions/actions/",
    "<rootDir>/src/modules/events/events/"
  ],
  watchPathIgnorePatterns: [
    "<rootDir>/.sprint4-backup/",
    "<rootDir>/.sprint4-recovery/"
  ]
};
'@

    Write-Utf8NoBom $jestConfigPath $jestConfig

    $env:NODE_OPTIONS = '--experimental-vm-modules'

    Write-Host '[OK] tsconfig.spec.json configurado com rootDir = . .' -ForegroundColor Green
    Write-Host '[OK] jest.sprint4.config.cjs configurado para ESM.' -ForegroundColor Green
}

function Regenerate-PrismaClient {
    $generatedPath = Join-Path $Root 'src/generated/prisma'

    if (Test-Path -LiteralPath $generatedPath) {
        Write-Host "`n[>] Removendo Prisma Client antigo para evitar geração obsoleta..." -ForegroundColor Cyan
        Remove-Item -LiteralPath $generatedPath -Recurse -Force
    }

    Run-Step 'npx.cmd' @(
        'prisma',
        'validate',
        '--schema',
        'prisma/schema.prisma'
    ) 'Validando schema Prisma da Sprint 4...'

    Run-Step 'npx.cmd' @(
        'prisma',
        'generate',
        '--schema',
        'prisma/schema.prisma',
        '--require-models'
    ) 'Gerando Prisma Client da Sprint 4...'

    $clientPath = Join-Path $generatedPath 'client.ts'
    $enumsPath = Join-Path $generatedPath 'enums.ts'

    if (-not (Test-Path -LiteralPath $clientPath)) {
        throw 'Prisma Client não foi gerado: src/generated/prisma/client.ts não encontrado.'
    }

    if (-not (Test-Path -LiteralPath $enumsPath)) {
        throw 'Prisma Client não foi gerado: src/generated/prisma/enums.ts não encontrado.'
    }

    $client = Get-Content -LiteralPath $clientPath -Raw
    $enums = Get-Content -LiteralPath $enumsPath -Raw

    foreach ($symbol in @(
        'EventStatus',
        'ActionStatus',
        'UserRole'
    )) {
        if ($enums -notmatch "\b$([regex]::Escape($symbol))\b") {
            throw "O Prisma Client gerado não contém o enum $symbol em enums.ts."
        }
    }

    foreach ($model in @(
        'User',
        'Event',
        'Action'
    )) {
        $modelPath = Join-Path $generatedPath ("models\$model.ts")

        if (-not (Test-Path -LiteralPath $modelPath -PathType Leaf)) {
            throw "O Prisma Client gerado não contém o model $model em models\$model.ts. Verifique o schema.prisma."
        }
    }

    Write-Host '[OK] Prisma Client contém User, Event, Action e os enums da Sprint 4.' -ForegroundColor Green
}

function Restore-Backup {
    if (-not (Test-Path -LiteralPath $backup)) {
        return
    }

    Write-Host 'Restaurando arquivos alterados pela Sprint 4...' -ForegroundColor Yellow

    # Remove primeiro artefatos gerados/modificados que podem impedir a restauração.
    # Isso é especialmente importante para src/generated/prisma, pois o Prisma
    # recusa gerar sobre uma pasta parcialmente preenchida.
    $generatedTarget = Join-Path $Root 'src/generated/prisma'

    if (Test-Path -LiteralPath $generatedTarget) {
        Remove-Item -LiteralPath $generatedTarget -Recurse -Force -ErrorAction SilentlyContinue
    }

    $items = Get-ChildItem -LiteralPath $backup -Force -Recurse |
        Sort-Object FullName

    foreach ($item in $items) {
        $relative = $item.FullName.Substring(
            $backup.Length
        ).TrimStart('\','/')

        if ([string]::IsNullOrWhiteSpace($relative)) {
            continue
        }

        if ($relative -like '__*') {
            continue
        }

        # Artefatos gerados/duplicados não devem voltar do backup.
        if ($relative -like 'src\generated\prisma\*') {
            continue
        }
        if ($relative -like 'src\modules\actions\actions\*') {
            continue
        }
        if ($relative -like 'src\modules\events\events\*') {
            continue
        }
        if ($relative -like 'prisma\migrations\migrations\*') {
            continue
        }

        $target = Join-Path $Root $relative

        if ($item.PSIsContainer) {
            Ensure-Dir $target
        } else {
            $parent = Split-Path -Parent $target

            if ($parent) {
                Ensure-Dir $parent
            }

            Copy-Item -LiteralPath $item.FullName -Destination $target -Force
        }
    }
}

function Invoke-DatabasePreflight([bool]$NeedsUserRoleNullFix) {
    $sqlPath = Join-Path $backup '__sprint4-db-preflight.sql'

    $roleFix = ''

    if ($NeedsUserRoleNullFix) {
        $roleFix = @'
  IF to_regclass('"User"') IS NOT NULL THEN
    UPDATE "User" SET "role" = 'ALUNO' WHERE "role" IS NULL;
  END IF;
'@
    }

    $sql = @'
DO $$
DECLARE
  event_count BIGINT := 0;
  action_count BIGINT := 0;
BEGIN
__ROLE_FIX__
  IF to_regclass('"Event"') IS NOT NULL THEN
    SELECT COUNT(*) INTO event_count FROM "Event";
    IF event_count > 0 THEN
      RAISE EXCEPTION 'A tabela "Event" já possui % registro(s). A migration da Sprint 4 precisa partir de uma tabela Event vazia.', event_count;
    END IF;
  END IF;

  IF to_regclass('"Action"') IS NOT NULL THEN
    SELECT COUNT(*) INTO action_count FROM "Action";
    IF action_count > 0 THEN
      RAISE EXCEPTION 'A tabela "Action" já possui % registro(s). A migration da Sprint 4 precisa partir de uma tabela Action vazia.', action_count;
    END IF;
  END IF;
END $$;
'@

    $sql = $sql.Replace('__ROLE_FIX__', $roleFix)
    Write-Utf8NoBom $sqlPath $sql

    try {
        Run-Step 'npx.cmd' @(
            'prisma',
            'db',
            'execute',
            '--file',
            $sqlPath
        ) 'Executando pré-verificação segura do banco...'
    }
    finally {
        if (Test-Path -LiteralPath $sqlPath) {
            Remove-Item -LiteralPath $sqlPath -Force -ErrorAction SilentlyContinue
        }
    }
}

function Ensure-MainValidationPipe([string]$Path) {
    $main = Get-Content -LiteralPath $Path -Raw

    if ($main -notmatch '\bValidationPipe\b') {
        $main = "import { ValidationPipe } from '@nestjs/common';`r`n" + $main
    }

    if ($main -notmatch 'useGlobalPipes\s*\(') {
        $lines = $main -split "`r?`n", -1
        $insertAt = -1

        for ($i = 0; $i -lt $lines.Count; $i++) {
            if ($lines[$i] -match 'NestFactory\.create\s*\(') {
                $insertAt = $i + 1
                break
            }
        }

        if ($insertAt -lt 0) {
            throw 'Não foi possível localizar NestFactory.create(...) em src/main.ts.'
        }

        $pipeLine = '  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));'

        $before = if ($insertAt -gt 0) {
            @($lines[0..($insertAt - 1)])
        } else {
            @()
        }

        $after = if ($insertAt -lt $lines.Count) {
            @($lines[$insertAt..($lines.Count - 1)])
        } else {
            @()
        }

        $main = (@($before + $pipeLine + $after) -join "`r`n")
    }

    Write-Utf8NoBom $Path $main
}

$MigrationApplied = $false

# Mantém um log mesmo se o terminal do VS Code for encerrado pelo processo.
try {
    Ensure-Dir (Split-Path -Parent $logPath)

    try {
        Start-Transcript -Path $logPath -Force | Out-Null
    } catch {
    }
} catch {
}

try {
    Write-Host "============================================================" -ForegroundColor White
    Write-Host " SIGE IFCE - SPRINT 4 - EVENTOS E AÇÕES" -ForegroundColor White
    Write-Host "============================================================" -ForegroundColor White

    Set-Location -LiteralPath $Root

    Assert-Command 'node'
    Assert-Command 'npm.cmd'
    Assert-Command 'npx.cmd'

    $packagePath = Join-Path $Root 'package.json'
    $schemaPath = Join-Path $Root 'prisma/schema.prisma'
    $configPath = Join-Path $Root 'prisma.config.ts'
    $mainPath = Join-Path $Root 'src/main.ts'

    $required = @(
        'package.json',
        'prisma/schema.prisma',
        'prisma.config.ts',
        'src/app.module.ts',
        'src/main.ts',
        'src/database/prisma.module.ts',
        'src/database/prisma.service.ts',
        'src/common/guards/jwt-auth.guard.ts',
        'src/common/guards/roles.guard.ts',
        'src/modules/auth/auth.module.ts',
        'src/modules/users/users.module.ts'
    )

    foreach ($item in $required) {
        if (-not (Test-Path -LiteralPath (Join-Path $Root $item))) {
            throw "Arquivo obrigatório não encontrado: $item"
        }
    }

    $package = Get-Content -LiteralPath $packagePath -Raw
    $oldSchema = Get-Content -LiteralPath $schemaPath -Raw

    if ($oldSchema -notmatch 'provider\s*=\s*"postgresql"') {
        throw 'O schema atual não está configurado para PostgreSQL. A Sprint 4 deste script exige PostgreSQL.'
    }

    if ($oldSchema -notmatch '(?m)^\s*model\s+User\s*\{') {
        throw 'O model User não foi encontrado no schema atual.'
    }

    Assert-PrismaEnvironment

    # Verifica o Git, mas não bloqueia a Sprint 4 por existir trabalho local.
    # O script faz backup dos arquivos que serão alterados logo abaixo.
    # Isso permite executar a Sprint 4 mesmo com alterações locais, sem
    # exigir commit/stash previamente.
    if (Test-Path -LiteralPath (Join-Path $Root '.git')) {
        $gitStatusRaw = & git -C $Root status --porcelain --untracked-files=all

        if ($LASTEXITCODE -ne 0) {
            throw 'Não foi possível verificar o estado do Git.'
        }

        $gitChanges = @(
            $gitStatusRaw | Where-Object {
                $line = ([string]$_).TrimEnd()

                if ([string]::IsNullOrWhiteSpace($line)) {
                    return $false
                }

                # Ignora os artefatos criados pelo próprio script.
                if ($line -match '^..\s+sprint4\.ps1$') {
                    return $false
                }

                if ($line -match '^..\s+\.sprint4-backup([\\/].*)?$') {
                    return $false
                }

                return $true
            }
        )

        if ($gitChanges.Count -gt 0) {
            Ensure-Dir $backup

            Write-Utf8NoBom (
                Join-Path $backup '__git-status-before-sprint4.txt'
            ) ($gitChanges -join "`r`n")

            Write-Host "`n[!] O working tree possui alterações locais." -ForegroundColor Yellow
            Write-Host '    A Sprint 4 continuará porque os arquivos afetados serão copiados para o backup.' -ForegroundColor Yellow
            Write-Host '    Alterações detectadas:' -ForegroundColor Yellow

            $gitChanges | ForEach-Object {
                Write-Host "      $_" -ForegroundColor Yellow
            }
        } else {
            Write-Host "`n[OK] Working tree sem alterações relevantes." -ForegroundColor Green
        }
    }

    # Se houver migration, testa conexão/histórico antes de modificar código.
    if ($ApplyMigration) {
        Run-Step 'npx.cmd' @(
            'prisma',
            'migrate',
            'status'
        ) 'Verificando conexão e estado das migrations antes da Sprint 4...'
    }

    Ensure-Dir $backup

    # Remove somente árvores claramente produzidas de forma recursiva pelos
    # scripts anteriores. Os diretórios oficiais de primeiro nível são preservados.
    Clean-BadNestedArtifacts

    # Backup dos arquivos existentes que serão alterados/substituídos.
    Backup-Path $packagePath
    Backup-Path (Join-Path $Root 'package-lock.json')
    Backup-Path $schemaPath
    Backup-Path (Join-Path $Root 'src/app.module.ts')
    Backup-Path $mainPath
    Backup-Path (Join-Path $Root 'tsconfig.build.json')
    Backup-Path (Join-Path $Root 'src/generated/prisma')
    Backup-Path (Join-Path $Root 'src/common/guards/jwt-auth.guard.ts')
    Backup-Path (Join-Path $Root 'src/common/guards/roles.guard.ts')
    Backup-Path (Join-Path $Root 'src/common/decorators/roles.decorator.ts')
    Backup-Path (Join-Path $Root 'src/common/decorators/public.decorator.ts')
    Backup-Path (Join-Path $Root 'src/modules/events')
    Backup-Path (Join-Path $Root 'src/modules/actions')
    Backup-Path (Join-Path $Root 'prisma/migrations')

    # ---------------------------------------------------------
    # 1) Prisma schema
    # ---------------------------------------------------------
    $schema = @'
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

enum UserRole {
  ADMIN
  ORGANIZADOR
  PROFESSOR
  ALUNO
}

enum EventStatus {
  RASCUNHO
  PUBLICADO
  ENCERRADO
  CANCELADO
}

enum ActionStatus {
  ATIVA
  ENCERRADA
  CANCELADA
}

model User {
  id       String   @id @default(cuid())
  email    String   @unique
  password String
  role     UserRole @default(ALUNO)

  events   Event[]
}

model Event {
  id          String      @id @default(cuid())
  title       String
  description String
  startDate   DateTime
  endDate     DateTime
  location    String?
  status      EventStatus @default(RASCUNHO)
  publishedAt DateTime?
  canceledAt  DateTime?
  closedAt    DateTime?
  organizerId String
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  organizer User     @relation(fields: [organizerId], references: [id])
  actions   Action[]

  @@index([organizerId])
  @@index([status])
  @@index([startDate])
  @@index([endDate])
  @@index([title])
}

model Action {
  id              String       @id @default(cuid())
  eventId         String
  title           String
  description     String
  startDate       DateTime
  endDate         DateTime
  durationMinutes Int
  capacity        Int
  location        String?
  status          ActionStatus @default(ATIVA)
  canceledAt      DateTime?
  closedAt        DateTime?
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)

  @@index([eventId])
  @@index([status])
  @@index([startDate])
}
'@

    Write-Utf8NoBom $schemaPath $schema

    # ---------------------------------------------------------
    # 2) Decorators + JWT guard
    # ---------------------------------------------------------
    $decorators = Join-Path $Root 'src/common/decorators'
    Ensure-Dir $decorators

    Write-Utf8NoBom (
        Join-Path $decorators 'public.decorator.ts'
    ) @'
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
'@

    Write-Utf8NoBom (
        Join-Path $decorators 'roles.decorator.ts'
    ) @'
import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../generated/prisma/enums';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
'@

    Write-Utf8NoBom (
        Join-Path $Root 'src/common/guards/jwt-auth.guard.ts'
    ) @'
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const token =
      request.cookies?.access_token ??
      request.cookies?.token ??
      this.extractBearerToken(request.headers?.authorization);

    if (!token) {
      throw new UnauthorizedException('Token não informado.');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token);
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado.');
    }
  }

  private extractBearerToken(authorization?: string): string | undefined {
    if (!authorization?.startsWith('Bearer ')) return undefined;
    return authorization.slice(7).trim() || undefined;
  }
}
'@

    # ---------------------------------------------------------
    # 3) AppModule
    # ---------------------------------------------------------
    Write-Utf8NoBom (
        Join-Path $Root 'src/app.module.ts'
    ) @'
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { RolesGuard } from './common/guards/roles.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PrismaModule } from './database/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { EventsModule } from './modules/events/events.module';
import { ActionsModule } from './modules/actions/actions.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    EventsModule,
    ActionsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
'@

    # ---------------------------------------------------------
    # 4) Events module
    # ---------------------------------------------------------
    $events = Join-Path $Root 'src/modules/events'
    $eventDto = Join-Path $events 'dto'
    Ensure-Dir $eventDto

    Write-Utf8NoBom (
        Join-Path $eventDto 'create-event.dto.ts'
    ) @'
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(5000)
  description!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;
}
'@

    Write-Utf8NoBom (
        Join-Path $eventDto 'update-event.dto.ts'
    ) @'
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateEventDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;
}
'@

    Write-Utf8NoBom (
        Join-Path $eventDto 'event-query.dto.ts'
    ) @'
import { Type } from 'class-transformer';
import { EventStatus } from '../../../generated/prisma/enums';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class EventQueryDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsDateString()
  startDateFrom?: string;

  @IsOptional()
  @IsDateString()
  startDateTo?: string;

  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  page = 1;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
'@

    Write-Utf8NoBom (
        Join-Path $events 'events.service.ts'
    ) @'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActionStatus,
  EventStatus,
  UserRole,
} from '../../generated/prisma/enums';
import { PrismaService } from '../../database/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventQueryDto } from './dto/event-query.dto';

type AuthUser = { id?: string; sub?: string; role: UserRole };

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  private userId(user: AuthUser): string {
    const id = user.sub ?? user.id;

    if (!id) {
      throw new ForbiddenException('Usuário autenticado sem identificador.');
    }

    return id;
  }

  private manager(user: AuthUser) {
    if (
      user.role !== UserRole.ADMIN &&
      user.role !== UserRole.ORGANIZADOR
    ) {
      throw new ForbiddenException(
        'Apenas ADMIN ou ORGANIZADOR podem gerenciar eventos.',
      );
    }
  }

  private validateDates(start: Date, end: Date) {
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime())
    ) {
      throw new BadRequestException('Datas inválidas.');
    }

    if (end <= start) {
      throw new BadRequestException(
        'A data de término deve ser posterior à data de início.',
      );
    }
  }

  private parseDate(
    value: string | undefined,
    field: string,
  ): Date | undefined {
    if (!value) return undefined;

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${field} inválida.`);
    }

    return date;
  }

  private async get(id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: {
        organizer: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
        actions: {
          orderBy: {
            startDate: 'asc',
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Evento não encontrado.');
    }

    return event;
  }

  private scope(
    event: { organizerId: string },
    user: AuthUser,
  ) {
    if (user.role === UserRole.ADMIN) return;

    if (event.organizerId !== this.userId(user)) {
      throw new ForbiddenException(
        'Você não possui acesso a este evento.',
      );
    }
  }

  async create(
    dto: CreateEventDto,
    user: AuthUser,
  ) {
    this.manager(user);

    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);

    this.validateDates(start, end);

    return this.prisma.event.create({
      data: {
        title: dto.title.trim(),
        description: dto.description.trim(),
        startDate: start,
        endDate: end,
        location: dto.location?.trim() || null,
        organizerId: this.userId(user),
      },
      include: {
        actions: true,
      },
    });
  }

  async findPublic(query: EventQueryDto) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    if (page < 1 || limit < 1 || limit > 100) {
      throw new BadRequestException('Paginação inválida.');
    }

    if (
      query.status &&
      query.status !== EventStatus.PUBLICADO
    ) {
      throw new BadRequestException(
        'A consulta pública aceita somente o status PUBLICADO.',
      );
    }

    const from = this.parseDate(
      query.startDateFrom,
      'startDateFrom',
    );

    const to = this.parseDate(
      query.startDateTo,
      'startDateTo',
    );

    if (from && to && to < from) {
      throw new BadRequestException(
        'startDateTo deve ser posterior ou igual a startDateFrom.',
      );
    }

    const where: any = {
      status: EventStatus.PUBLICADO,
    };

    if (query.title?.trim()) {
      where.title = {
        contains: query.title.trim(),
        mode: 'insensitive',
      };
    }

    if (from || to) {
      where.startDate = {};

      if (from) {
        where.startDate.gte = from;
      }

      if (to) {
        where.startDate.lte = to;
      }
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.event.findMany({
        where,
        orderBy: {
          startDate: 'asc',
        },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          organizer: {
            select: {
              id: true,
              email: true,
            },
          },
          actions: {
            where: {
              status: {
                not: ActionStatus.CANCELADA,
              },
            },
            orderBy: {
              startDate: 'asc',
            },
          },
        },
      }),
      this.prisma.event.count({
        where,
      }),
    ]);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async findPublicById(id: string) {
    const event = await this.prisma.event.findFirst({
      where: {
        id,
        status: EventStatus.PUBLICADO,
      },
      include: {
        organizer: {
          select: {
            id: true,
            email: true,
          },
        },
        actions: {
          where: {
            status: {
              not: ActionStatus.CANCELADA,
            },
          },
          orderBy: {
            startDate: 'asc',
          },
        },
      },
    });

    if (!event) {
      throw new NotFoundException(
        'Evento publicado não encontrado.',
      );
    }

    return event;
  }

  async findManageable(
    id: string,
    user: AuthUser,
  ) {
    this.manager(user);

    const event = await this.get(id);
    this.scope(event, user);

    return event;
  }

  async update(
    id: string,
    dto: UpdateEventDto,
    user: AuthUser,
  ) {
    this.manager(user);

    const current = await this.get(id);
    this.scope(current, user);

    if (
      current.status === EventStatus.CANCELADO ||
      current.status === EventStatus.ENCERRADO
    ) {
      throw new ConflictException(
        'Eventos cancelados ou encerrados não podem ser editados.',
      );
    }

    const start = dto.startDate
      ? new Date(dto.startDate)
      : current.startDate;

    const end = dto.endDate
      ? new Date(dto.endDate)
      : current.endDate;

    this.validateDates(start, end);

    return this.prisma.event.update({
      where: { id },
      data: {
        ...(dto.title !== undefined
          ? { title: dto.title.trim() }
          : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() }
          : {}),
        ...(dto.startDate !== undefined
          ? { startDate: start }
          : {}),
        ...(dto.endDate !== undefined
          ? { endDate: end }
          : {}),
        ...(dto.location !== undefined
          ? { location: dto.location.trim() || null }
          : {}),
      },
      include: {
        actions: true,
      },
    });
  }

  async publish(
    id: string,
    user: AuthUser,
  ) {
    this.manager(user);

    const current = await this.get(id);
    this.scope(current, user);

    if (current.status !== EventStatus.RASCUNHO) {
      throw new ConflictException(
        'Somente eventos em RASCUNHO podem ser publicados.',
      );
    }

    const activeActions = current.actions.filter(
      (action) =>
        action.status !== ActionStatus.CANCELADA,
    );

    if (activeActions.length === 0) {
      throw new BadRequestException(
        'O evento precisa ter pelo menos uma ação antes da publicação.',
      );
    }

    const now = new Date();

    if (current.endDate <= now) {
      throw new BadRequestException(
        'Não é possível publicar um evento que já terminou.',
      );
    }

    return this.prisma.event.update({
      where: { id },
      data: {
        status: EventStatus.PUBLICADO,
        publishedAt: new Date(),
      },
      include: {
        actions: true,
      },
    });
  }

  async cancel(
    id: string,
    user: AuthUser,
  ) {
    this.manager(user);

    const current = await this.get(id);
    this.scope(current, user);

    if (
      current.status === EventStatus.CANCELADO ||
      current.status === EventStatus.ENCERRADO
    ) {
      throw new ConflictException(
        'Evento já está em estado final.',
      );
    }

    return this.prisma.event.update({
      where: { id },
      data: {
        status: EventStatus.CANCELADO,
        canceledAt: new Date(),
      },
      include: {
        actions: true,
      },
    });
  }

  async close(
    id: string,
    user: AuthUser,
  ) {
    this.manager(user);

    const current = await this.get(id);
    this.scope(current, user);

    if (current.status !== EventStatus.PUBLICADO) {
      throw new ConflictException(
        'Somente eventos PUBLICADOS podem ser encerrados.',
      );
    }

    return this.prisma.event.update({
      where: { id },
      data: {
        status: EventStatus.ENCERRADO,
        closedAt: new Date(),
      },
      include: {
        actions: true,
      },
    });
  }
}
'@

    Write-Utf8NoBom (
        Join-Path $events 'events.controller.ts'
    ) @'
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { UserRole } from '../../generated/prisma/enums';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { EventQueryDto } from './dto/event-query.dto';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { EventsService } from './events.service';

@Controller('events')
export class EventsController {
  constructor(
    private readonly service: EventsService,
  ) {}

  @Public()
  @Get()
  findPublic(
    @Query() query: EventQueryDto,
  ) {
    return this.service.findPublic(query);
  }

  @Public()
  @Get(':id')
  findPublicById(
    @Param('id') id: string,
  ) {
    return this.service.findPublicById(id);
  }

  @Roles(UserRole.ADMIN, UserRole.ORGANIZADOR)
  @Get(':id/manage')
  findManageable(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.service.findManageable(
      id,
      req.user,
    );
  }

  @Roles(UserRole.ADMIN, UserRole.ORGANIZADOR)
  @Post()
  create(
    @Body() dto: CreateEventDto,
    @Req() req: any,
  ) {
    return this.service.create(
      dto,
      req.user,
    );
  }

  @Roles(UserRole.ADMIN, UserRole.ORGANIZADOR)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
    @Req() req: any,
  ) {
    return this.service.update(
      id,
      dto,
      req.user,
    );
  }

  @Roles(UserRole.ADMIN, UserRole.ORGANIZADOR)
  @Post(':id/publish')
  publish(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.service.publish(
      id,
      req.user,
    );
  }

  @Roles(UserRole.ADMIN, UserRole.ORGANIZADOR)
  @Post(':id/cancel')
  cancel(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.service.cancel(
      id,
      req.user,
    );
  }

  @Roles(UserRole.ADMIN, UserRole.ORGANIZADOR)
  @Delete(':id')
  cancelByDelete(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.service.cancel(
      id,
      req.user,
    );
  }

  @Roles(UserRole.ADMIN, UserRole.ORGANIZADOR)
  @Post(':id/close')
  close(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.service.close(
      id,
      req.user,
    );
  }
}
'@

    Write-Utf8NoBom (
        Join-Path $events 'events.module.ts'
    ) @'
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [PrismaModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
'@

    # ---------------------------------------------------------
    # 5) Actions module
    # ---------------------------------------------------------
    $actions = Join-Path $Root 'src/modules/actions'
    $actionDto = Join-Path $actions 'dto'
    Ensure-Dir $actionDto

    Write-Utf8NoBom (
        Join-Path $actionDto 'create-action.dto.ts'
    ) @'
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateActionDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(5000)
  description!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationMinutes!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;
}
'@

    Write-Utf8NoBom (
        Join-Path $actionDto 'update-action.dto.ts'
    ) @'
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateActionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;
}
'@

    Write-Utf8NoBom (
        Join-Path $actions 'actions.service.ts'
    ) @'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActionStatus,
  EventStatus,
  UserRole,
} from '../../generated/prisma/enums';
import { PrismaService } from '../../database/prisma.service';
import { CreateActionDto } from './dto/create-action.dto';
import { UpdateActionDto } from './dto/update-action.dto';

type AuthUser = { id?: string; sub?: string; role: UserRole };

@Injectable()
export class ActionsService {
  constructor(private readonly prisma: PrismaService) {}

  private userId(user: AuthUser): string {
    const id = user.sub ?? user.id;

    if (!id) {
      throw new ForbiddenException(
        'Usuário autenticado sem identificador.',
      );
    }

    return id;
  }

  private manager(user: AuthUser) {
    if (
      user.role !== UserRole.ADMIN &&
      user.role !== UserRole.ORGANIZADOR
    ) {
      throw new ForbiddenException(
        'Apenas ADMIN ou ORGANIZADOR podem gerenciar ações.',
      );
    }
  }

  private validateDates(
    start: Date,
    end: Date,
  ) {
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime())
    ) {
      throw new BadRequestException('Datas inválidas.');
    }

    if (end <= start) {
      throw new BadRequestException(
        'A data de término deve ser posterior à data de início.',
      );
    }
  }

  private validateDuration(
    start: Date,
    end: Date,
    minutes: number,
  ) {
    const actualMs =
      end.getTime() - start.getTime();

    const expectedMs =
      minutes * 60_000;

    if (actualMs !== expectedMs) {
      throw new BadRequestException(
        'durationMinutes deve corresponder exatamente ao intervalo entre início e término.',
      );
    }
  }

  private validateInsideEvent(
    start: Date,
    end: Date,
    eventStart: Date,
    eventEnd: Date,
  ) {
    if (
      start < eventStart ||
      end > eventEnd
    ) {
      throw new BadRequestException(
        'A ação deve ocorrer integralmente dentro do período do evento.',
      );
    }
  }

  private scope(
    organizerId: string,
    user: AuthUser,
  ) {
    if (user.role === UserRole.ADMIN) return;

    if (
      organizerId !== this.userId(user)
    ) {
      throw new ForbiddenException(
        'Você não possui acesso ao evento.',
      );
    }
  }

  private async getEvent(
    eventId: string,
  ) {
    const event =
      await this.prisma.event.findUnique({
        where: {
          id: eventId,
        },
      });

    if (!event) {
      throw new NotFoundException(
        'Evento não encontrado.',
      );
    }

    return event;
  }

  private async getAction(id: string) {
    const action =
      await this.prisma.action.findUnique({
        where: {
          id,
        },
        include: {
          event: true,
        },
      });

    if (!action) {
      throw new NotFoundException(
        'Ação não encontrada.',
      );
    }

    return action;
  }

  async create(
    eventId: string,
    dto: CreateActionDto,
    user: AuthUser,
  ) {
    this.manager(user);

    const event =
      await this.getEvent(eventId);

    this.scope(
      event.organizerId,
      user,
    );

    if (
      event.status === EventStatus.CANCELADO ||
      event.status === EventStatus.ENCERRADO
    ) {
      throw new ConflictException(
        'Não é possível adicionar ações a evento cancelado ou encerrado.',
      );
    }

    const start =
      new Date(dto.startDate);

    const end =
      new Date(dto.endDate);

    this.validateDates(start, end);

    this.validateInsideEvent(
      start,
      end,
      event.startDate,
      event.endDate,
    );

    this.validateDuration(
      start,
      end,
      dto.durationMinutes,
    );

    if (dto.capacity < 1) {
      throw new BadRequestException(
        'A capacidade deve ser maior que zero.',
      );
    }

    return this.prisma.action.create({
      data: {
        eventId,
        title: dto.title.trim(),
        description: dto.description.trim(),
        startDate: start,
        endDate: end,
        durationMinutes:
          dto.durationMinutes,
        capacity: dto.capacity,
        location:
          dto.location?.trim() || null,
      },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
      },
    });
  }

  async findPublicByEvent(
    eventId: string,
  ) {
    const event =
      await this.getEvent(eventId);

    if (
      event.status !== EventStatus.PUBLICADO
    ) {
      throw new NotFoundException(
        'As ações ficam públicas somente após a publicação do evento.',
      );
    }

    return this.prisma.action.findMany({
      where: {
        eventId,
        status: {
          not: ActionStatus.CANCELADA,
        },
      },
      orderBy: {
        startDate: 'asc',
      },
    });
  }

  async findPublicById(id: string) {
    const action =
      await this.prisma.action.findFirst({
        where: {
          id,
          status: {
            not: ActionStatus.CANCELADA,
          },
          event: {
            status: EventStatus.PUBLICADO,
          },
        },
        include: {
          event: {
            select: {
              id: true,
              title: true,
              status: true,
            },
          },
        },
      });

    if (!action) {
      throw new NotFoundException(
        'Ação pública não encontrada.',
      );
    }

    return action;
  }

  async update(
    id: string,
    dto: UpdateActionDto,
    user: AuthUser,
  ) {
    this.manager(user);

    const current =
      await this.getAction(id);

    this.scope(
      current.event.organizerId,
      user,
    );

    if (
      current.status === ActionStatus.CANCELADA ||
      current.status === ActionStatus.ENCERRADA
    ) {
      throw new ConflictException(
        'Ações canceladas ou encerradas não podem ser editadas.',
      );
    }

    if (
      current.event.status === EventStatus.CANCELADO ||
      current.event.status === EventStatus.ENCERRADO
    ) {
      throw new ConflictException(
        'O evento está em estado final.',
      );
    }

    const start = dto.startDate
      ? new Date(dto.startDate)
      : current.startDate;

    const end = dto.endDate
      ? new Date(dto.endDate)
      : current.endDate;

    const durationMinutes =
      dto.durationMinutes ??
      current.durationMinutes;

    const capacity =
      dto.capacity ??
      current.capacity;

    this.validateDates(
      start,
      end,
    );

    this.validateInsideEvent(
      start,
      end,
      current.event.startDate,
      current.event.endDate,
    );

    this.validateDuration(
      start,
      end,
      durationMinutes,
    );

    if (capacity < 1) {
      throw new BadRequestException(
        'A capacidade deve ser maior que zero.',
      );
    }

    return this.prisma.action.update({
      where: { id },
      data: {
        ...(dto.title !== undefined
          ? {
              title: dto.title.trim(),
            }
          : {}),
        ...(dto.description !== undefined
          ? {
              description:
                dto.description.trim(),
            }
          : {}),
        ...(dto.startDate !== undefined
          ? {
              startDate: start,
            }
          : {}),
        ...(dto.endDate !== undefined
          ? {
              endDate: end,
            }
          : {}),
        ...(dto.durationMinutes !== undefined
          ? {
              durationMinutes,
            }
          : {}),
        ...(dto.capacity !== undefined
          ? {
              capacity,
            }
          : {}),
        ...(dto.location !== undefined
          ? {
              location:
                dto.location.trim() || null,
            }
          : {}),
      },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
      },
    });
  }

  async cancel(
    id: string,
    user: AuthUser,
  ) {
    this.manager(user);

    const current =
      await this.getAction(id);

    this.scope(
      current.event.organizerId,
      user,
    );

    if (
      current.status === ActionStatus.CANCELADA ||
      current.status === ActionStatus.ENCERRADA
    ) {
      throw new ConflictException(
        'Ação já está em estado final.',
      );
    }

    return this.prisma.action.update({
      where: {
        id,
      },
      data: {
        status: ActionStatus.CANCELADA,
        canceledAt: new Date(),
      },
    });
  }

  async close(
    id: string,
    user: AuthUser,
  ) {
    this.manager(user);

    const current =
      await this.getAction(id);

    this.scope(
      current.event.organizerId,
      user,
    );

    if (
      current.status !== ActionStatus.ATIVA
    ) {
      throw new ConflictException(
        'Somente ações ATIVAS podem ser encerradas.',
      );
    }

    return this.prisma.action.update({
      where: {
        id,
      },
      data: {
        status: ActionStatus.ENCERRADA,
        closedAt: new Date(),
      },
    });
  }
}
'@

    Write-Utf8NoBom (
        Join-Path $actions 'actions.controller.ts'
    ) @'
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { UserRole } from '../../generated/prisma/enums';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ActionsService } from './actions.service';
import { CreateActionDto } from './dto/create-action.dto';
import { UpdateActionDto } from './dto/update-action.dto';

@Controller()
export class ActionsController {
  constructor(
    private readonly service: ActionsService,
  ) {}

  @Public()
  @Get('events/:eventId/actions')
  findByEvent(
    @Param('eventId') eventId: string,
  ) {
    return this.service.findPublicByEvent(
      eventId,
    );
  }

  @Public()
  @Get('actions/:id')
  findById(
    @Param('id') id: string,
  ) {
    return this.service.findPublicById(id);
  }

  @Roles(UserRole.ADMIN, UserRole.ORGANIZADOR)
  @Post('events/:eventId/actions')
  create(
    @Param('eventId') eventId: string,
    @Body() dto: CreateActionDto,
    @Req() req: any,
  ) {
    return this.service.create(
      eventId,
      dto,
      req.user,
    );
  }

  @Roles(UserRole.ADMIN, UserRole.ORGANIZADOR)
  @Patch('actions/:id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateActionDto,
    @Req() req: any,
  ) {
    return this.service.update(
      id,
      dto,
      req.user,
    );
  }

  @Roles(UserRole.ADMIN, UserRole.ORGANIZADOR)
  @Post('actions/:id/cancel')
  cancel(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.service.cancel(
      id,
      req.user,
    );
  }

  @Roles(UserRole.ADMIN, UserRole.ORGANIZADOR)
  @Post('actions/:id/close')
  close(
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.service.close(
      id,
      req.user,
    );
  }
}
'@

    Write-Utf8NoBom (
        Join-Path $actions 'actions.module.ts'
    ) @'
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module';
import { ActionsController } from './actions.controller';
import { ActionsService } from './actions.service';

@Module({
  imports: [PrismaModule],
  controllers: [ActionsController],
  providers: [ActionsService],
  exports: [ActionsService],
})
export class ActionsModule {}
'@

    # ---------------------------------------------------------
    # 6) Build/test configuration
    # ---------------------------------------------------------
    Ensure-NestBuildConfig (
        Join-Path $Root 'tsconfig.build.json'
    )

    Ensure-JestTypes
    Ensure-JestTestConfig

    # ---------------------------------------------------------
    # 7) main.ts - ValidationPipe global
    # ---------------------------------------------------------
    Ensure-MainValidationPipe $mainPath

    # ---------------------------------------------------------
    # 8) Unit tests
    # ---------------------------------------------------------
    Write-Utf8NoBom (
        Join-Path $events 'events.service.spec.ts'
    ) @'
import {
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  EventStatus,
  UserRole,
} from '../../generated/prisma/enums';
import { EventsService } from './events.service';
import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

describe('EventsService', () => {
  const prisma: any = {
    event: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    action: {
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const organizer = {
    sub: 'u1',
    role: UserRole.ORGANIZADOR,
  };

  const admin = {
    sub: 'admin1',
    role: UserRole.ADMIN,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('cria evento como organizador', async () => {
    prisma.event.create.mockResolvedValue({
      id: 'e1',
      status: EventStatus.RASCUNHO,
    });

    const service =
      new EventsService(prisma);

    const result =
      await service.create(
        {
          title: 'Evento teste',
          description:
            'Descrição válida do evento',
          startDate:
            '2026-10-20T08:00:00.000Z',
          endDate:
            '2026-10-20T18:00:00.000Z',
        },
        organizer,
      );

    expect(result.status).toBe(
      EventStatus.RASCUNHO,
    );

    expect(
      prisma.event.create,
    ).toHaveBeenCalled();
  });

  it('bloqueia professor no gerenciamento', async () => {
    const service =
      new EventsService(prisma);

    await expect(
      service.create(
        {
          title: 'Evento teste',
          description:
            'Descrição válida do evento',
          startDate:
            '2026-10-20T08:00:00.000Z',
          endDate:
            '2026-10-20T18:00:00.000Z',
        },
        {
          sub: 'u2',
          role: UserRole.PROFESSOR,
        },
      ),
    ).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('permite ADMIN editar evento de outro organizador', async () => {
    prisma.event.findUnique.mockResolvedValue({
      id: 'e1',
      organizerId: 'owner',
      status: EventStatus.RASCUNHO,
      startDate:
        new Date('2026-10-20T08:00:00Z'),
      endDate:
        new Date('2026-10-20T18:00:00Z'),
      organizer: {},
      actions: [],
    });

    prisma.event.update.mockResolvedValue({
      id: 'e1',
      title: 'Novo',
    });

    const service =
      new EventsService(prisma);

    await service.update(
      'e1',
      {
        title: 'Novo',
      },
      admin,
    );

    expect(
      prisma.event.update,
    ).toHaveBeenCalled();
  });

  it('bloqueia edição de evento encerrado', async () => {
    prisma.event.findUnique.mockResolvedValue({
      id: 'e1',
      organizerId: 'u1',
      status: EventStatus.ENCERRADO,
      startDate:
        new Date('2026-10-20T08:00:00Z'),
      endDate:
        new Date('2026-10-20T18:00:00Z'),
      organizer: {},
      actions: [],
    });

    const service =
      new EventsService(prisma);

    await expect(
      service.update(
        'e1',
        {
          title: 'Novo',
        },
        organizer,
      ),
    ).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
'@

    Write-Utf8NoBom (
        Join-Path $actions 'actions.service.spec.ts'
    ) @'
import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  EventStatus,
  UserRole,
} from '../../generated/prisma/enums';
import { ActionsService } from './actions.service';
import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';

describe('ActionsService', () => {
  const prisma: any = {
    event: {
      findUnique: jest.fn(),
    },
    action: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const organizer = {
    sub: 'u1',
    role: UserRole.ORGANIZADOR,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('bloqueia ação fora do período do evento', async () => {
    prisma.event.findUnique.mockResolvedValue({
      id: 'e1',
      organizerId: 'u1',
      status: EventStatus.RASCUNHO,
      startDate:
        new Date('2026-10-20T08:00:00Z'),
      endDate:
        new Date('2026-10-20T18:00:00Z'),
    });

    const service =
      new ActionsService(prisma);

    await expect(
      service.create(
        'e1',
        {
          title: 'Palestra',
          description: 'Descrição',
          startDate:
            '2026-10-20T07:00:00Z',
          endDate:
            '2026-10-20T08:00:00Z',
          durationMinutes: 60,
          capacity: 100,
        },
        organizer,
      ),
    ).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('bloqueia organizador em evento de outro usuário', async () => {
    prisma.event.findUnique.mockResolvedValue({
      id: 'e1',
      organizerId: 'outro',
      status: EventStatus.RASCUNHO,
      startDate:
        new Date('2026-10-20T08:00:00Z'),
      endDate:
        new Date('2026-10-20T18:00:00Z'),
    });

    const service =
      new ActionsService(prisma);

    await expect(
      service.create(
        'e1',
        {
          title: 'Palestra',
          description: 'Descrição',
          startDate:
            '2026-10-20T09:00:00Z',
          endDate:
            '2026-10-20T10:00:00Z',
          durationMinutes: 60,
          capacity: 100,
        },
        organizer,
      ),
    ).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
'@

    # ---------------------------------------------------------
    # 9) Validate / generate / build
    # ---------------------------------------------------------
    Regenerate-PrismaClient

    Run-Step 'npm.cmd' @(
        'run',
        'build'
    ) 'Compilando NestJS da Sprint 4...'

    # ---------------------------------------------------------
    # 10) Tests
    # ---------------------------------------------------------
    $env:NODE_OPTIONS = '--experimental-vm-modules'

    Run-Step 'node.exe' @(
        '--experimental-vm-modules',
        'node_modules/jest/bin/jest.js',
        '--runInBand',
        '--no-cache',
        '--config',
        'jest.sprint4.config.cjs',
        'src/modules/events/events.service.spec.ts',
        'src/modules/actions/actions.service.spec.ts'
    ) 'Executando testes da Sprint 4...'

    # ---------------------------------------------------------
    # 11) Optional migration
    # ---------------------------------------------------------
    if ($ApplyMigration) {
        $needsUserRoleNullFix =
            $oldSchema -match '(?m)^\s*role\s+UserRole\?\s*$'

        Invoke-DatabasePreflight `
            -NeedsUserRoleNullFix:$needsUserRoleNullFix

        Run-Step 'npx.cmd' @(
            'prisma',
            'migrate',
            'dev',
            '--name',
            'sprint4_eventos_acoes',
            '--skip-seed'
        ) 'Criando/aplicando migration da Sprint 4...'

        $MigrationApplied = $true

        Run-Step 'npx.cmd' @(
            'prisma',
            'migrate',
            'status'
        ) 'Verificando migrations após a Sprint 4...'
    } else {
        Write-Host "`n[!] Migration não aplicada." -ForegroundColor Yellow
        Write-Host '    Para aplicar depois:' -ForegroundColor Yellow
        Write-Host '    npx prisma migrate dev --name sprint4_eventos_acoes --skip-seed' -ForegroundColor Yellow
    }

    Write-Host "`n============================================================" -ForegroundColor Green
    Write-Host " SPRINT 4 CONCLUÍDA COM SUCESSO" -ForegroundColor Green
    Write-Host "============================================================" -ForegroundColor Green

    Write-Host "Projeto: $Root"
    Write-Host "Backup:  $backup"
    Write-Host ''

    Write-Host 'Rotas públicas:' -ForegroundColor White
    Write-Host '  GET  /events'
    Write-Host '  GET  /events/:id'
    Write-Host '  GET  /events/:eventId/actions'
    Write-Host '  GET  /actions/:id'
    Write-Host ''

    Write-Host 'Rotas de gestão (ADMIN/ORGANIZADOR):' -ForegroundColor White
    Write-Host '  POST   /events'
    Write-Host '  GET    /events/:id/manage'
    Write-Host '  PATCH  /events/:id'
    Write-Host '  POST   /events/:id/publish'
    Write-Host '  POST   /events/:id/cancel'
    Write-Host '  DELETE /events/:id   (cancelamento lógico)'
    Write-Host '  POST   /events/:id/close'
    Write-Host '  POST   /events/:eventId/actions'
    Write-Host '  PATCH  /actions/:id'
    Write-Host '  POST   /actions/:id/cancel'
    Write-Host '  POST   /actions/:id/close'

    try {
        Stop-Transcript | Out-Null
    } catch {
    }

    Write-Host "`nLog: $logPath" -ForegroundColor DarkGray
}
catch {
    Write-Host "`nERRO: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "O backup foi preservado em: $backup" -ForegroundColor Yellow

    if (-not $MigrationApplied) {
        try {
            Write-Host 'Restaurando arquivos alterados pela Sprint 4...' -ForegroundColor Yellow

            Restore-Backup

            if (
                Test-Path -LiteralPath (
                    Join-Path $Root 'prisma/schema.prisma'
                )
            ) {
                & 'npx.cmd' `
                    'prisma' `
                    'generate' `
                    '--schema' `
                    'prisma/schema.prisma'

                if ($LASTEXITCODE -ne 0) {
                    Write-Host 'Aviso: o schema foi restaurado, mas o Prisma Client não pôde ser regenerado automaticamente.' -ForegroundColor Yellow
                } else {
                    Write-Host '[OK] Prisma Client regenerado após a restauração.' -ForegroundColor Green
                }
            }

            Write-Host 'Restauração concluída.' -ForegroundColor Green
        }
        catch {
            Write-Host "Falha ao restaurar automaticamente: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
    else {
        Write-Host 'Migration já aplicada; arquivos não serão restaurados automaticamente.' -ForegroundColor Yellow
    }

    try {
        Stop-Transcript | Out-Null
    } catch {
    }

    Write-Host "`nO script terminou com falha, mas o terminal permanecerá aberto." -ForegroundColor Red
    return
}
