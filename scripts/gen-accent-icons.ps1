# Genera los PNG "box" por acento (ver gen-accent-icons.mjs).
$root = Split-Path -Parent $PSScriptRoot
node (Join-Path $root "scripts\gen-accent-icons.mjs")
