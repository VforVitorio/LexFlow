# LexFlow dev launcher.
#
# Spawns two PowerShell windows:
#
#   * Backend (FastAPI)  → http://localhost:8000   ·  `uv run python main.py`
#   * Frontend (Vite)    → http://localhost:5173   ·  `npm run dev`
#
# Also enforces `frontend/.env.local` to the only combination that works
# in dev (Vite proxy mode, no CORS). The browser hits :5173 and Vite
# forwards `/api/*` to :8000 — see CLAUDE.md §6 ("Dev mode").
#
# Run from the repo root:
#     ./scripts/dev.ps1
#
# Stop everything: close both PowerShell windows, or Ctrl+C in each.

$ErrorActionPreference = 'Stop'

# --- 0. Sanity check: must run from the repo root --------------------------
$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $repoRoot 'pyproject.toml'))) {
    Write-Host "ERROR: scripts/dev.ps1 must run from the LexFlow repo root." -ForegroundColor Red
    Write-Host "       Expected pyproject.toml at: $repoRoot" -ForegroundColor Red
    exit 1
}
Set-Location $repoRoot

# --- 1. Force the right frontend/.env.local --------------------------------
# Setting VITE_API_URL=http://localhost:8000 makes the SPA hit :8000
# directly cross-origin → preflight OPTIONS → 405 (no CORS in dev).
# The right setup is `VITE_USE_MOCK=false` and *nothing else*, so the
# SPA uses relative `/api/*` URLs and Vite's proxy handles them.
$envPath = Join-Path $repoRoot 'frontend/.env.local'
$desired = "VITE_USE_MOCK=false`r`n"
$current = ''
if (Test-Path $envPath) { $current = Get-Content $envPath -Raw }
if ($current -ne $desired) {
    Set-Content -Path $envPath -Value $desired -NoNewline
    Write-Host "Wrote $envPath  (VITE_USE_MOCK=false; no VITE_API_URL)" -ForegroundColor Green
} else {
    Write-Host "frontend/.env.local already correct." -ForegroundColor DarkGray
}

# --- 2. Verify the basics are installed ------------------------------------
if (-not (Test-Path (Join-Path $repoRoot '.venv'))) {
    Write-Host "WARNING: no .venv yet. Run 'uv sync --all-extras' before this script." -ForegroundColor Yellow
}
if (-not (Test-Path (Join-Path $repoRoot 'frontend/node_modules'))) {
    Write-Host "WARNING: frontend/node_modules missing. Run 'npm install' inside frontend/ first." -ForegroundColor Yellow
}

# --- 3. Spawn the two servers in their own windows -------------------------
# Each child inherits the working directory we set with `-WorkingDirectory`,
# so paths inside `uv run` and `npm run dev` resolve correctly.
$backendCmd  = "Write-Host 'LexFlow backend — http://localhost:8000' -ForegroundColor Cyan; uv run python main.py"
$frontendCmd = "Write-Host 'LexFlow frontend — http://localhost:5173' -ForegroundColor Cyan; npm run dev"

Start-Process -FilePath 'powershell' `
    -ArgumentList '-NoExit', '-Command', $backendCmd `
    -WorkingDirectory $repoRoot

# Tiny delay so the backend window opens visually before the frontend one;
# Vite is happy either way, this is purely cosmetic.
Start-Sleep -Milliseconds 400

Start-Process -FilePath 'powershell' `
    -ArgumentList '-NoExit', '-Command', $frontendCmd `
    -WorkingDirectory (Join-Path $repoRoot 'frontend')

# --- 4. Summary ------------------------------------------------------------
Write-Host ""
Write-Host "Launched:" -ForegroundColor Green
Write-Host "  Backend  → http://localhost:8000   (Swagger UI at /docs)"
Write-Host "  Frontend → http://localhost:5173"
Write-Host ""
Write-Host "Stop everything by closing both PowerShell windows."
