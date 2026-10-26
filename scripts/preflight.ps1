param(
    [switch]$Fix,
    [switch]$All
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$Failures = @()
$FrontendDependencyInstallOutput = ""

function Invoke-CommandChecked {
    param(
        [scriptblock]$Command,
        [string]$ErrorMessage
    )

    & $Command

    if ($LASTEXITCODE -ne 0) {
        throw $ErrorMessage
    }
}

function Invoke-ProjectBinary {
    param(
        [string]$Name,
        [object[]]$Arguments = @()
    )

    $binary = Join-Path (Get-Location) "node_modules\.bin\$Name.cmd"

    if (-not (Test-Path -LiteralPath $binary -PathType Leaf)) {
        throw "Project-local binary '$Name' is unavailable. Install frontend dependencies first."
    }

    & $binary @Arguments

    if ($LASTEXITCODE -ne 0) {
        throw "Project-local binary '$Name' failed with exit code $LASTEXITCODE."
    }
}

function Invoke-FrontendNpmCi {
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"

    try {
        $output = @(& npm.cmd ci --cache .npm --prefer-offline 2>&1)
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    $output | ForEach-Object { Write-Host ([string]$_) }
    $script:FrontendDependencyInstallOutput = (($output | ForEach-Object { [string]$_ }) -join [Environment]::NewLine)

    if ($exitCode -ne 0) {
        throw "npm ci failed with exit code $exitCode."
    }
}

function Reset-FrontendDependencies {
    $nodeModulesPath = Join-Path $Root 'frontend\node_modules'

    if (Test-Path -LiteralPath $nodeModulesPath -PathType Container) {
        & cmd.exe /c rmdir /s /q "$nodeModulesPath"
        if ($LASTEXITCODE -ne 0 -or (Test-Path -LiteralPath $nodeModulesPath)) {
            throw "Unable to remove frontend node_modules before reinstalling dependencies."
        }
    }
}

function Repair-FrontendDependencies {
    Write-Host "Removing frontend node_modules before retrying npm ci..."
    Reset-FrontendDependencies

    Set-Location (Join-Path $Root 'frontend')
    Invoke-FrontendNpmCi
}

function Mark-Blocked {
    param(
        [string]$Name,
        [string]$Reason
    )

    Write-Host ""
    Write-Host "==> $Name"
    Write-Host "[BLOCKED] $Name - $Reason"
    $script:Failures += "$Name (blocked)"
}

function Run-Step {
    param(
        [string]$Name,
        [scriptblock]$Command,
        [scriptblock]$FixCommand = $null
    )

    Write-Host ""
    Write-Host "==> $Name"

    try {
        & $Command

        Write-Host "[PASS] $Name"
        return $true
    }
    catch {
        Write-Host "[FAIL] $Name"
        Write-Host "  $($_.Exception.Message)"

        if ($Fix -and $FixCommand) {
            try {
                Write-Host "Auto-fixing..."
                & $FixCommand

                Write-Host "Re-checking..."
                & $Command

                Write-Host "[PASS AFTER FIX] $Name"
                return $true
            }
            catch {
                Write-Host "[FAILED AFTER FIX] $Name"
                Write-Host "  $($_.Exception.Message)"
            }
        }

        $script:Failures += $Name
        return $false
    }
}

Invoke-CommandChecked {
    npm.cmd run check:conflicts
} "conflict-marker guard failed"

function Get-ChangedFiles {

    $files = @()

    # Committed changes compared with main
    try {
        git rev-parse --verify origin/main *> $null

        if ($LASTEXITCODE -eq 0) {
            $files += git diff --name-only origin/main...HEAD
        }
        else {
            $files += git diff --name-only main...HEAD
        }
    }
    catch {}

    # Staged changes
    $files += git diff --cached --name-only

    # Unstaged changes
    $files += git diff --name-only

    # New/untracked files
    $files += git ls-files --others --exclude-standard

    return $files |
        Where-Object { $_ } |
        Sort-Object -Unique
}

Write-Host ""
Write-Host "======================================"
Write-Host " SOC5 OUTBOUND PRE-PUSH ORCHESTRATOR"
Write-Host "======================================"

$ChangedFiles = @(Get-ChangedFiles)

if ($ChangedFiles.Count -eq 0) {
    Write-Host ""
    Write-Host "No changed files detected."
    Write-Host "Running full preflight for safety."
    $All = $true
}
else {
    Write-Host ""
    Write-Host "Changed files discovered:"

    foreach ($file in $ChangedFiles) {
        Write-Host "  $file"
    }
}

$RunFrontend   = $false
$RunBackend    = $false
$RunPostgres   = $false
$RunEdge       = $false
$RunDeployment = $false
$RunDevScripts = $false

if ($All) {
    $RunFrontend   = $true
    $RunBackend    = $true
    $RunPostgres   = $true
    $RunEdge       = $true
    $RunDeployment = $true
    $RunDevScripts = $true
}
else {

    foreach ($file in $ChangedFiles) {

        # Frontend
        if ($file -match '^frontend/') {
            $RunFrontend = $true
        }

        # Laravel backend
        if (
            $file -match '^backend/app/' -or
            $file -match '^backend/routes/' -or
            $file -match '^backend/config/' -or
            $file -match '^backend/tests/' -or
            $file -eq 'backend/composer.json' -or
            $file -eq 'backend/composer.lock' -or
            $file -eq 'backend/phpunit.xml'
        ) {
            $RunBackend = $true
        }

        # Database-sensitive changes
        if (
            $file -match '^backend/database/' -or
            $file -match '^supabase/migrations/'
        ) {
            $RunBackend  = $true
            $RunPostgres = $true
        }

        # Supabase Edge Functions
        if ($file -match '^supabase/functions/') {
            $RunEdge = $true
        }

        # Deployment
        if (
            $file -match '^docker-compose.*\.yml$' -or
            $file -match 'Dockerfile$' -or
            $file -match '^deploy/'
        ) {
            $RunDeployment = $true
        }

        # High-risk/shared files -> full CI simulation
        if (
            $file -eq '.travis.yml' -or
            $file -eq 'composer.json' -or
            $file -eq 'package.json' -or
            $file -eq 'deno.json'
        ) {
            $RunFrontend   = $true
            $RunBackend    = $true
            $RunPostgres   = $true
            $RunEdge       = $true
            $RunDeployment = $true
        }

        # Development launchers and local tunnel helpers
        if (
            $file -match '^scripts/launchers/.*\.ps1$' -or
            $file -eq 'scripts/preflight.ps1' -or
            $file -eq 'scripts/cloudflare-tunnel.ps1' -or
            $file -match '^scripts/tests/.*\.ps1$'
        ) {
            $RunDevScripts = $true
        }
    }
}

Write-Host ""
Write-Host "Checks selected:"
Write-Host "  Frontend:            $RunFrontend"
Write-Host "  Backend:             $RunBackend"
Write-Host "  Backend PostgreSQL:  $RunPostgres"
Write-Host "  Edge Functions:      $RunEdge"
Write-Host "  Deployment:          $RunDeployment"
Write-Host "  Development scripts: $RunDevScripts"

# ------------------------------------------------------------
# DEVELOPMENT SCRIPTS
# ------------------------------------------------------------

if ($RunDevScripts) {

    Run-Step "Development script syntax and tests" {
        $scriptFiles = @(
            (Join-Path $Root 'scripts\launchers\start-dev.ps1'),
            (Join-Path $Root 'scripts\preflight.ps1'),
            (Join-Path $Root 'scripts\cloudflare-tunnel.ps1')
        )

        foreach ($scriptFile in $scriptFiles) {
            $parseErrors = @()
            [System.Management.Automation.Language.Parser]::ParseFile(
                $scriptFile,
                [ref]$null,
                [ref]$parseErrors
            ) | Out-Null

            if ($parseErrors.Count -gt 0) {
                throw "$scriptFile contains PowerShell parse errors."
            }
        }

        if (-not (Get-Command Invoke-Pester -ErrorAction SilentlyContinue)) {
            throw 'Pester is required to validate development script tests.'
        }

        $testPath = Join-Path $Root 'scripts\tests'
        $pesterResult = Invoke-Pester -Path $testPath -PassThru
        if ($pesterResult.FailedCount -gt 0) {
            throw "Development script tests failed: $($pesterResult.FailedCount) failure(s)."
        }
    }
}

# ------------------------------------------------------------
# FRONTEND
# ------------------------------------------------------------

if ($RunFrontend) {

    Set-Location (Join-Path $Root 'frontend')
    Reset-FrontendDependencies

    $FrontendDependenciesReady = Run-Step "Frontend dependencies" {
        Set-Location "$Root\frontend"
        Invoke-FrontendNpmCi
    } {
        Set-Location "$Root\frontend"
        Repair-FrontendDependencies
    }

    if ($FrontendDependenciesReady) {
        Run-Step "Frontend robots" {
            Set-Location "$Root\frontend"

            Invoke-CommandChecked {
                npm.cmd run check:robots
            } "robots check failed"
        }

        Run-Step "Frontend lint" {
            Set-Location "$Root\frontend"

            Invoke-CommandChecked {
                npm.cmd run lint
            } "frontend lint failed"
        } {
            Set-Location "$Root\frontend"
        Invoke-ProjectBinary -Name 'biome' -Arguments @('check', '--write', '--unsafe', 'src', 'scripts')
        }

        Run-Step "Frontend formatting" {
            Set-Location "$Root\frontend"

            Invoke-CommandChecked {
                npm.cmd run format:check
            } "frontend formatting failed"
        } {
            Set-Location "$Root\frontend"
            Invoke-ProjectBinary -Name 'biome' -Arguments @(
                'format',
                '--write',
                'src/App.tsx',
                'src/lib/routes.ts',
                'src/lib/requests.test.ts',
                'scripts/check-source-artifacts.mjs'
            )
        }

        Run-Step "Frontend unit tests" {
            Set-Location "$Root\frontend"

            Invoke-CommandChecked {
                npm.cmd test
            } "frontend tests failed"
        }

        Run-Step "Playwright Chromium" {
            Set-Location "$Root\frontend"

            Invoke-ProjectBinary -Name 'playwright' -Arguments @('install', 'chromium')
        }

        Run-Step "Frontend E2E" {
            Set-Location "$Root\frontend"

            $previousCi = $env:CI
            $env:CI = "1"

            try {
                Invoke-CommandChecked {
                    npm.cmd run test:e2e
                } "E2E tests failed"
            }
            finally {
                if ($null -eq $previousCi) {
                    Remove-Item Env:CI -ErrorAction SilentlyContinue
                }
                else {
                    $env:CI = $previousCi
                }
            }
        }

        Run-Step "Frontend build" {
            Set-Location "$Root\frontend"

            Invoke-CommandChecked {
                npm.cmd run build
            } "frontend build failed"
        }
    }
    else {
        $blockedReason = "frontend dependencies failed; dependent checks were not run"
        Mark-Blocked "Frontend robots" $blockedReason
        Mark-Blocked "Frontend lint" $blockedReason
        Mark-Blocked "Frontend formatting" $blockedReason
        Mark-Blocked "Frontend unit tests" $blockedReason
        Mark-Blocked "Playwright Chromium" $blockedReason
        Mark-Blocked "Frontend E2E" $blockedReason
        Mark-Blocked "Frontend build" $blockedReason
    }
}

# ------------------------------------------------------------
# ------------------------------------------------------------
# EDGE FUNCTIONS
# ------------------------------------------------------------

if ($RunEdge) {

    Run-Step "Edge Functions type check" {
        Set-Location $Root

        Invoke-CommandChecked {
            deno check `
                supabase/functions/sync-clusters/index.ts `
                supabase/functions/sync-intraday/index.ts
        } "Deno check failed"
    } {
        Set-Location $Root
        deno fmt supabase/functions
    }

    Run-Step "Edge Functions tests" {
        Set-Location $Root

        Invoke-CommandChecked {
            deno test --allow-env `
                supabase/functions/sync-clusters/index_test.ts `
                supabase/functions/sync-intraday/index_test.ts
        } "Edge Function tests failed"
    }
}

# ------------------------------------------------------------
# DEPLOYMENT
# ------------------------------------------------------------

if ($RunDeployment) {

    Run-Step "Deployment configuration" {
        Set-Location $Root

        $compose = Get-Content ".\docker-compose.yml" -Raw

        if ($compose -notmatch "(?m)^services:") {
            throw "docker-compose.yml is missing services:"
        }

        if ($compose -notmatch "scheduler") {
            throw "docker-compose.yml is missing scheduler"
        }
    }
}

Set-Location $Root

Write-Host ""
Write-Host "======================================"

if ($Failures.Count -gt 0) {

    Write-Host "PRE-FLIGHT FAILED"
    Write-Host ""

    foreach ($failure in $Failures) {
        Write-Host "  [FAILED] $failure"
    }

    Write-Host ""
    Write-Host "DO NOT PUSH YET"
    exit 1
}

Write-Host "ALL SELECTED CHECKS PASSED"
Write-Host "SAFE TO PUSH"
Write-Host "======================================"

exit 0
