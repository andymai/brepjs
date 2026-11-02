# brepjs-mesh2cad-wasm

The WebAssembly engine behind [brepjs-mesh2cad](../brepjs-mesh2cad): mesh ingest (STL, OBJ, PLY,
3MF), repair, CAD-or-scan analysis, quadric decimation, and planar region extraction, written in Rust.
It returns flat typed arrays and a JSON report; it never builds B-Rep. Use it through
`brepjs-mesh2cad` unless you are building your own pipeline.

`pkg/` is committed. Rebuild it after changing `src/`:

```bash
npm run build --workspace=brepjs-mesh2cad-wasm   # cargo → wasm-bindgen → wasm-opt
cd packages/brepjs-mesh2cad-wasm && cargo test && cargo clippy --all-targets -- -D warnings
```

The `wasm-bindgen` CLI must match the version pinned in `Cargo.toml`; the build script checks.
