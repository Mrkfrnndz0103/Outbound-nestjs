$preflightPath = Join-Path $PSScriptRoot '..\preflight.ps1'
$preflightSource = Get-Content -Raw $preflightPath
$composeSource = Get-Content -Raw (Join-Path $PSScriptRoot '..\..\docker-compose.yml')
$productionLauncherSource = Get-Content -Raw (Join-Path $PSScriptRoot '..\launchers\start-production.ps1')

Describe 'Development script preflight coverage' {
    It 'selects development checks when the launcher or Cloudflare scripts change' {
        ($preflightSource -match '\$RunDevScripts') | Should Be $true
        ($preflightSource -match 'scripts[\\/]launchers') | Should Be $true
        ($preflightSource -match 'scripts/cloudflare-tunnel\.ps1') | Should Be $true
        ($preflightSource -match 'Invoke-Pester') | Should Be $true
    }

    It 'does not promote npm warnings to frontend dependency failures' {
        ($preflightSource -match '\$ErrorActionPreference\s*=\s*["'']Continue["'']') | Should Be $true
    }

    It 'uses port 4173 for the Docker production frontend origin' {
        $composeSource | Should Match '127\.0\.0\.1:4173:80'
        $productionLauncherSource | Should Match '127\.0\.0\.1:4173/'
        $productionLauncherSource | Should Match 'Frontend origin: http://127\.0\.0\.1:4173'
    }
}
