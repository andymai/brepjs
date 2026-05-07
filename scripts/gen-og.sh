#!/usr/bin/env bash
# Regenerate Open Graph PNGs from their SVG sources.
# Requires `rsvg-convert` (librsvg). On Debian/Ubuntu: apt install librsvg2-bin.
# On macOS: brew install librsvg.
set -euo pipefail

if ! command -v rsvg-convert >/dev/null 2>&1; then
  echo "error: rsvg-convert not found. Install librsvg." >&2
  exit 1
fi

root="$(cd "$(dirname "$0")/.." && pwd)"

for surface in docs-site site; do
  src="${root}/${surface}/public/og.svg"
  out="${root}/${surface}/public/og.png"
  rsvg-convert -w 1200 -h 630 "$src" -o "$out"
  echo "wrote ${out}"
done
