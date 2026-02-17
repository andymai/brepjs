#!/usr/bin/env bash
# Ensures WASM runtime files exist in the brepjs-opencascade workspace package.
# These files are not tracked in git (gitignored) and are distributed via npm only.
# This script downloads them from the published npm package if they are missing.

set -e

WASM_DIR="packages/brepjs-opencascade/src"
MARKER="$WASM_DIR/brepjs_single.js"

if [ -f "$MARKER" ]; then
  exit 0
fi

echo "⬇ Downloading WASM runtime files (not tracked in git)..."
npm pack brepjs-opencascade --pack-destination /tmp --silent
tar -xzf /tmp/brepjs-opencascade-*.tgz -C /tmp
cp /tmp/package/src/*.js /tmp/package/src/*.wasm "$WASM_DIR/"
rm -rf /tmp/package /tmp/brepjs-opencascade-*.tgz
echo "✅ WASM runtime files restored to $WASM_DIR"
