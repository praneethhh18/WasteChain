$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..\backend")
if (-not (Test-Path "wastechain.db")) {
  Write-Host "No DB found — running seed..." -ForegroundColor Yellow
  python -m app.seed
}
python -m uvicorn app.main:app --host 127.0.0.1 --port 8765
