#!/usr/bin/env bash
# Ensures WASM runtime files exist in the brepjs-opencascade workspace package
# and match the version in packages/brepjs-opencascade/package.json.
#
# These files are not tracked in git (gitignored) and are distributed via npm only.
# This script downloads them from the published npm package if they are missing
# or outdated (version mismatch from a release bump).

set -e

WASM_DIR="packages/brepjs-opencascade/src"
MARKER="$WASM_DIR/brepjs_single.js"
VERSION_FILE="$WASM_DIR/.wasm-version"

# Read expected version from package.json
EXPECTED_VERSION=$(node -p "require('./packages/brepjs-opencascade/package.json').version" 2>/dev/null || echo "unknown")

# Check if files exist AND version matches
if [ -f "$MARKER" ] && [ -f "$VERSION_FILE" ]; then
  CURRENT_VERSION=$(cat "$VERSION_FILE")
  if [ "$CURRENT_VERSION" = "$EXPECTED_VERSION" ]; then
    exit 0
  fi
  echo "⬇ WASM version mismatch: have $CURRENT_VERSION, need $EXPECTED_VERSION"
fi

echo "⬇ Downloading WASM runtime files v${EXPECTED_VERSION} (not tracked in git)..."
rm -f /tmp/brepjs-opencascade-*.tgz
npm pack "brepjs-opencascade@${EXPECTED_VERSION}" --pack-destination /tmp --silent 2>/dev/null || \
  npm pack brepjs-opencascade --pack-destination /tmp --silent
tar -xzf /tmp/brepjs-opencascade-*.tgz -C /tmp
cp /tmp/package/src/*.js /tmp/package/src/*.wasm "$WASM_DIR/"
cp /tmp/package/src/*.d.ts "$WASM_DIR/" 2>/dev/null || true
echo "$EXPECTED_VERSION" > "$VERSION_FILE"
rm -rf /tmp/package /tmp/brepjs-opencascade-*.tgz
echo "✅ WASM runtime files restored to $WASM_DIR (v${EXPECTED_VERSION})"
