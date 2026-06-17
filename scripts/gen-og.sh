#!/usr/bin/env bash
# Regenerate the playground Open Graph PNG from its SVG source.
# Requires `rsvg-convert` (librsvg). On Debian/Ubuntu: apt install librsvg2-bin.
# On macOS: brew install librsvg.
#
# The docs card (apps/docs) is rendered separately by scripts/gen-og-docs.mjs —
# it needs headless Chrome to load Space Grotesk from Google Fonts, which
# rsvg-convert can't do. `npm run gen:og` runs both.
set -euo pipefail

if ! command -v rsvg-convert >/dev/null 2>&1; then
  echo "error: rsvg-convert not found. Install librsvg." >&2
  exit 1
fi

root="$(cd "$(dirname "$0")/.." && pwd)"

for surface in apps/playground; do
  src="${root}/${surface}/public/og.svg"
  out="${root}/${surface}/public/og.png"
  rsvg-convert -w 1200 -h 630 "$src" -o "$out"
  echo "wrote ${out}"
done
