<#
  Empaqueta el binario de OpenDoc (compilado con OPENDOC_STORE=1 y
  `tauri build --no-bundle`) como .msix para Microsoft Store.

  El paquete va sin firmar: la Store lo firma tras la certificación.
  Para instalarlo en local antes hay que firmarlo con un certificado propio.

  Uso:
    pwsh packaging/msix/build-msix.ps1 -Version 0.2.76 `
      -IdentityName "12345Nombre.OpenDoc" -Publisher "CN=XXXXXXXX-..." `
      -PublisherDisplayName "Nombre" -OutFile OpenDoc_0.2.76_x64.msix
#>
param(
  [Parameter(Mandatory)] [string] $Version,
  [Parameter(Mandatory)] [string] $IdentityName,
  [Parameter(Mandatory)] [string] $Publisher,
  [Parameter(Mandatory)] [string] $PublisherDisplayName,
  [Parameter(Mandatory)] [string] $OutFile,
  [string] $Exe = "src-tauri/target/release/opendoc.exe"
)
$ErrorActionPreference = "Stop"

# La Store exige 4 cifras y que la última sea 0 (la reserva para sí).
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "Versión no válida: $Version (se espera X.Y.Z)" }
$msixVersion = "$Version.0"

if (-not (Test-Path $Exe)) { throw "No existe ${Exe}: compila antes con OPENDOC_STORE=1 y --no-bundle" }

function Escape-Xml([string] $s) { [System.Security.SecurityElement]::Escape($s) }

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Resolve-Path (Join-Path $here "../..")
$layout = Join-Path ([System.IO.Path]::GetTempPath()) "opendoc-msix-$([guid]::NewGuid())"
New-Item -ItemType Directory -Path (Join-Path $layout "Assets") | Out-Null

try {
  Copy-Item $Exe (Join-Path $layout "opendoc.exe")
  foreach ($icon in "StoreLogo", "Square44x44Logo", "Square150x150Logo") {
    Copy-Item (Join-Path $root "src-tauri/icons/$icon.png") (Join-Path $layout "Assets/$icon.png")
  }

  $manifest = Get-Content -Raw (Join-Path $here "AppxManifest.xml")
  $manifest = $manifest.Replace("@IDENTITY_NAME@", (Escape-Xml $IdentityName))
  $manifest = $manifest.Replace("@PUBLISHER@", (Escape-Xml $Publisher))
  $manifest = $manifest.Replace("@PUBLISHER_DISPLAY_NAME@", (Escape-Xml $PublisherDisplayName))
  $manifest = $manifest.Replace("@VERSION@", $msixVersion)
  [System.IO.File]::WriteAllText((Join-Path $layout "AppxManifest.xml"), $manifest, [System.Text.UTF8Encoding]::new($false))

  # makeappx viene con el Windows SDK (preinstalado en windows-latest).
  $makeappx = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\makeappx.exe" |
    Sort-Object { [version]$_.Directory.Parent.Name } -Descending | Select-Object -First 1
  if (-not $makeappx) { throw "No se encontró makeappx.exe (Windows SDK)" }

  & $makeappx.FullName pack /d $layout /p $OutFile /o
  if ($LASTEXITCODE -ne 0) { throw "makeappx falló ($LASTEXITCODE)" }
  Write-Host "Creado $OutFile (versión $msixVersion)"
}
finally {
  Remove-Item -Recurse -Force $layout
}
