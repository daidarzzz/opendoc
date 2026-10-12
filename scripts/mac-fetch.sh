#!/bin/bash
# Descarga el último artefacto correcto del workflow mac-dev, lo instala en
# una carpeta fija y abre la app.
# Uso:
#   ./scripts/mac-fetch.sh            # última ejecución OK en la rama actual
#   ./scripts/mac-fetch.sh mac-dev    # última ejecución OK en esa rama
#   ./scripts/mac-fetch.sh 123456789  # artefacto de esa ejecución concreta
# Requiere: gh instalado y autenticado (gh auth login).
set -euo pipefail

DEST="$HOME/Downloads/opendoc-mac-dev"  # carpeta fija de instalación local
APP_NAME="OpenDoc.app"

# --- Requisitos previos -----------------------------------------------------
if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: no se encontró 'gh'. Instálalo (brew install gh) y autentícate con 'gh auth login'." >&2
  exit 1
fi
if ! gh auth status >/dev/null 2>&1; then
  echo "ERROR: gh no está autenticado. Ejecuta 'gh auth login' primero." >&2
  exit 1
fi

# --- Resolver ejecución: ID numérico o última OK de una rama ----------------
TARGET="${1:-$(git branch --show-current)}"
if [[ "$TARGET" =~ ^[0-9]+$ ]]; then
  RUN_ID="$TARGET"
else
  echo "Buscando última ejecución correcta de mac-dev en la rama '$TARGET'..."
  RUN_ID="$(gh run list --workflow mac-dev.yml --branch "$TARGET" --status success --limit 1 --json databaseId --jq '.[0].databaseId')"
  if [ -z "$RUN_ID" ] || [ "$RUN_ID" = "null" ]; then
    echo "ERROR: no hay ejecuciones correctas de mac-dev en la rama '$TARGET'." >&2
    echo "Lanza una desde el PC: .\\scripts\\mac-dev.ps1 -Branch $TARGET" >&2
    exit 1
  fi
fi
echo "Ejecución: $RUN_ID"

# --- Descargar artefacto ----------------------------------------------------
# El artefacto caduca a los 3 días (retention-days: 3): si falla aquí con
# "no artifacts found", probablemente caducó; relanza el workflow.
rm -rf "$DEST"
mkdir -p "$DEST"
gh run download "$RUN_ID" --pattern 'opendoc-mac-*' --dir "$DEST"

ZIP="$(echo "$DEST"/opendoc-mac-*.zip)"
if [ ! -f "$ZIP" ]; then
  echo "ERROR: no se descargó ningún zip opendoc-mac-*.zip (¿artefacto caducado?)." >&2
  exit 1
fi

# --- Descomprimir (ditto conserva permisos y metadatos macOS) ---------------
ditto -x -k "$ZIP" "$DEST"
APPS=( "$DEST"/OpenDoc*.app )
if [ "${#APPS[@]}" -ne 1 ]; then
  echo "ERROR: se esperaba exactamente un .app en $DEST, encontrados: ${#APPS[@]}" >&2
  printf '  - %s\n' "${APPS[@]}" >&2
  exit 1
fi
APP="${APPS[0]}"
rm -f "$ZIP"

# --- Cerrar instancia anterior, quitar cuarentena y abrir -------------------
if pkill -x "OpenDoc" 2>/dev/null; then
  echo "Instancia anterior de OpenDoc cerrada."
  sleep 1
fi
# Quita el atributo de cuarentena que macOS pone a lo descargado: sin esto,
# Gatekeeper bloquea la app sin firmar al primer arranque.
xattr -cr "$APP"
open "$APP"
echo "Abierto: $APP"
