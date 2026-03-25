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

# Read expected version from package.json (empty string on failure forces re-download)
EXPECTED_VERSION=$(node -p "require('./packages/brepjs-opencascade/package.json').version" 2>/dev/null || echo "")

# Check if files exist AND version matches (skip if version unreadable)
if [ -n "$EXPECTED_VERSION" ] && [ -f "$MARKER" ] && [ -f "$VERSION_FILE" ]; then
  CURRENT_VERSION=$(cat "$VERSION_FILE")
  if [ "$CURRENT_VERSION" = "$EXPECTED_VERSION" ]; then
    exit 0
  fi
  echo "⬇ WASM version mismatch: have $CURRENT_VERSION, need $EXPECTED_VERSION"
fi

# Use a unique temp directory to avoid race conditions on shared runners
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

echo "⬇ Downloading WASM runtime files v${EXPECTED_VERSION:-latest} (not tracked in git)..."
# Use --registry to force npm to fetch from the public registry (not the local workspace)
npm pack "brepjs-opencascade${EXPECTED_VERSION:+@$EXPECTED_VERSION}" --pack-destination "$TMPDIR" --registry https://registry.npmjs.org --silent 2>/dev/null || \
  npm pack brepjs-opencascade --pack-destination "$TMPDIR" --registry https://registry.npmjs.org --silent
tar -xzf "$TMPDIR"/brepjs-opencascade-*.tgz -C "$TMPDIR"
cp "$TMPDIR"/package/src/*.js "$TMPDIR"/package/src/*.wasm "$WASM_DIR/"
cp "$TMPDIR"/package/src/*.d.ts "$WASM_DIR/" 2>/dev/null || true
[ -n "$EXPECTED_VERSION" ] && echo "$EXPECTED_VERSION" > "$VERSION_FILE"
echo "✅ WASM runtime files restored to $WASM_DIR (v${EXPECTED_VERSION:-latest})"
