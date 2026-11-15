<#
.SYNOPSIS
    Starts Netease Cloud Music Gateway (:3000), FastAPI Backend (:8000), and Vite Frontend (:5173).
.EXAMPLE
    .\start-services.ps1
#>
[CmdletBinding()]
param(
    [int]$GatewayPort = 3000,
    [int]$BackendPort = 8000,
    [int]$FrontendPort = 5173
)

$ErrorActionPreference = 'Stop'
$RootDir = $PSScriptRoot
$BackendDir = Join-Path $RootDir 'backend'
$FrontendDir = Join-Path $RootDir 'frontend'

function Test-PortListening([int]$Port) {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    return $null -ne $conn
}

function Find-NcmGatewayEntry {
    $candidates = @(
        (Join-Path $RootDir 'netease-gateway\node_modules\@neteasecloudmusicapienhanced\api\app.js'),
        (Join-Path $BackendDir 'node_modules\@neteasecloudmusicapienhanced\api\app.js'),
        (Join-Path $env:APPDATA 'npm\node_modules\@neteasecloudmusicapienhanced\api\app.js')
    )
    $npmCmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
    if ($npmCmd) {
        try {
            $npmRoot = (& $npmCmd root -g 2>$null | Out-String).Trim()
            if ($npmRoot) {
                $candidates += (Join-Path $npmRoot '@neteasecloudmusicapienhanced\api\app.js')
            }
        } catch {}
    }
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path $candidate)) {
            return $candidate
        }
    }
    return $null
}

$NodeCmd = (Get-Command node -ErrorAction SilentlyContinue).Source
$NcmEntry = Find-NcmGatewayEntry

if (Test-PortListening $GatewayPort) {
    Write-Host "[Gateway] Already listening on http://127.0.0.1:$GatewayPort" -ForegroundColor Green
} elseif ($NodeCmd -and $NcmEntry) {
    $prevPort = $env:PORT
    $prevHost = $env:HOST
    $prevCors = $env:CORS_ALLOW_ORIGIN
    try {
        $env:PORT = "$GatewayPort"
        $env:HOST = '127.0.0.1'
        $env:CORS_ALLOW_ORIGIN = '*'
        $gwProc = Start-Process -FilePath $NodeCmd `
            -ArgumentList @($NcmEntry) `
            -WorkingDirectory (Split-Path $NcmEntry -Parent) `
            -WindowStyle Minimized `
            -PassThru
        Write-Host "[Gateway] Started on http://127.0.0.1:$GatewayPort (PID $($gwProc.Id))" -ForegroundColor Cyan
    } finally {
        $env:PORT = $prevPort
        $env:HOST = $prevHost
        $env:CORS_ALLOW_ORIGIN = $prevCors
    }
} else {
    Write-Warning "[Gateway] Skipped: node or @neteasecloudmusicapienhanced/api not found."
}

$VenvPython = Join-Path $BackendDir '.venv\Scripts\python.exe'
$PythonCmd = if (Test-Path $VenvPython) { $VenvPython } else { (Get-Command python -ErrorAction SilentlyContinue).Source }

if (Test-PortListening $BackendPort) {
    Write-Host "[Backend] Already listening on http://127.0.0.1:$BackendPort" -ForegroundColor Green
} elseif ($PythonCmd) {
    $pyArgs = @('-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', "$BackendPort")
    $beProc = Start-Process -FilePath $PythonCmd `
        -ArgumentList $pyArgs `
        -WorkingDirectory $BackendDir `
        -WindowStyle Minimized `
        -PassThru
    Write-Host "[Backend] Started on http://127.0.0.1:$BackendPort (PID $($beProc.Id))" -ForegroundColor Cyan
} else {
    Write-Warning "[Backend] Skipped: Python interpreter not found."
}

$NpmCmd = (Get-Command npm.cmd -ErrorAction SilentlyContinue).Source
if (Test-PortListening $FrontendPort) {
    Write-Host "[Frontend] Already listening on http://127.0.0.1:$FrontendPort" -ForegroundColor Green
} elseif ($NpmCmd -and (Test-Path (Join-Path $FrontendDir 'package.json'))) {
    $feProc = Start-Process -FilePath $NpmCmd `
        -ArgumentList @('run', 'dev', '--', '--host', '127.0.0.1', '--port', "$FrontendPort") `
        -WorkingDirectory $FrontendDir `
        -WindowStyle Minimized `
        -PassThru
    Write-Host "[Frontend] Started on http://127.0.0.1:$FrontendPort (PID $($feProc.Id))" -ForegroundColor Cyan
} else {
    Write-Warning "[Frontend] Skipped: npm.cmd or frontend/package.json not found."
}

Start-Sleep -Seconds 2
Write-Host ""
Write-Host "Service URLs:" -ForegroundColor White
Write-Host "  Netease Gateway : http://127.0.0.1:$GatewayPort"
Write-Host "  FastAPI Backend : http://127.0.0.1:$BackendPort/health"
Write-Host "  Vite Web Studio : http://127.0.0.1:$FrontendPort"
