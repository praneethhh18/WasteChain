$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..\backend")
if (Test-Path "wastechain.db") { Remove-Item "wastechain.db" -Force }
python -m app.seed
