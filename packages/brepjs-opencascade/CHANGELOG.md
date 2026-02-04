# Changelog

## [0.5.1](https://github.com/andymai/brepjs/compare/brepjs-opencascade-v0.5.0...brepjs-opencascade-v0.5.1) (2026-02-04)

### Bug Fixes

- **brepjs-opencascade:** add repository field for npm provenance ([5f9edf7](https://github.com/andymai/brepjs/commit/5f9edf76f593dabb4702d5264550291d4231df7d))

## [0.5.0](https://github.com/andymai/brepjs/compare/brepjs-opencascade-v0.4.1...brepjs-opencascade-v0.5.0) (2026-02-04)

### ⚠ BREAKING CHANGES

- boolean operation and meshing performance optimizations ([#21](https://github.com/andymai/brepjs/issues/21))

### Features

- **opencascade:** add multi-threaded WASM build ([e042efd](https://github.com/andymai/brepjs/commit/e042efd61cd2d296576798f56fa24ff761ab4d51))

### Bug Fixes

- make MeshData compatible with embind copy semantics ([#15](https://github.com/andymai/brepjs/issues/15)) ([5d7cb66](https://github.com/andymai/brepjs/commit/5d7cb665afc561f21add1ffb24fa62276d51bb2e))
- **opencascade:** disable exception catching in threaded build ([c316b93](https://github.com/andymai/brepjs/commit/c316b93ae6d200cad5716299390c25069a6a63da))

### Performance Improvements

- boolean operation and meshing performance optimizations ([#21](https://github.com/andymai/brepjs/issues/21)) ([f7ce008](https://github.com/andymai/brepjs/commit/f7ce00802d23174b3d29f189554f5cc9ba8f41c6))
- bulk C++ mesh extraction with unified APIs ([#9](https://github.com/andymai/brepjs/issues/9)) ([65709bf](https://github.com/andymai/brepjs/commit/65709bf7f19eaf454da1491279e77b820409b86a))
- edge mesh caching and bulk C++ extractors ([#23](https://github.com/andymai/brepjs/issues/23)) ([347f5a3](https://github.com/andymai/brepjs/commit/347f5a35fec301a608cbdf0cad5d2c83a50d2d65))
