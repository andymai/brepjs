#!/usr/bin/env bash
# Copy WASM + JS loader from brepjs-opencascade to public/wasm/ for dev/build
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SITE_DIR="$(dirname "$SCRIPT_DIR")"
OC_SRC="$SITE_DIR/../packages/brepjs-opencascade/src"
DEST="$SITE_DIR/public/wasm"

mkdir -p "$DEST"
cp "$OC_SRC/brepjs_single.wasm" "$DEST/"
cp "$OC_SRC/brepjs_single.js" "$DEST/"
echo "Copied WASM files to $DEST"
