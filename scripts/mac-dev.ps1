# Lanza el workflow mac-dev en la rama actual y espera a que termine.
# Uso:
#   .\scripts\mac-dev.ps1            # build de depuración (rápido)
#   .\scripts\mac-dev.ps1 -Optimized # build de release (rendimiento real)
#   .\scripts\mac-dev.ps1 -Branch mac-dev
# Requiere: gh instalado y autenticado (gh auth login).
param(
  [string]$Branch = "",
  [switch]$Optimized
)

$ErrorActionPreference = "Stop"

# --- Requisitos previos -----------------------------------------------------
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  Write-Error "No se encontró 'gh'. Instálalo (winget install GitHub.cli) y autentícate con 'gh auth login'."
}
try { gh auth status 2>$null | Out-Null }
catch { Write-Error "gh no está autenticado. Ejecuta 'gh auth login' primero." }
if ($LASTEXITCODE -ne 0) { Write-Error "gh no está autenticado. Ejecuta 'gh auth login' primero." }

# --- Rama: la actual por defecto --------------------------------------------
if ([string]::IsNullOrWhiteSpace($Branch)) {
  $Branch = (git branch --show-current).Trim()
}
if ([string]::IsNullOrWhiteSpace($Branch)) { Write-Error "No se pudo determinar la rama actual." }
$mode = if ($Optimized) { "optimized" } else { "debug" }
Write-Host "Rama: $Branch | Modo: $mode"

# --- Lanzar ------------------------------------------------------------------
$start = Get-Date
if ($Optimized) {
  gh workflow run mac-dev.yml --ref $Branch -f optimized=true
} else {
  gh workflow run mac-dev.yml --ref $Branch
}
# Dar tiempo a GitHub a registrar la ejecución antes de buscarla.
Start-Sleep -Seconds 8

# --- Localizar la ejecución recién creada -------------------------------------
$run = gh run list --workflow mac-dev.yml --branch $Branch --limit 1 --json databaseId,url,headSha |
  ConvertFrom-Json | Select-Object -First 1
if (-not $run) { Write-Error "No se encontró ninguna ejecución de mac-dev en la rama '$Branch'." }
Write-Host "Ejecución: $($run.url)"

# --- Esperar (falla si el workflow falla) -------------------------------------
gh run watch $run.databaseId --exit-status

$elapsed = (Get-Date) - $start
Write-Host ("Tiempo total: {0}m {1}s" -f [int]$elapsed.TotalMinutes, $elapsed.Seconds)
Write-Host "Descarga en el Mac con: ./scripts/mac-fetch.sh $Branch"
