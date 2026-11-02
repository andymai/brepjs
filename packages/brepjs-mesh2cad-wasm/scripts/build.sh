#!/usr/bin/env bash
# Builds pkg/ (committed) from the Rust crate: cargo → wasm-bindgen → wasm-opt.
# The wasm-bindgen CLI must match the crate's pinned wasm-bindgen version.
set -euo pipefail
cd "$(dirname "$0")/.."

want=$(sed -n 's/^wasm-bindgen = "=\(.*\)"/\1/p' Cargo.toml)
have=$(wasm-bindgen --version | awk '{print $2}')
if [[ "$want" != "$have" ]]; then
  echo "wasm-bindgen CLI $have does not match crate $want; run: cargo install wasm-bindgen-cli --version $want" >&2
  exit 1
fi

cargo build --release --target wasm32-unknown-unknown
wasm-bindgen --target web --out-dir pkg --out-name index \
  target/wasm32-unknown-unknown/release/brepjs_mesh2cad_wasm.wasm
if command -v wasm-opt >/dev/null; then
  wasm-opt -Os --enable-bulk-memory --enable-nontrapping-float-to-int \
    pkg/index_bg.wasm -o pkg/index_bg.wasm
fi
rm -f pkg/.gitignore pkg/package.json
ls -l pkg
