$preflightPath = Join-Path $PSScriptRoot '..\preflight.ps1'
$preflightSource = Get-Content -Raw $preflightPath

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
}
