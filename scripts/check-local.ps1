param(
    [switch]$RequireCloudflare,
    [switch]$RequireSupabase
)

$ErrorActionPreference = 'Continue'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Failures = [System.Collections.Generic.List[string]]::new()

function Check-Condition {
    param([bool]$Condition, [string]$Pass, [string]$Fail)
    if ($Condition) {
        Write-Host "[PASS] $Pass" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] $Fail" -ForegroundColor Red
        $Failures.Add($Fail)
    }
}

function Get-ToolPath {
    param([string]$Name)
    $command = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -eq $command) { return $null }
    return $command.Source
}

function Test-GitIgnored {
    param([string]$Path)
    git check-ignore -q --no-index -- $Path
    return ($LASTEXITCODE -eq 0)
}

Set-Location $ProjectRoot
Write-Host "Checking local environment for $ProjectRoot"

foreach ($path in @('backend', 'frontend', 'supabase', 'scripts', 'package.json', 'backend/composer.json', 'supabase/config.toml')) {
    Check-Condition (Test-Path -LiteralPath (Join-Path $ProjectRoot $path)) "Found $path" "Missing $path"
}

foreach ($envPath in @('.env', 'backend/.env', 'frontend/.env')) {
    Check-Condition (Test-Path -LiteralPath (Join-Path $ProjectRoot $envPath)) "Found $envPath" "Missing $envPath; run scripts/setup-local.ps1"
}

foreach ($tool in @('php', 'composer', 'node', 'npm')) {
    $toolPath = Get-ToolPath $tool
    Check-Condition ($null -ne $toolPath) "Found $tool at $toolPath" "$tool was not found on PATH"
}

$phpIni = Join-Path $ProjectRoot 'tools\php.local.ini'
if (-not (Test-Path -LiteralPath $phpIni -PathType Leaf)) {
    $phpIni = Join-Path $ProjectRoot 'tools\php.ini'
}
Check-Condition (Test-Path -LiteralPath $phpIni -PathType Leaf) "Found PHP project config $phpIni" 'No project PHP configuration found'

$caPath = $env:PHP_CA_BUNDLE
if (-not $caPath) { $caPath = Join-Path $ProjectRoot 'tools\cacert.pem' }
Check-Condition (Test-Path -LiteralPath $caPath -PathType Leaf) "Found CA bundle $caPath" "CA bundle not found at $caPath; set PHP_CA_BUNDLE or place cacert.pem in tools"

foreach ($port in @(8000, 5173, 4173)) {
    $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    Check-Condition ($null -eq $listener) "Port $port is available" "Port $port is already in use"
}

$cloudflared = Get-ToolPath 'cloudflared'
$backendEnvPath = Join-Path $ProjectRoot 'backend\.env'
$backendEnvContent = if (Test-Path -LiteralPath $backendEnvPath -PathType Leaf) { Get-Content -LiteralPath $backendEnvPath } else { @() }
. (Join-Path $ProjectRoot 'scripts\cloudflare-tunnel.ps1')
$cloudflareTunnelId = Get-DotEnvValue -Content $backendEnvContent -Name 'CLOUDFLARE_TUNNEL_ID'
$configuredCloudflareCert = Get-DotEnvValue -Content $backendEnvContent -Name 'CLOUDFLARE_CERT_PATH'
$cloudflareCert = if ($configuredCloudflareCert) { $configuredCloudflareCert } elseif ($env:TUNNEL_ORIGIN_CERT) { $env:TUNNEL_ORIGIN_CERT } else { Join-Path $env:USERPROFILE '.cloudflared\cert.pem' }
if ($RequireCloudflare) {
    $seatalkCallback = Get-DotEnvValue -Content $backendEnvContent -Name 'SEATALK_REDIRECT_URI'
    Check-Condition (-not [string]::IsNullOrWhiteSpace($cloudflareTunnelId)) 'Cloudflare tunnel ID is configured' 'CLOUDFLARE_TUNNEL_ID is missing from backend/.env'
    Check-Condition ($seatalkCallback -ceq (Get-ExpectedSeatalkCallbackUrl)) 'SeaTalk callback matches the Cloudflare public URL' 'SEATALK_REDIRECT_URI must equal https://soc5outboundops.app/auth/seatalk/callback'
    Check-Condition ($null -ne $cloudflared) 'cloudflared is available' 'cloudflared was not found on PATH'
    Check-Condition (Test-Path -LiteralPath $cloudflareCert -PathType Leaf) "Found Cloudflare origin certificate $cloudflareCert" "Cloudflare origin certificate not found at $cloudflareCert; run cloudflared tunnel login"
    if ($null -ne $cloudflared -and (Test-Path -LiteralPath $cloudflareCert -PathType Leaf)) {
        try {
            $tokenOutput = & $cloudflared @(Get-CloudflareTunnelTokenCommand -TunnelId $cloudflareTunnelId) 2>&1
            $null = Get-CloudflareTokenFromOutput -Output ([string[]]$tokenOutput)
            Check-Condition $true "Cloudflare tunnel $cloudflareTunnelId returned a token" ''
        } catch {
            Check-Condition $false "Cloudflare tunnel $cloudflareTunnelId returned a token" $_.Exception.Message
        }
    }
} else {
    Write-Host "[INFO] Cloudflare: $(if ($cloudflared) { 'available' } else { 'optional/not found' })"
}

$supabase = Get-ToolPath 'supabase'
if ($RequireSupabase) {
    Check-Condition ($null -ne $supabase) 'Supabase CLI is available' 'Supabase CLI was not found on PATH'
} else {
    Write-Host "[INFO] Supabase CLI: $(if ($supabase) { 'available' } else { 'optional/not found' })"
}

Check-Condition (Test-GitIgnored 'tools/php.local.ini') 'Machine-local PHP config is ignored' 'tools/php.local.ini is not Git-ignored'
Check-Condition (Test-GitIgnored 'tools/cacert.pem') 'Machine-local CA bundle is ignored' 'tools/cacert.pem is not Git-ignored'
Check-Condition (Test-GitIgnored 'backend/.env') 'Backend environment file is ignored' 'backend/.env is not Git-ignored'

if ($Failures.Count -gt 0) {
    Write-Host "`nLocal environment check failed with $($Failures.Count) issue(s)." -ForegroundColor Red
    exit 1
}

Write-Host "`nLocal environment is ready." -ForegroundColor Green
exit 0
