#!/bin/sh
# Genera los PNG "box" por acento (ver gen-accent-icons.mjs).
root=$(dirname "$0")/..
node "$root/scripts/gen-accent-icons.mjs"
