$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$cloudflareTunnelScript = Join-Path $root 'scripts\cloudflare-tunnel.ps1'
$tunnelId = 'aebf91e4-acf5-4eb4-aaae-8b56a58e8035'
$logRoot = Join-Path $root 'storage\logs\dev'
$processes = @()
$lastLogLines = @{}

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    throw 'cloudflared was not found on PATH.'
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'npm was not found on PATH.'
}

function Get-DescendantProcessIds {
    param([int]$ParentId)

    $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $ParentId" -ErrorAction SilentlyContinue)
    foreach ($child in $children) {
        $child.ProcessId
        Get-DescendantProcessIds -ParentId $child.ProcessId
    }
}

function Stop-ProcessTree {
    param([int]$ProcessId)

    $descendants = @(Get-DescendantProcessIds -ParentId $ProcessId | Sort-Object -Descending)
    foreach ($id in $descendants + $ProcessId) {
        if ($id -and $id -ne $PID) {
            Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
        }
    }
}

function Stop-ExistingDevelopmentServers {
    $candidateIds = @{}

    $processesToStop = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $_.ProcessId -ne $PID -and $_.CommandLine -and (
            $_.CommandLine -match 'npm\s+run\s+(start:dev|dev)' -or
            $_.CommandLine -match 'cloudflared(\.exe)?\s+.*tunnel\s+(run|--token)'
        )
    })

    foreach ($process in $processesToStop) {
        $candidateIds[[int]$process.ProcessId] = $true
    }

    foreach ($port in @(3000, 3001, 4173)) {
        $connections = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
        foreach ($connection in $connections) {
            if ($connection.OwningProcess -and $connection.OwningProcess -ne $PID) {
                $candidateIds[[int]$connection.OwningProcess] = $true
            }
        }
    }

    foreach ($id in @($candidateIds.Keys)) {
        Write-Host "Stopping existing development process $id..." -ForegroundColor Yellow
        Stop-ProcessTree -ProcessId ([int]$id)
    }
}

function Start-DevProcess {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$FilePath,
        [Parameter(Mandatory)][string[]]$ArgumentList,
        [Parameter(Mandatory)][string]$WorkingDirectory
    )

    $outLog = Join-Path $logRoot "$Name.out.log"
    $errLog = Join-Path $logRoot "$Name.err.log"
    Set-Content -LiteralPath $outLog -Value "[$(Get-Date -Format o)] $Name starting" -Encoding utf8
    Set-Content -LiteralPath $errLog -Value "[$(Get-Date -Format o)] $Name starting" -Encoding utf8
    $script:lastLogLines[$Name] = @{ Out = 1; Err = 1 }

    $process = Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -WorkingDirectory $WorkingDirectory `
        -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru
    $script:processes += [pscustomobject]@{
        Name = $Name
        Process = $process
        OutLog = $outLog
        ErrLog = $errLog
    }
    Write-Host "[$Name] STARTING (pid $($process.Id))" -ForegroundColor Yellow
}

function Write-NewLogLines {
    foreach ($service in $processes) {
        foreach ($kind in @('Out', 'Err')) {
            $path = if ($kind -eq 'Out') { $service.OutLog } else { $service.ErrLog }
            if (-not (Test-Path -LiteralPath $path)) { continue }
            $lines = @(Get-Content -LiteralPath $path -ErrorAction SilentlyContinue)
            $start = [int]$lastLogLines[$service.Name][$kind]
            if ($lines.Count -gt $start) {
                foreach ($line in $lines[$start..($lines.Count - 1)]) {
                    if ($line) { Write-Host "[$($service.Name)] $line" }
                }
                $lastLogLines[$service.Name][$kind] = $lines.Count
            }
        }
    }
}

Stop-ExistingDevelopmentServers
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
$launcherErrorLog = Join-Path $logRoot 'launcher.err.log'
Set-Content -LiteralPath $launcherErrorLog -Value "[$(Get-Date -Format o)] launcher starting" -Encoding utf8

$powershell = Join-Path $PSHOME 'powershell.exe'
$npm = (Get-Command npm -ErrorAction Stop).Source
$cloudflared = (Get-Command cloudflared -ErrorAction Stop).Source

$tokenOutput = & $cloudflared tunnel token $tunnelId 2>&1
if ($LASTEXITCODE -ne 0) {
    $message = "cloudflared tunnel token failed for tunnel $tunnelId.`n$($tokenOutput -join [Environment]::NewLine)"
    Add-Content -LiteralPath $launcherErrorLog -Value "[$(Get-Date -Format o)] $message"
    throw $message
}
. $cloudflareTunnelScript
$token = Get-CloudflareTokenFromOutput -Output ([string[]]$tokenOutput)

Start-DevProcess -Name 'soc5-backend-nest' -FilePath $npm -ArgumentList @('--prefix', (Join-Path $root 'backend-nest'), 'run', 'start:dev') -WorkingDirectory $root
Start-DevProcess -Name 'soc5-frontend' -FilePath $npm -ArgumentList @('run', 'dev') -WorkingDirectory (Join-Path $root 'frontend')
Start-DevProcess -Name 'soc5-cloudflared' -FilePath $cloudflared -ArgumentList @('tunnel', 'run', '--token', $token) -WorkingDirectory $root

Write-Host ''
Write-Host 'SOC 5 development stack is starting.' -ForegroundColor Cyan
Write-Host 'Press Ctrl+C to stop the backend, frontend, and Cloudflare tunnel.' -ForegroundColor Yellow
Write-Host "Logs: $logRoot" -ForegroundColor DarkCyan
Write-Host ''

try {
    while ($true) {
        Write-NewLogLines
        foreach ($service in $processes) {
            $service.Process.Refresh()
            if ($service.Process.HasExited) {
                Write-NewLogLines
                throw "$($service.Name) exited with code $($service.Process.ExitCode). See $($service.OutLog) and $($service.ErrLog)."
            }
        }
        Start-Sleep -Milliseconds 500
    }
}
finally {
    Write-Host ''
    Write-Host 'Stopping SOC 5 development stack...' -ForegroundColor Yellow
    foreach ($service in $processes) {
        Stop-ProcessTree -ProcessId $service.Process.Id
    }
    Write-Host 'Development stack stopped.' -ForegroundColor Green
}
