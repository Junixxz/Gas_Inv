$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$venv = Join-Path $backend ".venv"

Write-Host "Starting Gas Inventory..." -ForegroundColor Cyan

if (-not (Test-Path (Join-Path $venv "Scripts\python.exe"))) {
    Write-Host "Creating Python virtual environment..."
    $python = Get-Command python -ErrorAction SilentlyContinue
    if (-not $python) {
        $python = Get-Command py -ErrorAction SilentlyContinue
        if ($python) {
            & py -3.11 -m venv $venv
        } else {
            throw "Python 3.11+ is required. Install Python, then run this launcher again."
        }
    } else {
        & $python.Source -m venv $venv
    }
    if ($LASTEXITCODE -ne 0) {
        throw "Could not create the Python virtual environment."
    }
}

$pythonExe = Join-Path $venv "Scripts\python.exe"
Write-Host "Installing backend dependencies..."
& $pythonExe -m pip install -q -r (Join-Path $backend "requirements.txt")
if ($LASTEXITCODE -ne 0) {
    throw "Could not install backend dependencies."
}

if (-not (Test-Path (Join-Path $frontend "node_modules"))) {
    Write-Host "Installing frontend dependencies..."
    & npm.cmd install --prefix $frontend
    if ($LASTEXITCODE -ne 0) {
        throw "Could not install frontend dependencies."
    }
}

if (-not (Test-Path (Join-Path $frontend ".env"))) {
    Copy-Item (Join-Path $frontend ".env.example") (Join-Path $frontend ".env")
}

Write-Host "Preparing the local SQLite database..."
Push-Location $backend
try {
    $env:DJANGO_DB_ENGINE = "sqlite"
    & $pythonExe manage.py migrate --noinput
    if ($LASTEXITCODE -ne 0) {
        throw "Database migration failed."
    }
} finally {
    Pop-Location
}

$backendCommand = "Set-Location '$backend'; `$env:DJANGO_DB_ENGINE='sqlite'; & '$pythonExe' manage.py runserver 127.0.0.1:8000"
$frontendCommand = "Set-Location '$frontend'; & npm.cmd run dev -- --host 127.0.0.1"

Write-Host "Starting backend and frontend..."
Start-Process powershell.exe -ArgumentList "-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $backendCommand
Start-Process powershell.exe -ArgumentList "-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $frontendCommand

$frontendReady = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 500
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:5173" -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -eq 200) {
            $frontendReady = $true
            break
        }
    } catch {}
}

if (-not $frontendReady) {
    throw "The frontend did not start within 15 seconds. Check the backend and frontend terminal windows."
}

Start-Process "http://127.0.0.1:5173"
Write-Host "Gas Inventory is running at http://127.0.0.1:5173" -ForegroundColor Green
