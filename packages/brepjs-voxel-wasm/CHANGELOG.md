# Changelog

## [0.2.4](https://github.com/andymai/brepjs/compare/brepjs-voxel-wasm-v0.2.3...brepjs-voxel-wasm-v0.2.4) (2026-06-07)


### Performance Improvements

* **voxel:** sparse tiled grid + seam-free tiled contouring ([#1249](https://github.com/andymai/brepjs/issues/1249)) ([5d5ec1e](https://github.com/andymai/brepjs/commit/5d5ec1ee5633d597db5c1c3b32a45c3b7df46b1b))

## [0.2.3](https://github.com/andymai/brepjs/compare/brepjs-voxel-wasm-v0.2.2...brepjs-voxel-wasm-v0.2.3) (2026-06-07)


### Performance Improvements

* **voxel:** narrow-band distance via a band-cutoff BVH query ([#1247](https://github.com/andymai/brepjs/issues/1247)) ([67d0840](https://github.com/andymai/brepjs/commit/67d0840a62bd1e3510b3f11054005dd28a5ba392))

## [0.2.2](https://github.com/andymai/brepjs/compare/brepjs-voxel-wasm-v0.2.1...brepjs-voxel-wasm-v0.2.2) (2026-06-07)


### Performance Improvements

* **voxel:** hierarchical Barnes-Hut FWN for the voxelize sign pass ([#1245](https://github.com/andymai/brepjs/issues/1245)) ([1c426ec](https://github.com/andymai/brepjs/commit/1c426ec34688ad696b0e3bef367ad91f369d5b26))

## [0.2.1](https://github.com/andymai/brepjs/compare/brepjs-voxel-wasm-v0.2.0...brepjs-voxel-wasm-v0.2.1) (2026-06-07)


### Performance Improvements

* **voxel:** accelerate voxelize distance pass with a BVH ([#1241](https://github.com/andymai/brepjs/issues/1241)) ([6d9a2b7](https://github.com/andymai/brepjs/commit/6d9a2b7c7351ef1e750aa1d50d483ec1900ca192))

## [0.2.0](https://github.com/andymai/brepjs/compare/brepjs-voxel-wasm-v0.1.0...brepjs-voxel-wasm-v0.2.0) (2026-06-06)


### Features

* **lattice:** add Layer-3 TPMS lattice domain ([#1152](https://github.com/andymai/brepjs/issues/1152)) ([54e714e](https://github.com/andymai/brepjs/commit/54e714e9ee67019052dc948b698b7594fdc2c346))
* **voxel:** add voxel/SDF domain foundation ([#1146](https://github.com/andymai/brepjs/issues/1146)) ([df2de27](https://github.com/andymai/brepjs/commit/df2de272d51deb8d7b9592c5bd3fe6337055fd76))
* **voxel:** brep↔voxel interop — robust CSG, offset/shell, shape conveniences ([#1154](https://github.com/andymai/brepjs/issues/1154)) ([5aaf1f2](https://github.com/andymai/brepjs/commit/5aaf1f23f59fd0886d3d6941a6f98f3c04580c82))
* **voxel:** Grid/Ops/Contour/Bridge seams (v1 repair slice) ([#1149](https://github.com/andymai/brepjs/issues/1149)) ([3ca84a0](https://github.com/andymai/brepjs/commit/3ca84a016005d28ac4970e197ba1ceb38f043b61))
