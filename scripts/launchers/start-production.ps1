$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$tunnelId = 'aebf91e4-acf5-4eb4-aaae-8b56a58e8035'
$cloudflareTunnelScript = Join-Path $root 'scripts\cloudflare-tunnel.ps1'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'docker was not found on PATH.'
}
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    throw 'cloudflared was not found on PATH.'
}

$compose = @('compose')
$composeVersion = & docker @compose version 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose is required. $($composeVersion -join [Environment]::NewLine)"
}

function Stop-ProductionStack {
    & docker @compose down
    if ($LASTEXITCODE -ne 0) {
        Write-Warning 'Docker Compose shutdown returned a non-zero exit code.'
    }
}

try {
    Set-Location $root

    # frontend/Dockerfile builds the Next.js standalone server. The web service
    # publishes it on 127.0.0.1:4173 for the Cloudflare Tunnel.
    & docker @compose up --build -d
    if ($LASTEXITCODE -ne 0) {
        throw 'Production Docker Compose startup failed.'
    }

    $webCheck = Invoke-WebRequest -Uri 'http://127.0.0.1:4173/' -UseBasicParsing -TimeoutSec 30
    if ($webCheck.StatusCode -ne 200 -or $webCheck.Content -match '/@vite/client|/src/main\.tsx') {
        throw 'The production frontend did not return static build HTML.'
    }

    . $cloudflareTunnelScript
    $cloudflared = (Get-Command cloudflared -ErrorAction Stop).Source
    $tokenOutput = & $cloudflared tunnel token $tunnelId 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "cloudflared tunnel token failed for tunnel $tunnelId."
    }
    $token = Get-CloudflareTokenFromOutput -Output ([string[]]$tokenOutput)

    Write-Host 'Production Docker stack is running.' -ForegroundColor Green
    Write-Host 'Public origin target: http://127.0.0.1:4173 (Next.js standalone server)' -ForegroundColor Cyan
    Write-Host 'Starting the named Cloudflare Tunnel. Press Ctrl+C to stop the tunnel and stack.' -ForegroundColor Yellow
    & $cloudflared tunnel run --token $token
}
finally {
    Stop-ProductionStack
}
