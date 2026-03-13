# Changelog

## [12.8.0](https://github.com/andymai/brepjs/compare/brepjs-v12.7.3...brepjs-v12.8.0) (2026-03-13)


### Features

* **kernel:** delegate makeTangentArc to brepkit-wasm 1.1.0 ([#507](https://github.com/andymai/brepjs/issues/507)) ([6cec1a7](https://github.com/andymai/brepjs/commit/6cec1a7d5b123b03459495467dcfdc6d34321b19))

## [12.7.3](https://github.com/andymai/brepjs/compare/brepjs-v12.7.2...brepjs-v12.7.3) (2026-03-13)


### Bug Fixes

* **kernel:** use meshEdgesAll for cross-kernel edge parity ([#491](https://github.com/andymai/brepjs/issues/491)) ([efe94b2](https://github.com/andymai/brepjs/commit/efe94b2d7859d16702197196b2f4fec91a112bca))

## [12.7.2](https://github.com/andymai/brepjs/compare/brepjs-v12.7.1...brepjs-v12.7.2) (2026-03-12)


### Bug Fixes

* normalize arc angle parameters to prevent wrong-direction interpolation ([#484](https://github.com/andymai/brepjs/issues/484)) ([afaa1b5](https://github.com/andymai/brepjs/commit/afaa1b59dacdb87e8593c5e9fcb1c3720d43b778))

## [12.7.1](https://github.com/andymai/brepjs/compare/brepjs-v12.7.0...brepjs-v12.7.1) (2026-03-12)


### Bug Fixes

* **brepkit:** resolve 12 test failures across 6 files ([#481](https://github.com/andymai/brepjs/issues/481)) ([fb283e5](https://github.com/andymai/brepjs/commit/fb283e5d683d1a6502132b4c9376da41f00b4b1e))

## [12.7.0](https://github.com/andymai/brepjs/compare/brepjs-v12.6.0...brepjs-v12.7.0) (2026-03-12)


### Features

* **brepkit:** unblock boolean, modifier, and compound ops tests ([#478](https://github.com/andymai/brepjs/issues/478)) ([700fd33](https://github.com/andymai/brepjs/commit/700fd33867925328398fa4bffb7c21e2af2f2c34))

## [12.6.0](https://github.com/andymai/brepjs/compare/brepjs-v12.5.0...brepjs-v12.6.0) (2026-03-12)


### Features

* v13 roadmap — coverage, brepkit parity, and CI fixes ([#476](https://github.com/andymai/brepjs/issues/476)) ([0c5f5b6](https://github.com/andymai/brepjs/commit/0c5f5b6194fe47c6a2fe9fc63af2607a020514b2))

## [12.5.0](https://github.com/andymai/brepjs/compare/brepjs-v12.4.0...brepjs-v12.5.0) (2026-03-11)


### Features

* **site:** upgrade to brepjs v12 with precomputed gallery meshes ([#471](https://github.com/andymai/brepjs/issues/471)) ([aac07d3](https://github.com/andymai/brepjs/commit/aac07d3774f0639e5e5a4efc58b1163914dd97f9))

## [12.4.0](https://github.com/andymai/brepjs/compare/brepjs-v12.3.0...brepjs-v12.4.0) (2026-03-11)


### Features

* **kernel:** wire remaining brepkit-wasm 1.0.5 capabilities ([#467](https://github.com/andymai/brepjs/issues/467)) ([48fc97b](https://github.com/andymai/brepjs/commit/48fc97b4206d41f3c7abde563a58a0630ac11c94))

## [12.3.0](https://github.com/andymai/brepjs/compare/brepjs-v12.2.12...brepjs-v12.3.0) (2026-03-11)


### Features

* **kernel:** wire remaining brepkit-wasm capabilities ([#464](https://github.com/andymai/brepjs/issues/464)) ([fdcbd57](https://github.com/andymai/brepjs/commit/fdcbd574f206020afe95b0b516bce2babec11eca))

## [12.2.12](https://github.com/andymai/brepjs/compare/brepjs-v12.2.11...brepjs-v12.2.12) (2026-03-11)


### Performance Improvements

* **kernel:** add compoundFuse path to BrepkitAdapter.fuseAll() ([#462](https://github.com/andymai/brepjs/issues/462)) ([3d84eef](https://github.com/andymai/brepjs/commit/3d84eefbf43d9fa72f1aeaaa43fe73759fe20bcb))

## [12.2.11](https://github.com/andymai/brepjs/compare/brepjs-v12.2.10...brepjs-v12.2.11) (2026-03-11)


### Bug Fixes

* update brepkit-wasm peer dep range to include v1.0.0 ([#454](https://github.com/andymai/brepjs/issues/454)) ([ca19fb3](https://github.com/andymai/brepjs/commit/ca19fb32308082a938fb4572d1c34a7c7b23dba1))

## [12.2.10](https://github.com/andymai/brepjs/compare/brepjs-v12.2.9...brepjs-v12.2.10) (2026-03-11)


### Bug Fixes

* **topology:** route cutAll through kernel.cutAll for batch WASM optimization ([#459](https://github.com/andymai/brepjs/issues/459)) ([d9b3a85](https://github.com/andymai/brepjs/commit/d9b3a8548eaf8ec02c2e3453cfdbe4edf8d6a712))

## [12.2.9](https://github.com/andymai/brepjs/compare/brepjs-v12.2.8...brepjs-v12.2.9) (2026-03-11)


### Performance Improvements

* **kernel:** use brepkit-wasm compoundCut for batch boolean operations ([#457](https://github.com/andymai/brepjs/issues/457)) ([8f77be0](https://github.com/andymai/brepjs/commit/8f77be0045b3c32f5d728841d8495453eb87c778))

## [12.2.8](https://github.com/andymai/brepjs/compare/brepjs-v12.2.7...brepjs-v12.2.8) (2026-03-11)


### Bug Fixes

* revert compound passthrough pending brepkit-wasm compound support ([#455](https://github.com/andymai/brepjs/issues/455)) ([a6ed8d4](https://github.com/andymai/brepjs/commit/a6ed8d407bd5fba10690212919d14109e163c2f4))

## [12.2.7](https://github.com/andymai/brepjs/compare/brepjs-v12.2.6...brepjs-v12.2.7) (2026-03-11)


### Performance Improvements

* pass compound operands directly to brepkit-wasm for batch boolean operations ([#452](https://github.com/andymai/brepjs/issues/452)) ([0f8bb43](https://github.com/andymai/brepjs/commit/0f8bb431645bd3d965f6407620d07328ecca4af6))

## [12.2.6](https://github.com/andymai/brepjs/compare/brepjs-v12.2.5...brepjs-v12.2.6) (2026-03-10)

### Performance Improvements

- **kernel:** batch tessellation via tessellateSolidGrouped ([#450](https://github.com/andymai/brepjs/issues/450)) ([a336306](https://github.com/andymai/brepjs/commit/a336306f8e36acd63ced62781aa5fc6f6b9a22d1))

## [12.2.5](https://github.com/andymai/brepjs/compare/brepjs-v12.2.4...brepjs-v12.2.5) (2026-03-10)

### Bug Fixes

- **kernel:** consolidate BrepkitHandle type export ([#448](https://github.com/andymai/brepjs/issues/448)) ([4d0aed1](https://github.com/andymai/brepjs/commit/4d0aed1d0f346a6d90585c2dff01a58ebe55cbb4))

## [12.2.4](https://github.com/andymai/brepjs/compare/brepjs-v12.2.3...brepjs-v12.2.4) (2026-03-10)

### Bug Fixes

- **kernel:** declare brepkit-wasm as optional peer dependency ([#445](https://github.com/andymai/brepjs/issues/445)) ([9a5574e](https://github.com/andymai/brepjs/commit/9a5574e28f105e174bb99b809efb6c4ab84bb4bf))

## [12.2.3](https://github.com/andymai/brepjs/compare/brepjs-v12.2.2...brepjs-v12.2.3) (2026-03-09)

### Bug Fixes

- honor caller-provided tolerances in brepkit adapter ([#441](https://github.com/andymai/brepjs/issues/441)) ([b3d0fb9](https://github.com/andymai/brepjs/commit/b3d0fb972702b825eae96ed616011400b1ab562e))

## [12.2.2](https://github.com/andymai/brepjs/compare/brepjs-v12.2.1...brepjs-v12.2.2) (2026-03-09)

### Bug Fixes

- **kernel:** remove isValid volume fallback, add strictness JSDoc (ADR-0006) ([#439](https://github.com/andymai/brepjs/issues/439)) ([f475097](https://github.com/andymai/brepjs/commit/f4750978cf7416bdacaf005522678e3be484b7cc))

## [12.2.1](https://github.com/andymai/brepjs/compare/brepjs-v12.2.0...brepjs-v12.2.1) (2026-03-09)

### Bug Fixes

- **kernel:** warn on cross-kernel BREP format incompatibility (ADR-0006) ([#437](https://github.com/andymai/brepjs/issues/437)) ([a52342d](https://github.com/andymai/brepjs/commit/a52342d537d4f854ccd43442735383f03dba4036))

## [12.2.0](https://github.com/andymai/brepjs/compare/brepjs-v12.1.0...brepjs-v12.2.0) (2026-03-09)

### Features

- **kernel:** add one-time warnings for brepkit silent degradations (ADR-0006) ([#435](https://github.com/andymai/brepjs/issues/435)) ([37b8437](https://github.com/andymai/brepjs/commit/37b843774bb812d199dd8fdd5d0f374ad700b01f))

## [12.1.0](https://github.com/andymai/brepjs/compare/brepjs-v12.0.0...brepjs-v12.1.0) (2026-03-09)

### Features

- phase 4 capability audit with behavioral diff matrix and parity tests (ADR-0006) ([#433](https://github.com/andymai/brepjs/issues/433)) ([664a5af](https://github.com/andymai/brepjs/commit/664a5af55cedeb61ff855102ca7a6cc616af0fb4))

## [12.0.0](https://github.com/andymai/brepjs/compare/brepjs-v11.1.0...brepjs-v12.0.0) (2026-03-09)

### ⚠ BREAKING CHANGES

- remove JS mesh fallback, require C++ MeshExtractor ([#429](https://github.com/andymai/brepjs/issues/429))

### Features

- remove JS mesh fallback, require C++ MeshExtractor ([#429](https://github.com/andymai/brepjs/issues/429)) ([73c32a7](https://github.com/andymai/brepjs/commit/73c32a70b3e0025a857b007e0bcb09e46d4faff7))

## [11.1.0](https://github.com/andymai/brepjs/compare/brepjs-v11.0.1...brepjs-v11.1.0) (2026-03-09)

### Features

- **errors:** add UNSUPPORTED error kind for capability gaps ([#424](https://github.com/andymai/brepjs/issues/424)) ([168e900](https://github.com/andymai/brepjs/commit/168e9004ecfbda44a62244cc0b513f61ec74033b))

## [11.0.1](https://github.com/andymai/brepjs/compare/brepjs-v11.0.0...brepjs-v11.0.1) (2026-03-09)

### Performance Improvements

- V8 CPU profile for Blueprint boolean hot-path analysis ([#421](https://github.com/andymai/brepjs/issues/421)) ([f613c8e](https://github.com/andymai/brepjs/commit/f613c8eed3b20a96e834628deb7c8d189b8bb85b))

## [11.0.0](https://github.com/andymai/brepjs/compare/brepjs-v10.0.0...brepjs-v11.0.0) (2026-03-09)

### ⚠ BREAKING CHANGES

- topological validity phantom types for compile-time safety ([#416](https://github.com/andymai/brepjs/issues/416))

### Features

- topological validity phantom types for compile-time safety ([#416](https://github.com/andymai/brepjs/issues/416)) ([0b5245e](https://github.com/andymai/brepjs/commit/0b5245ea35a832a82e95514c28df63e4e77c4b0b))

## [10.0.0](https://github.com/andymai/brepjs/compare/brepjs-v9.6.5...brepjs-v10.0.0) (2026-03-09)

### ⚠ BREAKING CHANGES

- phantom dimension types for compile-time 2D/3D safety ([#414](https://github.com/andymai/brepjs/issues/414))

### Features

- phantom dimension types for compile-time 2D/3D safety ([#414](https://github.com/andymai/brepjs/issues/414)) ([5542915](https://github.com/andymai/brepjs/commit/5542915759feea35dc1f5c7e99e540341dec2138))

## [9.6.5](https://github.com/andymai/brepjs/compare/brepjs-v9.6.4...brepjs-v9.6.5) (2026-03-08)

### Bug Fixes

- move shape creation inside benchBoth closures ([#411](https://github.com/andymai/brepjs/issues/411)) ([c036c11](https://github.com/andymai/brepjs/commit/c036c11df4340620ccc0f6f435ea834302a07740))

## [9.6.4](https://github.com/andymai/brepjs/compare/brepjs-v9.6.3...brepjs-v9.6.4) (2026-03-08)

### Bug Fixes

- overhaul benchmark suite and fix fillet/chamfer BindingError ([#409](https://github.com/andymai/brepjs/issues/409)) ([f899dc8](https://github.com/andymai/brepjs/commit/f899dc83b986fd8d0c226ee357e8f12827a7b938))

## [9.6.3](https://github.com/andymai/brepjs/compare/brepjs-v9.6.2...brepjs-v9.6.3) (2026-03-08)

### Bug Fixes

- address unreviewed PR comments from past week ([#407](https://github.com/andymai/brepjs/issues/407)) ([d6694b1](https://github.com/andymai/brepjs/commit/d6694b1f066dd36accab5ed211d74c9394940f31))

## [9.6.2](https://github.com/andymai/brepjs/compare/brepjs-v9.6.1...brepjs-v9.6.2) (2026-03-08)

### Bug Fixes

- lower line coverage threshold to 84% ([#401](https://github.com/andymai/brepjs/issues/401)) ([aa9dcec](https://github.com/andymai/brepjs/commit/aa9dcec32fd6e3911e38b760764ec6acaea5e6cf))

## [9.6.1](https://github.com/andymai/brepjs/compare/brepjs-v9.6.0...brepjs-v9.6.1) (2026-03-08)

### Bug Fixes

- improve evolution chaining and geometric face matching ([#391](https://github.com/andymai/brepjs/issues/391)) ([e534472](https://github.com/andymai/brepjs/commit/e5344729171101dbcc77fa86fe1c273502898e33))

## [9.6.0](https://github.com/andymai/brepjs/compare/brepjs-v9.5.1...brepjs-v9.6.0) (2026-03-06)

### Features

- **kernel:** integrate brepkit-wasm 0.5.2 — 89 remaining failures ([#389](https://github.com/andymai/brepjs/issues/389)) ([a93e336](https://github.com/andymai/brepjs/commit/a93e3360c1a56c3e05595b5402d389e332d61097))

## [9.5.1](https://github.com/andymai/brepjs/compare/brepjs-v9.5.0...brepjs-v9.5.1) (2026-03-06)

### Bug Fixes

- **kernel:** brepkit adapter round 2 — 97 remaining failures ([#387](https://github.com/andymai/brepjs/issues/387)) ([59d5784](https://github.com/andymai/brepjs/commit/59d578423203cf1482a217082cad6cebb8fbc85c))

## [9.5.0](https://github.com/andymai/brepjs/compare/brepjs-v9.4.1...brepjs-v9.5.0) (2026-03-06)

### Features

- **tests:** dual-kernel test matrix + brepkit-wasm 0.5.0 ([#384](https://github.com/andymai/brepjs/issues/384)) ([b9f5579](https://github.com/andymai/brepjs/commit/b9f5579e766d3eaae6ff5dcd06630311f0f8cc9c))

## [9.4.1](https://github.com/andymai/brepjs/compare/brepjs-v9.4.0...brepjs-v9.4.1) (2026-03-05)

### Bug Fixes

- **kernel:** brepkit adapter loft, sweep, and handle fixes ([#382](https://github.com/andymai/brepjs/issues/382)) ([f25bd51](https://github.com/andymai/brepjs/commit/f25bd51c55156568cdfe0bedd62f78275c1f6c48))

## [9.4.0](https://github.com/andymai/brepjs/compare/brepjs-v9.3.10...brepjs-v9.4.0) (2026-03-05)

### Features

- **kernel:** integrate brepkit-wasm 0.4.3 ([#381](https://github.com/andymai/brepjs/issues/381)) ([3986ec4](https://github.com/andymai/brepjs/commit/3986ec41c16c1737619ef0df4a6ce73b74696f20))

### Bug Fixes

- correct six bugs found in comprehensive codebase audit ([#379](https://github.com/andymai/brepjs/issues/379)) ([30cc62f](https://github.com/andymai/brepjs/commit/30cc62fc4ec2890f024819db93ad4db6d052d31b))
- **deps:** correct brepkit-wasm version to ^0.1.0 ([#378](https://github.com/andymai/brepjs/issues/378)) ([17feeac](https://github.com/andymai/brepjs/commit/17feeac59a5fb4e116dd4f9fff736ae2c1cb7e1a))
- reconcile release-please manifest for brepjs-opencascade to 0.9.0 ([#375](https://github.com/andymai/brepjs/issues/375)) ([cb4b3ca](https://github.com/andymai/brepjs/commit/cb4b3ca5d30219fcebf5a2f15e764d73e8e78762)), closes [#374](https://github.com/andymai/brepjs/issues/374)

## [9.3.10](https://github.com/andymai/brepjs/compare/brepjs-v9.3.9...brepjs-v9.3.10) (2026-03-04)

### Performance Improvements

- **wasm:** build flags, C++ extractors, and command buffer design ([#371](https://github.com/andymai/brepjs/issues/371)) ([5c591a1](https://github.com/andymai/brepjs/commit/5c591a1767d3ac80921ff38ab55273f76bfdfa81))

## [9.3.9](https://github.com/andymai/brepjs/compare/brepjs-v9.3.8...brepjs-v9.3.9) (2026-03-04)

### Bug Fixes

- **deps:** declare brepjs-opencascade ^0.9.0 peer compatibility ([#368](https://github.com/andymai/brepjs/issues/368)) ([79eeb78](https://github.com/andymai/brepjs/commit/79eeb78d601c7f819b086a4123e904c0e4d8d760))

## [9.3.8](https://github.com/andymai/brepjs/compare/brepjs-v9.3.7...brepjs-v9.3.8) (2026-03-04)

### Performance Improvements

- **wasm:** C++ extractors, build flags, and UV mesh support ([#364](https://github.com/andymai/brepjs/issues/364)) ([4f2546b](https://github.com/andymai/brepjs/commit/4f2546b79221a4de126dac680b1b4c13a407a0f6))

## [9.3.7](https://github.com/andymai/brepjs/compare/brepjs-v9.3.6...brepjs-v9.3.7) (2026-03-04)

### Performance Improvements

- batch performance optimizations for gridfinity workloads ([#362](https://github.com/andymai/brepjs/issues/362)) ([d1602bd](https://github.com/andymai/brepjs/commit/d1602bd9038c68130c2555a72d5abe80bd6b6d4e))

## [9.3.6](https://github.com/andymai/brepjs/compare/brepjs-v9.3.5...brepjs-v9.3.6) (2026-03-04)

### Performance Improvements

- **kernel:** cache default kernel lookup and skip empty evolution tracking ([#360](https://github.com/andymai/brepjs/issues/360)) ([d490601](https://github.com/andymai/brepjs/commit/d490601c49aa1680da688215d6e9ddfc80ef38fb))

## [9.3.5](https://github.com/andymai/brepjs/compare/brepjs-v9.3.4...brepjs-v9.3.5) (2026-03-03)

### Bug Fixes

- **ci:** exclude brepkit adapter from coverage thresholds ([#357](https://github.com/andymai/brepjs/issues/357)) ([f490cef](https://github.com/andymai/brepjs/commit/f490cefa8c36d46fb650a1a32cb76a6a112f9c71))

## [9.3.4](https://github.com/andymai/brepjs/compare/brepjs-v9.3.3...brepjs-v9.3.4) (2026-03-03)

### Bug Fixes

- systematic Uint32Array WASM interop bugs ([#355](https://github.com/andymai/brepjs/issues/355)) ([2eed241](https://github.com/andymai/brepjs/commit/2eed24134ce335056d6efc0489830fc812847e11))

## [9.3.3](https://github.com/andymai/brepjs/compare/brepjs-v9.3.2...brepjs-v9.3.3) (2026-03-03)

### Bug Fixes

- **kernel:** fix 14 brepkit adapter test failures ([#353](https://github.com/andymai/brepjs/issues/353)) ([eafd9b5](https://github.com/andymai/brepjs/commit/eafd9b544dd0d1d92af502a05cbc520925fd2f06))

## [9.3.2](https://github.com/andymai/brepjs/compare/brepjs-v9.3.1...brepjs-v9.3.2) (2026-03-03)

### Bug Fixes

- **kernel:** improve 2D curve methods with Newton refinement ([#350](https://github.com/andymai/brepjs/issues/350)) ([5b51e0d](https://github.com/andymai/brepjs/commit/5b51e0d0913e5026412b1028960c68c055665d7a))

## [9.3.1](https://github.com/andymai/brepjs/compare/brepjs-v9.3.0...brepjs-v9.3.1) (2026-03-03)

### Bug Fixes

- **kernel:** improve geometric fidelity for ellipses and surfaces ([#348](https://github.com/andymai/brepjs/issues/348)) ([cfcc5ab](https://github.com/andymai/brepjs/commit/cfcc5ab1108823111b670feafdd6ffb930f67da7))

## [9.3.0](https://github.com/andymai/brepjs/compare/brepjs-v9.2.2...brepjs-v9.3.0) (2026-03-03)

### Features

- **tests:** add cross-kernel test harness and agreement tests ([#346](https://github.com/andymai/brepjs/issues/346)) ([0d2ccbc](https://github.com/andymai/brepjs/commit/0d2ccbc49454174975261c8c0c3448100f7c27d9))

## [9.2.2](https://github.com/andymai/brepjs/compare/brepjs-v9.2.1...brepjs-v9.2.2) (2026-03-03)

### Bug Fixes

- **kernel:** replace bare catch blocks with diagnostic logging ([#340](https://github.com/andymai/brepjs/issues/340)) ([3c7346b](https://github.com/andymai/brepjs/commit/3c7346bbd152995b4a453f13d4d9f4ef44312fd7))

## [9.2.1](https://github.com/andymai/brepjs/compare/brepjs-v9.2.0...brepjs-v9.2.1) (2026-03-03)

### Bug Fixes

- **kernel:** update makeBoxFromCorners for origin-corner convention ([#343](https://github.com/andymai/brepjs/issues/343)) ([801d653](https://github.com/andymai/brepjs/commit/801d653ee4af4beda645d8a1ec3307aeba0c4603))

## [9.2.0](https://github.com/andymai/brepjs/compare/brepjs-v9.1.0...brepjs-v9.2.0) (2026-03-03)

### Features

- **kernel:** add BrepkitKernel type interface for WASM exports ([#336](https://github.com/andymai/brepjs/issues/336)) ([b57ebab](https://github.com/andymai/brepjs/commit/b57ebabbbd1bd405f43f3e2c09eb1ec890d96ba7))

### Bug Fixes

- **kernel:** remove solid-only constraints from 19 brepkit methods ([#338](https://github.com/andymai/brepjs/issues/338)) ([97415ff](https://github.com/andymai/brepjs/commit/97415ff45d73c81c2a4ea6ea86cba4cb695adf77))

## [9.1.0](https://github.com/andymai/brepjs/compare/brepjs-v9.0.0...brepjs-v9.1.0) (2026-03-03)

### Features

- **kernel:** add BrepkitAdapter for brepkit WASM kernel ([#334](https://github.com/andymai/brepjs/issues/334)) ([e015434](https://github.com/andymai/brepjs/commit/e0154349be8fe4569f3c88344d1878d5bd35220c))

## [9.0.0](https://github.com/andymai/brepjs/compare/brepjs-v8.8.11...brepjs-v9.0.0) (2026-03-02)

### ⚠ BREAKING CHANGES

- remove deprecated gcWithScope, gcWithObject, localGC ([#331](https://github.com/andymai/brepjs/issues/331))

### Features

- remove deprecated gcWithScope, gcWithObject, localGC ([#331](https://github.com/andymai/brepjs/issues/331)) ([d7e33e5](https://github.com/andymai/brepjs/commit/d7e33e50ad8225ff4fbafbf6adc82731e525b9c7))

## [8.8.11](https://github.com/andymai/brepjs/compare/brepjs-v8.8.10...brepjs-v8.8.11) (2026-03-02)

### Bug Fixes

- remove accidentally committed node_modules symlink ([#329](https://github.com/andymai/brepjs/issues/329)) ([121a656](https://github.com/andymai/brepjs/commit/121a656127b785801397f0171f5c5cc850963351))

## [8.8.10](https://github.com/andymai/brepjs/compare/brepjs-v8.8.9...brepjs-v8.8.10) (2026-03-02)

### Bug Fixes

- **core:** polyfill Symbol.dispose for Safari and older browsers ([#327](https://github.com/andymai/brepjs/issues/327)) ([6cb73a7](https://github.com/andymai/brepjs/commit/6cb73a75c01d39eb2c6843e226b7c2ab8684e113)), closes [#326](https://github.com/andymai/brepjs/issues/326)

## [8.8.9](https://github.com/andymai/brepjs/compare/brepjs-v8.8.8...brepjs-v8.8.9) (2026-03-02)

### Bug Fixes

- postinstall breaks consumer npm install ([#323](https://github.com/andymai/brepjs/issues/323)) ([9df2e10](https://github.com/andymai/brepjs/commit/9df2e1083d1727b1d5a0b936ef49a84e54e91810))

## [8.8.8](https://github.com/andymai/brepjs/compare/brepjs-v8.8.7...brepjs-v8.8.8) (2026-03-02)

### Bug Fixes

- **topology:** use DisposalScope in buildBSplineSurface ([#319](https://github.com/andymai/brepjs/issues/319)) ([df7b536](https://github.com/andymai/brepjs/commit/df7b536135e283b0a2e223c42cd8285401b6db7a))

## [8.8.7](https://github.com/andymai/brepjs/compare/brepjs-v8.8.6...brepjs-v8.8.7) (2026-03-02)

### Bug Fixes

- **topology:** double-free in surfaceFns, resource leak in curveFns, extrude coverage ([#317](https://github.com/andymai/brepjs/issues/317)) ([bb5d050](https://github.com/andymai/brepjs/commit/bb5d0503eb9dbf6fb7df18770a55e3b4c068a69e))

## [8.8.6](https://github.com/andymai/brepjs/compare/brepjs-v8.8.5...brepjs-v8.8.6) (2026-03-02)

### Performance Improvements

- **topology:** optimize sectionToFace O(n³)→O(n), healing/color test coverage ([#314](https://github.com/andymai/brepjs/issues/314)) ([1c497ce](https://github.com/andymai/brepjs/commit/1c497ce4341fa135083294ae5219a64c067ab465))

## [8.8.5](https://github.com/andymai/brepjs/compare/brepjs-v8.8.4...brepjs-v8.8.5) (2026-03-02)

### Performance Improvements

- **wasm,topology:** enable simd, memory tuning, iterator optimization, and test coverage ([#309](https://github.com/andymai/brepjs/issues/309)) ([c0f1e1a](https://github.com/andymai/brepjs/commit/c0f1e1a2ac6fcf0ec8df751cafd24f57ddb4b04b))

## [8.8.4](https://github.com/andymai/brepjs/compare/brepjs-v8.8.3...brepjs-v8.8.4) (2026-03-01)

### Bug Fixes

- **topology:** Result adoption, DisposalScope safety, compound ops tests ([#307](https://github.com/andymai/brepjs/issues/307)) ([1ad35d9](https://github.com/andymai/brepjs/commit/1ad35d9a29dab90557ea6983d7cf726e3768347f))

## [8.8.3](https://github.com/andymai/brepjs/compare/brepjs-v8.8.2...brepjs-v8.8.3) (2026-03-01)

### Bug Fixes

- **deps:** resolve npm audit security vulnerabilities ([#305](https://github.com/andymai/brepjs/issues/305)) ([1588306](https://github.com/andymai/brepjs/commit/15883065ca1eb8b6be76fbdea36af41423874aac))

## [8.8.2](https://github.com/andymai/brepjs/compare/brepjs-v8.8.1...brepjs-v8.8.2) (2026-03-01)

### Reverts

- **site:** remove static asset exclusions from SPA rewrite ([#301](https://github.com/andymai/brepjs/issues/301)) ([8e36342](https://github.com/andymai/brepjs/commit/8e3634207bd1e00ec4ee26dae09258ea0c5beeee))

## [8.8.1](https://github.com/andymai/brepjs/compare/brepjs-v8.8.0...brepjs-v8.8.1) (2026-03-01)

### Bug Fixes

- **site:** fix 403 on site.webmanifest ([#299](https://github.com/andymai/brepjs/issues/299)) ([53ed288](https://github.com/andymai/brepjs/commit/53ed2883fc668dae5527aec741188dbfd4ae0aca))

## [8.8.0](https://github.com/andymai/brepjs/compare/brepjs-v8.7.6...brepjs-v8.8.0) (2026-02-18)

### Features

- **build:** add bundle size tracking with size-limit ([#283](https://github.com/andymai/brepjs/issues/283)) ([ce0daf8](https://github.com/andymai/brepjs/commit/ce0daf8708db2cdf15db43b75260107c1c59e1b7))

## [8.7.6](https://github.com/andymai/brepjs/compare/brepjs-v8.7.5...brepjs-v8.7.6) (2026-02-18)

### Bug Fixes

- **test:** correct vitest 4 config and relocate benchmark ([#281](https://github.com/andymai/brepjs/issues/281)) ([424d8f9](https://github.com/andymai/brepjs/commit/424d8f94c76352ca6038b16ea70005804fff6b58))

## [8.7.5](https://github.com/andymai/brepjs/compare/brepjs-v8.7.4...brepjs-v8.7.5) (2026-02-18)

### Performance Improvements

- **boolean:** enable OCCT-internal parallelism via SetRunParallel(true) ([9b36bcd](https://github.com/andymai/brepjs/commit/9b36bcdaf69f9a01da39eaa4131a634b8d57b695))
- **gltf:** pre-allocate index arrays in computeMaterialLayout ([6aa09a5](https://github.com/andymai/brepjs/commit/6aa09a503336e210e4de3ac37f8569ab05591b52))
- **measurement:** cache measureVolumeProps/SurfaceProps/LinearProps results ([c8e327d](https://github.com/andymai/brepjs/commit/c8e327d14184c86aacc117dd496c23d8290b907c))
- **mesh:** change EdgeMesh.lines from number[] to Float32Array ([6275442](https://github.com/andymai/brepjs/commit/627544203ed1cfb2ae423429d60ba465d82d32f0))

## [8.7.4](https://github.com/andymai/brepjs/compare/brepjs-v8.7.3...brepjs-v8.7.4) (2026-02-18)

### Bug Fixes

- **ci:** bump validate-pack MAX_FILES to 450 for publish ([f293ef9](https://github.com/andymai/brepjs/commit/f293ef9ade2b832f18c4afb8d62e87bbf8c90b6f))

## [8.7.3](https://github.com/andymai/brepjs/compare/brepjs-v8.7.2...brepjs-v8.7.3) (2026-02-17)

### Bug Fixes

- **deps:** trigger release for brepjs-opencascade 0.8.x peer dep support ([#269](https://github.com/andymai/brepjs/issues/269)) ([68d09ef](https://github.com/andymai/brepjs/commit/68d09ef9dd27096bf7b4c768de4e6314a68d7574))

## [8.7.2](https://github.com/andymai/brepjs/compare/brepjs-v8.7.1...brepjs-v8.7.2) (2026-02-17)

### Bug Fixes

- **ci:** add postinstall script to ensure WASM runtime files ([#266](https://github.com/andymai/brepjs/issues/266)) ([fd38cd3](https://github.com/andymai/brepjs/commit/fd38cd3a093e0516f95156a169913b53cd9e1680))

## [8.7.1](https://github.com/andymai/brepjs/compare/brepjs-v8.7.0...brepjs-v8.7.1) (2026-02-17)

### Bug Fixes

- **ci:** add WASM download step to release-please workflow ([#264](https://github.com/andymai/brepjs/issues/264)) ([8b77ad3](https://github.com/andymai/brepjs/commit/8b77ad3a9b94d7b2b77a0e1b58a94bee0142cb7a))

## [8.7.0](https://github.com/andymai/brepjs/compare/brepjs-v8.6.2...brepjs-v8.7.0) (2026-02-17)

### Features

- add fill, section, imports, text metrics, roof, and heightmap ([#256](https://github.com/andymai/brepjs/issues/256)) ([8a55157](https://github.com/andymai/brepjs/commit/8a5515733349932f08b144f570d467046f8b5782))

## [8.6.2](https://github.com/andymai/brepjs/compare/brepjs-v8.6.1...brepjs-v8.6.2) (2026-02-17)

### Bug Fixes

- **site:** remove broken playground demos, improve mesh quality ([#259](https://github.com/andymai/brepjs/issues/259)) ([64a917c](https://github.com/andymai/brepjs/commit/64a917c3ab3bd35dce5ca65d5c23e0cd6a03a12f))

## [8.6.1](https://github.com/andymai/brepjs/compare/brepjs-v8.6.0...brepjs-v8.6.1) (2026-02-17)

### Bug Fixes

- **brepjs-opencascade:** correct license to LGPL-2.1-only ([#257](https://github.com/andymai/brepjs/issues/257)) ([a828529](https://github.com/andymai/brepjs/commit/a828529a92ba3252c62d743acbd088746305d703))

## [8.6.0](https://github.com/andymai/brepjs/compare/brepjs-v8.5.0...brepjs-v8.6.0) (2026-02-17)

### Features

- add chamfer join type to offsetWire2D ([0612820](https://github.com/andymai/brepjs/commit/06128209d5fffd6eec704a06f62b39efd8010554))
- add DXF import for LINE, CIRCLE, ARC entities ([57e664a](https://github.com/andymai/brepjs/commit/57e664a1cf10bb4b4ba25ae02ca36ca3309b1cff))
- add resize() for dimension-based scaling ([89344ad](https://github.com/andymai/brepjs/commit/89344ad81a8e29b43c01b348826db13bd95c60e9))
- add shape-attached colors with propagation ([06b9ca7](https://github.com/andymai/brepjs/commit/06b9ca71599f06a67fffc38e7e2a863ae1b94412))
- add surfaceFromGrid for height-map surfaces ([bca5d9f](https://github.com/andymai/brepjs/commit/bca5d9fcfcfe958899d12e931155b90f1e76846c))

## [8.5.0](https://github.com/andymai/brepjs/compare/brepjs-v8.4.0...brepjs-v8.5.0) (2026-02-17)

### Features

- add polyhedron, sweep extensions, face tags, assembly mates ([#253](https://github.com/andymai/brepjs/issues/253)) ([3e07a16](https://github.com/andymai/brepjs/commit/3e07a1647c59a32da6de45d9729dbd5b48aca823))

## [8.4.0](https://github.com/andymai/brepjs/compare/brepjs-v8.3.0...brepjs-v8.4.0) (2026-02-17)

### Features

- add hull and minkowski operations ([#251](https://github.com/andymai/brepjs/issues/251)) ([a5571fd](https://github.com/andymai/brepjs/commit/a5571fda422cd6781e1b16bd16deabdd379dc551))

## [8.3.0](https://github.com/andymai/brepjs/compare/brepjs-v8.2.0...brepjs-v8.3.0) (2026-02-16)

### Features

- add face origin provenance tracking ([#248](https://github.com/andymai/brepjs/issues/248)) ([f01e856](https://github.com/andymai/brepjs/commit/f01e8569e627795440e40983cc2b0d87293041f6))

## [8.2.0](https://github.com/andymai/brepjs/compare/brepjs-v8.1.1...brepjs-v8.2.0) (2026-02-16)

### Features

- add applyMatrix for 4x4 affine transforms ([#245](https://github.com/andymai/brepjs/issues/245)) ([ea70442](https://github.com/andymai/brepjs/commit/ea70442ac7647306f3a2c79735188efdb1d125f1))

## [8.1.1](https://github.com/andymai/brepjs/compare/brepjs-v8.1.0...brepjs-v8.1.1) (2026-02-13)

### Bug Fixes

- add EmscriptenModuleConfig to WASM init type declarations ([#233](https://github.com/andymai/brepjs/issues/233)) ([30cabee](https://github.com/andymai/brepjs/commit/30cabeee362224ec0ba0c73a226c721fa3df608a))

## [8.1.0](https://github.com/andymai/brepjs/compare/brepjs-v8.0.4...brepjs-v8.1.0) (2026-02-12)

### Features

- add composeTransforms and transformCopy API ([#231](https://github.com/andymai/brepjs/issues/231)) ([b4acf4e](https://github.com/andymai/brepjs/commit/b4acf4e1a7da25de6ad3ccc6a329eb8ace138e1d))

## [8.0.4](https://github.com/andymai/brepjs/compare/brepjs-v8.0.3...brepjs-v8.0.4) (2026-02-12)

### Performance Improvements

- optimize adjacency, distance queries, and rectangular pattern ([#229](https://github.com/andymai/brepjs/issues/229)) ([02c4645](https://github.com/andymai/brepjs/commit/02c46457c85477f2ec2f6fa5238c2c61b7dfd5da))

## [8.0.3](https://github.com/andymai/brepjs/compare/brepjs-v8.0.2...brepjs-v8.0.3) (2026-02-12)

### Performance Improvements

- optimize OCCT engine internals ([#227](https://github.com/andymai/brepjs/issues/227)) ([ac46a92](https://github.com/andymai/brepjs/commit/ac46a928398f24e5fefd7aaccdd356634ef89bdc))

## [8.0.2](https://github.com/andymai/brepjs/compare/brepjs-v8.0.1...brepjs-v8.0.2) (2026-02-11)

### Performance Improvements

- add simplePipe, sweep tuning, and .fuseAll() chain API ([#225](https://github.com/andymai/brepjs/issues/225)) ([060dfe7](https://github.com/andymai/brepjs/commit/060dfe7cf4ea7d8c3a85d47eb991817987371b0b))

## [8.0.1](https://github.com/andymai/brepjs/compare/brepjs-v8.0.0...brepjs-v8.0.1) (2026-02-11)

### Bug Fixes

- **site:** use correct CodeQL inline suppression format ([#221](https://github.com/andymai/brepjs/issues/221)) ([a2b3c3d](https://github.com/andymai/brepjs/commit/a2b3c3de05bb8b2a9174795e7851bfe6a9ce58e3))

## [8.0.0](https://github.com/andymai/brepjs/compare/brepjs-v7.5.0...brepjs-v8.0.0) (2026-02-11)

### ⚠ BREAKING CHANGES

- remove deprecated APIs and legacy types for v8.0.0

### Features

- remove deprecated APIs and legacy types for v8.0.0 ([a0a0995](https://github.com/andymai/brepjs/commit/a0a0995153573ebc69ea10f91c6418a916ef9afb))

## [7.5.0](https://github.com/andymai/brepjs/compare/brepjs-v7.4.2...brepjs-v7.5.0) (2026-02-10)

### Features

- **box:** add `at` and `centered` options, deprecate `center` ([#216](https://github.com/andymai/brepjs/issues/216)) ([9c2496e](https://github.com/andymai/brepjs/commit/9c2496e8236a461f576b7eb89732ca2dc633e3a4))

### Bug Fixes

- **lint:** use strict equality in box() center normalization ([1204a95](https://github.com/andymai/brepjs/commit/1204a95d18afa5bb835953b36b5d4ee45f5122e3))

## [7.4.2](https://github.com/andymai/brepjs/compare/brepjs-v7.4.1...brepjs-v7.4.2) (2026-02-09)

### Bug Fixes

- **plugin:** resolve critical issues for publication ([#208](https://github.com/andymai/brepjs/issues/208)) ([01df4d6](https://github.com/andymai/brepjs/commit/01df4d6567a595ceef5dd0548a3e32d721578079))
- **plugin:** simplify plugin.json to match Claude Code schema ([#211](https://github.com/andymai/brepjs/issues/211)) ([c834d85](https://github.com/andymai/brepjs/commit/c834d8546d45bc936b2501313b925118d69b3c7e))

### Reverts

- remove brepjs-plugin (not ready) ([#213](https://github.com/andymai/brepjs/issues/213)) ([18a2b3a](https://github.com/andymai/brepjs/commit/18a2b3ae6e9d4d0216a1fb63a859a4603a081ac6))

## [7.4.1](https://github.com/andymai/brepjs/compare/brepjs-v7.4.0...brepjs-v7.4.1) (2026-02-08)

### Bug Fixes

- **playground:** resolve SharedArrayBuffer and WASM loading issues ([#206](https://github.com/andymai/brepjs/issues/206)) ([84b6123](https://github.com/andymai/brepjs/commit/84b6123fa6399bc00efdebe8c1d52e1ea0e7602d))

## [7.4.0](https://github.com/andymai/brepjs/compare/brepjs-v7.3.0...brepjs-v7.4.0) (2026-02-08)

### Features

- **playground:** add automatic worker crash recovery ([0f66d61](https://github.com/andymai/brepjs/commit/0f66d615739f2502fb013ad1d16c1174c34acc3d))
- **playground:** add execution cancellation for iterative editing ([1d5a1a5](https://github.com/andymai/brepjs/commit/1d5a1a5bf09a5a879b8c7414c908bc3491808527))

### Bug Fixes

- **playground:** add runtime safety to WASM preloading and worker init ([f7bf7f8](https://github.com/andymai/brepjs/commit/f7bf7f8f2418635414776211b3f60b0c3aee48c2))

### Performance Improvements

- **playground:** optimize code execution speed for iterative development ([c3e3325](https://github.com/andymai/brepjs/commit/c3e33254e63cc9e9265e23410865a39f01e791c8))

## [7.3.0](https://github.com/andymai/brepjs/compare/brepjs-v7.2.0...brepjs-v7.3.0) (2026-02-08)

### Features

- accept ShapeFinder directly in fillet/chamfer/shell ([ac5a0f5](https://github.com/andymai/brepjs/commit/ac5a0f5c207236e033cd03a79ea4d9f9b3760914))
- add .done() method to wrapper as alias for .val ([042771f](https://github.com/andymai/brepjs/commit/042771fc78bf6e9eb7901f86d94e2947e4e9e087))
- add clean 2D API naming aliases ([a6b74ba](https://github.com/andymai/brepjs/commit/a6b74ba1194a46f8ce48490e11376854609e1af9))
- add OCCT error translation layer ([7c665c3](https://github.com/andymai/brepjs/commit/7c665c36f77b2d99747cfec8b221afb85a73ed56))
- add suggestion field to BrepError ([781ecc9](https://github.com/andymai/brepjs/commit/781ecc9ce9b1a2eecff395d6aec4dc5748869dd4))
- add volumeProps() and surfaceProps() to wrapper ([85c6f41](https://github.com/andymai/brepjs/commit/85c6f41960096a7875689a32fa7f552efce0cdd5))
- add white strokes to logo geometric shapes ([#194](https://github.com/andymai/brepjs/issues/194)) ([f7c9cb1](https://github.com/andymai/brepjs/commit/f7c9cb1787c6f8488aa1453b2d79b07db8bff1f1))
- pre-commit hook improvements to close quality gaps and improve performance ([#195](https://github.com/andymai/brepjs/issues/195)) ([c2fa973](https://github.com/andymai/brepjs/commit/c2fa973482f590843eeeab7c196da99cbb332f70))
- standardize Config → Options naming for consistency ([fdd8e02](https://github.com/andymai/brepjs/commit/fdd8e02cf8f743976570d0d9781bd444f16efbc5))
- update loading skeleton logo with geometric design ([25db27a](https://github.com/andymai/brepjs/commit/25db27a32449416d6b692e6d9bfd05d508d46b92))

### Bug Fixes

- increase stroke width on PWA icons for better visibility ([898d496](https://github.com/andymai/brepjs/commit/898d496ba641b733d404860d1415e84d6d79a986))
- regenerate PWA icons with white stroke logo ([f469dc1](https://github.com/andymai/brepjs/commit/f469dc18786ffc666c4bfdb16ae8d02bd57987d5))

## [7.2.0](https://github.com/andymai/brepjs/compare/brepjs-v7.1.0...brepjs-v7.2.0) (2026-02-08)

### Features

- standardize parameter naming to `at` and `axis` ([#191](https://github.com/andymai/brepjs/issues/191)) ([90a3ace](https://github.com/andymai/brepjs/commit/90a3ace641d656b878cea6a49073b68030cf6d6f))
- standardize parameter naming to `at` and `axis` ([#191](https://github.com/andymai/brepjs/issues/191)) ([85885c2](https://github.com/andymai/brepjs/commit/85885c27f1761a5bcec8d8877210754536cf53ac))

## [7.1.0](https://github.com/andymai/brepjs/compare/brepjs-v7.0.0...brepjs-v7.1.0) (2026-02-08)

### Features

- complete wrapper API and improve consistency ([#188](https://github.com/andymai/brepjs/issues/188)) ([bc180b3](https://github.com/andymai/brepjs/commit/bc180b380fd6dd523f5eb7f38d92c9c717b8c9a0))

## [7.0.0](https://github.com/andymai/brepjs/compare/brepjs-v6.0.0...brepjs-v7.0.0) (2026-02-08)

### ⚠ BREAKING CHANGES

- remove all legacy API names and pipe() wrapper ([#186](https://github.com/andymai/brepjs/issues/186))

### Features

- remove all legacy API names and pipe() wrapper ([#186](https://github.com/andymai/brepjs/issues/186)) ([7d2f06c](https://github.com/andymai/brepjs/commit/7d2f06ca0f31c8555cc4e64ff71f5935580ed9a2)), closes [#183](https://github.com/andymai/brepjs/issues/183)

## [6.0.0](https://github.com/andymai/brepjs/compare/brepjs-v5.0.0...brepjs-v6.0.0) (2026-02-07)

### ⚠ BREAKING CHANGES

- remove all deprecated APIs ([#183](https://github.com/andymai/brepjs/issues/183))

### Features

- remove all deprecated APIs ([#183](https://github.com/andymai/brepjs/issues/183)) ([8e7ee85](https://github.com/andymai/brepjs/commit/8e7ee8525b50ee85271d7d59eae7df83191ce209))

## [5.0.0](https://github.com/andymai/brepjs/compare/brepjs-v4.29.3...brepjs-v5.0.0) (2026-02-07)

### ⚠ BREAKING CHANGES

- Remove all deprecated code with no migration path.

### Features

- remove all deprecated APIs ([a0a3f6c](https://github.com/andymai/brepjs/commit/a0a3f6c95743dc1716cf1a694c8679376df2cabe))

## [4.29.3](https://github.com/andymai/brepjs/compare/brepjs-v4.29.2...brepjs-v4.29.3) (2026-02-07)

### Bug Fixes

- **site:** regenerate Monaco types with v5 API ([5bad513](https://github.com/andymai/brepjs/commit/5bad513fb42edc2c54cc693650da7ea910450d72))

## [4.29.2](https://github.com/andymai/brepjs/compare/brepjs-v4.29.1...brepjs-v4.29.2) (2026-02-07)

### Bug Fixes

- **site:** pin brepjs &gt;=4.29.0 for v5 API ([1291971](https://github.com/andymai/brepjs/commit/12919710b2065c02c0b6163e4d7d863a0d930139))

## [4.29.1](https://github.com/andymai/brepjs/compare/brepjs-v4.29.0...brepjs-v4.29.1) (2026-02-07)

### Bug Fixes

- trigger redeploy with brepjs 4.29.0 ([041e8ea](https://github.com/andymai/brepjs/commit/041e8ea829adaf323973609b36db81eb24e42889))

## [4.29.0](https://github.com/andymai/brepjs/compare/brepjs-v4.28.0...brepjs-v4.29.0) (2026-02-07)

### Features

- **site:** update playground examples to v5 API ([#177](https://github.com/andymai/brepjs/issues/177)) ([c1c2a0c](https://github.com/andymai/brepjs/commit/c1c2a0c1e7b911fda540b07c7e79ce719449fed0))

## [4.28.0](https://github.com/andymai/brepjs/compare/brepjs-v4.27.1...brepjs-v4.28.0) (2026-02-07)

### Features

- **site:** comprehensive site review overhaul ([#172](https://github.com/andymai/brepjs/issues/172)) ([550636d](https://github.com/andymai/brepjs/commit/550636d66b075d37ef6311774c17d7b1d2a43759))

### Bug Fixes

- replace removed API aliases and improve CI portability ([#175](https://github.com/andymai/brepjs/issues/175)) ([9d2254f](https://github.com/andymai/brepjs/commit/9d2254f0a618fe842c6c1f32028a3125121ef796))

## [4.27.1](https://github.com/andymai/brepjs/compare/brepjs-v4.27.0...brepjs-v4.27.1) (2026-02-07)

### Bug Fixes

- address PR review comments from PRs [#139](https://github.com/andymai/brepjs/issues/139)–[#166](https://github.com/andymai/brepjs/issues/166) ([#170](https://github.com/andymai/brepjs/issues/170)) ([727c577](https://github.com/andymai/brepjs/commit/727c5778fd6a307eca85f2730d740d56e12218d2))

## [4.27.0](https://github.com/andymai/brepjs/compare/brepjs-v4.26.0...brepjs-v4.27.0) (2026-02-07)

### Features

- add SVG preview gallery to README (Visual Examples 9→10) ([#168](https://github.com/andymai/brepjs/issues/168)) ([4ebb0a3](https://github.com/andymai/brepjs/commit/4ebb0a3ae1d3bd604332cbc7dbed5104b0bb2f38))

## [4.26.0](https://github.com/andymai/brepjs/compare/brepjs-v4.25.0...brepjs-v4.26.0) (2026-02-07)

### Features

- split brepjs/core into focused sub-paths (API Organization 9→10) ([#166](https://github.com/andymai/brepjs/issues/166)) ([d3abd35](https://github.com/andymai/brepjs/commit/d3abd3547d20199481431cf906790d8a4b1444d7))

## [4.25.0](https://github.com/andymai/brepjs/compare/brepjs-v4.24.0...brepjs-v4.25.0) (2026-02-07)

### Features

- remove legacy aliases from barrel exports (Naming 10/10) ([#164](https://github.com/andymai/brepjs/issues/164)) ([c0a221c](https://github.com/andymai/brepjs/commit/c0a221c79a42b8f746e1f2bbaee66e1eba1e740a))

## [4.24.0](https://github.com/andymai/brepjs/compare/brepjs-v4.23.0...brepjs-v4.24.0) (2026-02-07)

### Features

- brepjs/quick auto-init entry point and learning resources (Learning Curve 6→10) ([#162](https://github.com/andymai/brepjs/issues/162)) ([bef5805](https://github.com/andymai/brepjs/commit/bef5805b372ecf94c90ca3c3a0af79c3a64cd428))

## [4.23.0](https://github.com/andymai/brepjs/compare/brepjs-v4.22.0...brepjs-v4.23.0) (2026-02-07)

### Features

- visual output examples and browser viewer (Examples Quality 8→10) ([#160](https://github.com/andymai/brepjs/issues/160)) ([e8d12db](https://github.com/andymai/brepjs/commit/e8d12db91783db4715daf601a234d59d7440c2fc))

## [4.22.0](https://github.com/andymai/brepjs/compare/brepjs-v4.21.3...brepjs-v4.22.0) (2026-02-07)

### Features

- hosted TypeDoc API reference and function lookup table (API Discoverability 8→10) ([#157](https://github.com/andymai/brepjs/issues/157)) ([2d3dd8b](https://github.com/andymai/brepjs/commit/2d3dd8bb12523b97c1d4ab20be103296f7f621a3))

## [4.21.3](https://github.com/andymai/brepjs/compare/brepjs-v4.21.2...brepjs-v4.21.3) (2026-02-07)

### Bug Fixes

- **ci:** use correct release-please output key for root package ([b5fc4f0](https://github.com/andymai/brepjs/commit/b5fc4f0a5875d7b4f1a49acac3ac1fa5a3df0320))

## [4.21.2](https://github.com/andymai/brepjs/compare/brepjs-v4.21.1...brepjs-v4.21.2) (2026-02-07)

### Bug Fixes

- address Vercel build warnings ([d92da72](https://github.com/andymai/brepjs/commit/d92da72e186f1b6d0a6ea64efed98aaca4bbe0e3))

## [4.21.1](https://github.com/andymai/brepjs/compare/brepjs-v4.21.0...brepjs-v4.21.1) (2026-02-07)

### Bug Fixes

- **vercel:** use cd instead of -w flag for build command ([60ddc5f](https://github.com/andymai/brepjs/commit/60ddc5f94c46d13a9cb29de94f4d364f4d0251a1))

## [4.21.0](https://github.com/andymai/brepjs/compare/brepjs-v4.20.0...brepjs-v4.21.0) (2026-02-07)

### Features

- null-shape pre-validation for measurement and interference (Type Safety 9→10) ([#152](https://github.com/andymai/brepjs/issues/152)) ([1fadec4](https://github.com/andymai/brepjs/commit/1fadec43558e8e6915926df92cd6a5a5aee67d4a))

## [4.20.0](https://github.com/andymai/brepjs/compare/brepjs-v4.19.0...brepjs-v4.20.0) (2026-02-07)

### Features

- add pre-validation and improve error context (Error Handling 8→10) ([#149](https://github.com/andymai/brepjs/issues/149)) ([2cd9ee7](https://github.com/andymai/brepjs/commit/2cd9ee75d547f749bfa0efb2ace1ddf9cce8136d))

## [4.19.0](https://github.com/andymai/brepjs/compare/brepjs-v4.18.5...brepjs-v4.19.0) (2026-02-07)

### Features

- add sub-path imports and Which API guide (Discoverability 7→10) ([#143](https://github.com/andymai/brepjs/issues/143)) ([02e2d14](https://github.com/andymai/brepjs/commit/02e2d14c3c5873cf4e6f9d24820ad26f10277d0f))
- split find() into findAll() and findUnique() (Type Safety 8→10) ([#147](https://github.com/andymai/brepjs/issues/147)) ([ae0dd9f](https://github.com/andymai/brepjs/commit/ae0dd9f91ae3b129b9b1602fb06ef944108ca4fc))
- symmetric boolean naming and remove deprecated barrel exports (Naming 9→10) ([#148](https://github.com/andymai/brepjs/issues/148)) ([63444be](https://github.com/andymai/brepjs/commit/63444be0366c96baf7456aff297596749139c901))

## [4.18.5](https://github.com/andymai/brepjs/compare/brepjs-v4.18.4...brepjs-v4.18.5) (2026-02-07)

### Bug Fixes

- unify finder API with immutable cornerFinder() factory ([#139](https://github.com/andymai/brepjs/issues/139)) ([07fdb8a](https://github.com/andymai/brepjs/commit/07fdb8a77b88700bde03dca7f832332c9c3e870c))

## [4.18.4](https://github.com/andymai/brepjs/compare/brepjs-v4.18.3...brepjs-v4.18.4) (2026-02-07)

### Bug Fixes

- consistent Result returns for error handling ([#137](https://github.com/andymai/brepjs/issues/137)) ([65cdfd6](https://github.com/andymai/brepjs/commit/65cdfd60bedf3d22e02245d1fc43b11c1091bcc7))

## [4.18.3](https://github.com/andymai/brepjs/compare/brepjs-v4.18.2...brepjs-v4.18.3) (2026-02-07)

### Bug Fixes

- improve naming clarity, remove castShape ceremony ([#135](https://github.com/andymai/brepjs/issues/135)) ([15427fc](https://github.com/andymai/brepjs/commit/15427fc7c8786147aa672e1346b1e8a17e05e351))

## [4.18.2](https://github.com/andymai/brepjs/compare/brepjs-v4.18.1...brepjs-v4.18.2) (2026-02-07)

### Bug Fixes

- narrow AnyShape params to precise branded types ([#133](https://github.com/andymai/brepjs/issues/133)) ([d0ddae7](https://github.com/andymai/brepjs/commit/d0ddae774443e3f3558a6c85dc481fcf255ba535))

## [4.18.1](https://github.com/andymai/brepjs/compare/brepjs-v4.18.0...brepjs-v4.18.1) (2026-02-07)

### Bug Fixes

- resolve CodeQL security alerts ([#131](https://github.com/andymai/brepjs/issues/131)) ([f13e1a2](https://github.com/andymai/brepjs/commit/f13e1a27b932ea9d3516c4a97e43e16ad688d448))

## [4.18.0](https://github.com/andymai/brepjs/compare/brepjs-v4.17.1...brepjs-v4.18.0) (2026-02-07)

### Features

- **site:** playground UX overhaul ([#122](https://github.com/andymai/brepjs/issues/122)) ([ff581c3](https://github.com/andymai/brepjs/commit/ff581c3d5fb77fbe933ba1d4c9eb417cbbb478af))

### Bug Fixes

- **site:** address PR [#122](https://github.com/andymai/brepjs/issues/122) feedback ([#125](https://github.com/andymai/brepjs/issues/125)) ([2ba4137](https://github.com/andymai/brepjs/commit/2ba4137035b8f8637fcbf7e082ec0b81685483d2))

## [4.17.1](https://github.com/andymai/brepjs/compare/brepjs-v4.17.0...brepjs-v4.17.1) (2026-02-06)

### Bug Fixes

- **site:** use npm packages for Vercel deployment ([#120](https://github.com/andymai/brepjs/issues/120)) ([cd03716](https://github.com/andymai/brepjs/commit/cd03716141b5dc33294079af8759fdfb5863db0c))

## [4.17.0](https://github.com/andymai/brepjs/compare/brepjs-v4.16.0...brepjs-v4.17.0) (2026-02-06)

### Features

- **site:** landing page + playground with spiral staircase hero ([#110](https://github.com/andymai/brepjs/issues/110)) ([55cacd3](https://github.com/andymai/brepjs/commit/55cacd395c29cfdd4447a8072d82325581543325))

## [4.16.0](https://github.com/andymai/brepjs/compare/brepjs-v4.15.0...brepjs-v4.16.0) (2026-02-06)

### Features

- quick wins phase 2 + comprehensive llms.txt rewrite ([#111](https://github.com/andymai/brepjs/issues/111)) ([1ff2f30](https://github.com/andymai/brepjs/commit/1ff2f30242e0e03bf3015abddd909435b1a9f879))

## [4.15.0](https://github.com/andymai/brepjs/compare/brepjs-v4.14.0...brepjs-v4.15.0) (2026-02-06)

### Features

- add quick wins — kernelCall, pipeline, BSpline curves, 3MF export, SVG import, and more ([#108](https://github.com/andymai/brepjs/issues/108)) ([7c48763](https://github.com/andymai/brepjs/commit/7c48763951ecfb321ab6f5b09a8c720f0807e8ec))

## [4.14.0](https://github.com/andymai/brepjs/compare/brepjs-v4.13.0...brepjs-v4.14.0) (2026-02-06)

### Features

- add auto-healing pipeline and surface curvature ([#100](https://github.com/andymai/brepjs/issues/100)) ([2d2ac6e](https://github.com/andymai/brepjs/commit/2d2ac6e2f4f3b014c06e72b408971008c67121a1))

## [4.13.0](https://github.com/andymai/brepjs/compare/brepjs-v4.12.0...brepjs-v4.13.0) (2026-02-06)

### Features

- add glTF PBR materials and DXF export ([#99](https://github.com/andymai/brepjs/issues/99)) ([85c7abe](https://github.com/andymai/brepjs/commit/85c7abe47e565bc3cf05aa1e2e3659d3b1bd5d12))

## [4.12.0](https://github.com/andymai/brepjs/compare/brepjs-v4.11.0...brepjs-v4.12.0) (2026-02-06)

### Features

- add vertex finder and topology query functions ([#97](https://github.com/andymai/brepjs/issues/97)) ([8031fa2](https://github.com/andymai/brepjs/commit/8031fa2d6b235596063619da6159557d26d5a6fc))

## [4.11.0](https://github.com/andymai/brepjs/compare/brepjs-v4.10.0...brepjs-v4.11.0) (2026-02-06)

### Features

- add slicing, measurement aliases, topo caching, AbortSignal ([#96](https://github.com/andymai/brepjs/issues/96)) ([47e5aef](https://github.com/andymai/brepjs/commit/47e5aefd99fa201a5ae11c370bab13e7ed3980b9))

## [4.10.0](https://github.com/andymai/brepjs/compare/brepjs-v4.9.0...brepjs-v4.10.0) (2026-02-06)

### Features

- add healing ops, point-in-face, and splitter to kernel ([#103](https://github.com/andymai/brepjs/issues/103)) ([9e27811](https://github.com/andymai/brepjs/commit/9e27811a1db3dd52eccba850765eee313ee34744))
- promote isValid, sew, offsetWire2D, distance into kernel ([#94](https://github.com/andymai/brepjs/issues/94)) ([37ca207](https://github.com/andymai/brepjs/commit/37ca207fbf37f7ff31d0c85f20f09e6367d9204b))

## [4.9.0](https://github.com/andymai/brepjs/compare/brepjs-v4.8.0...brepjs-v4.9.0) (2026-02-06)

### Features

- improve error handling and add deprecation tags ([#98](https://github.com/andymai/brepjs/issues/98)) ([918ff5b](https://github.com/andymai/brepjs/commit/918ff5bac559c160de78e2116c515522f4b312c2))

## [4.8.0](https://github.com/andymai/brepjs/compare/brepjs-v4.7.1...brepjs-v4.8.0) (2026-02-06)

### Features

- add IGES import/export support ([#90](https://github.com/andymai/brepjs/issues/90)) ([e6b75d4](https://github.com/andymai/brepjs/commit/e6b75d432180ec1a380d58b8ed3fd86401bd94b3))
- add parametric history module ([#89](https://github.com/andymai/brepjs/issues/89)) ([baad772](https://github.com/andymai/brepjs/commit/baad77215aa29c0d8403dd1012fe3e2a4740c100))
- add web worker protocol and helpers ([#91](https://github.com/andymai/brepjs/issues/91)) ([a7f4f06](https://github.com/andymai/brepjs/commit/a7f4f0676975222705279f9f1f44e8bd60b26924))

## [4.7.1](https://github.com/andymai/brepjs/compare/brepjs-v4.7.0...brepjs-v4.7.1) (2026-02-06)

### Bug Fixes

- widen brepjs-opencascade version range to accept 0.6.0 ([577e783](https://github.com/andymai/brepjs/commit/577e78306b06d5b52476f6b4f7f193674112c5f3))

## [4.7.0](https://github.com/andymai/brepjs/compare/brepjs-v4.6.0...brepjs-v4.7.0) (2026-02-06)

### Features

- add AbortSignal cancellation to long-running operations ([#79](https://github.com/andymai/brepjs/issues/79)) ([0031823](https://github.com/andymai/brepjs/commit/00318230a078b8616f2965dcde0291b79e11dc44))
- functional modifier operations (fillet, chamfer, shell, offset) ([#75](https://github.com/andymai/brepjs/issues/75)) ([8710738](https://github.com/andymai/brepjs/commit/8710738fb41ce5d94d4a1fe22c875b5932f2ef9b))
- shape healing and validation functions ([#77](https://github.com/andymai/brepjs/issues/77)) ([f783842](https://github.com/andymai/brepjs/commit/f7838423ee30e9d5b4ba938fe01c141b5304a723))
- topology adjacency queries ([#76](https://github.com/andymai/brepjs/issues/76)) ([4752fa3](https://github.com/andymai/brepjs/commit/4752fa3cf75dff8bfc9e077f4c4c981ffff1be54))
- type OcShape as TopoDS_Shape instead of any ([#78](https://github.com/andymai/brepjs/issues/78)) ([6112bc7](https://github.com/andymai/brepjs/commit/6112bc732d07134dd38e46bb84f132025d5b9ba3))

## [4.6.0](https://github.com/andymai/brepjs/compare/brepjs-v4.5.0...brepjs-v4.6.0) (2026-02-06)

### Features

- add glTF 2.0 and GLB export ([#69](https://github.com/andymai/brepjs/issues/69)) ([e16be4b](https://github.com/andymai/brepjs/commit/e16be4bf8e959e6c8d6950938cd9db30e5b07de5))
- add immutable assembly graph for shape hierarchies ([#70](https://github.com/andymai/brepjs/issues/70)) ([a4d1bd5](https://github.com/andymai/brepjs/commit/a4d1bd53d4904592a83d5df10c84c7fc6697de3d))
- add interference detection between shapes ([#73](https://github.com/andymai/brepjs/issues/73)) ([b03708c](https://github.com/andymai/brepjs/commit/b03708c10b2f5159904189a2427a573afa5d70a4))
- add subpath exports for core, query, and measurement ([#71](https://github.com/andymai/brepjs/issues/71)) ([f1d21db](https://github.com/andymai/brepjs/commit/f1d21db30a33102dabf5fe21c92ef9467fe340e0))
- add UV texture coordinates to mesh output ([#72](https://github.com/andymai/brepjs/issues/72)) ([bffbd9b](https://github.com/andymai/brepjs/commit/bffbd9ba0db5bbbfc1910103968de83ee78368c6))

## [4.5.0](https://github.com/andymai/brepjs/compare/brepjs-v4.4.0...brepjs-v4.5.0) (2026-02-06)

### Features

- add wireFinder() immutable wire query builder ([#67](https://github.com/andymai/brepjs/issues/67)) ([6bafa6d](https://github.com/andymai/brepjs/commit/6bafa6de12e5c15b17078b5fd57cee14df6aef28))

## [4.4.0](https://github.com/andymai/brepjs/compare/brepjs-v4.3.0...brepjs-v4.4.0) (2026-02-06)

### Features

- chamfer with distance + angle ([#65](https://github.com/andymai/brepjs/issues/65)) ([b2b6039](https://github.com/andymai/brepjs/commit/b2b6039a18ce1a94343063404b31dba4a34ae83a))

## [4.3.0](https://github.com/andymai/brepjs/compare/brepjs-v4.2.0...brepjs-v4.3.0) (2026-02-06)

### Features

- add lazy topology iterators ([#63](https://github.com/andymai/brepjs/issues/63)) ([c7f6de3](https://github.com/andymai/brepjs/commit/c7f6de36bf1c3d56f4c2c46846bc95cb8e932854))
- add linear and circular pattern operations ([#59](https://github.com/andymai/brepjs/issues/59)) ([7b20234](https://github.com/andymai/brepjs/commit/7b20234e5a6f189b72793b5fab17ffd81ee3af93))
- add optional metadata field to BrepError ([#61](https://github.com/andymai/brepjs/issues/61)) ([c74a378](https://github.com/andymai/brepjs/commit/c74a37852a227745a12cb7bcb2ba997de4bc07a3))
- add section/slice operation ([#60](https://github.com/andymai/brepjs/issues/60)) ([1debde8](https://github.com/andymai/brepjs/commit/1debde8bb5b559f1561f7cba488119b817b2e325))
- add Three.js BufferGeometry helpers ([#62](https://github.com/andymai/brepjs/issues/62)) ([889f81c](https://github.com/andymai/brepjs/commit/889f81c13483ac87829176aeb09b01a984723ad0))

## [4.2.0](https://github.com/andymai/brepjs/compare/brepjs-v4.1.0...brepjs-v4.2.0) (2026-02-06)

### Features

- add BrepErrorCode enum ([#57](https://github.com/andymai/brepjs/issues/57)) ([4046e81](https://github.com/andymai/brepjs/commit/4046e81a322df28da5fb216b01080ef0da2fcb14))

## [4.1.0](https://github.com/andymai/brepjs/compare/brepjs-v4.0.4...brepjs-v4.1.0) (2026-02-06)

### Features

- add cone and torus primitive constructors ([#56](https://github.com/andymai/brepjs/issues/56)) ([61a488d](https://github.com/andymai/brepjs/commit/61a488d79c6f1d8da1ac596e39e03babacb90242))

## [4.0.4](https://github.com/andymai/brepjs/compare/brepjs-v4.0.3...brepjs-v4.0.4) (2026-02-04)

### Performance Improvements

- cache asTopo lookup map ([4971a46](https://github.com/andymai/brepjs/commit/4971a46c12f2ad24fb397731a6af7f0010f350c7))
- cache topology type enum maps ([1cc4490](https://github.com/andymai/brepjs/commit/1cc4490b353d223b727f3151a2140be154652c96))
- single-pass element extraction in finders ([7430a86](https://github.com/andymai/brepjs/commit/7430a86bbe9fe18a9c16f376d37963014172cb42))
- use index ranges in fuseAllPairwise to avoid allocations ([30b7231](https://github.com/andymai/brepjs/commit/30b723172f0337dc51795194ec59e00c3acb2e3e))

## [4.0.3](https://github.com/andymai/brepjs/compare/brepjs-v4.0.2...brepjs-v4.0.3) (2026-02-04)

### Bug Fixes

- critical bug fixes from code review ([#51](https://github.com/andymai/brepjs/issues/51)) ([9f553e7](https://github.com/andymai/brepjs/commit/9f553e71129a4511af85deab12dfeee33acfdf5b))

## [4.0.2](https://github.com/andymai/brepjs/compare/brepjs-v4.0.1...brepjs-v4.0.2) (2026-02-04)

### Bug Fixes

- format BrepError in unwrap() for readable error messages ([4dd9c9d](https://github.com/andymai/brepjs/commit/4dd9c9d94fed47f83a45fc6fcb5513377c34c531))

## [4.0.1](https://github.com/andymai/brepjs/compare/brepjs-v4.0.0...brepjs-v4.0.1) (2026-02-04)

### Bug Fixes

- use OCCT shape type enum for isShape3D checks to avoid minification issues ([f3e0939](https://github.com/andymai/brepjs/commit/f3e09398d70c166de6c551f3cc3cbb6e0a207852))

## [4.0.0](https://github.com/andymai/brepjs/compare/brepjs-v3.0.2...brepjs-v4.0.0) (2026-02-04)

### ⚠ BREAKING CHANGES

- remove deprecated geometry classes from internal usage ([#40](https://github.com/andymai/brepjs/issues/40))
- remove all deprecated legacy APIs ([#37](https://github.com/andymai/brepjs/issues/37))
- boolean operation and meshing performance optimizations ([#21](https://github.com/andymai/brepjs/issues/21))

### Features

- add functional API modules for topology, operations, query, measurement, and io ([721e04b](https://github.com/andymai/brepjs/commit/721e04b786893c9e35279d85195d9354b0453ade))
- add functional core type system and upgrade to TS 5.9 ([7d054fc](https://github.com/andymai/brepjs/commit/7d054fccba042b98ac5dd0b168685d8427b7ebe0))
- add Phase 2 functional 2D layer modules ([d738d83](https://github.com/andymai/brepjs/commit/d738d83262291c9d9770e74810dfcb71c88a4cdd))
- add Phase 3 sketching layer functional core ([a0faa97](https://github.com/andymai/brepjs/commit/a0faa97b20b6984ca2c07eacf60d1620e142c110))
- add Phase 4 projection camera functional API and text tests ([c7c1e34](https://github.com/andymai/brepjs/commit/c7c1e34e3e172240cdcaa88f1e26508ea20e9dd7))
- add Result&lt;T, E&gt; type and BrepError domain errors ([5b400f1](https://github.com/andymai/brepjs/commit/5b400f11ae3acf7410057e826ab3ddd3676319ef))
- focused improvement sprint - DX, quality, performance, production readiness ([#36](https://github.com/andymai/brepjs/issues/36)) ([2cebdd5](https://github.com/andymai/brepjs/commit/2cebdd56086eba999a35a8e02bbeea4d328657ea))
- **opencascade:** add multi-threaded WASM build ([e042efd](https://github.com/andymai/brepjs/commit/e042efd61cd2d296576798f56fa24ff761ab4d51))

### Bug Fixes

- add explicit permissions to workflow files ([#8](https://github.com/andymai/brepjs/issues/8)) ([4e78f95](https://github.com/andymai/brepjs/commit/4e78f95d7346a23c8d1b4182ffe9b9376cb0a1d0))
- add input validation to makeBezierCurve and CompoundSketch ([24d3580](https://github.com/andymai/brepjs/commit/24d3580ad6d12d78900ccc0d11d57f7a9453191b))
- add safety checks and fix memory leaks ([#29](https://github.com/andymai/brepjs/issues/29)) ([5260393](https://github.com/andymai/brepjs/commit/5260393283944ed234046e7112ce3c12d6aacdb2))
- add wire edges to non-planar face builder in kernel adapter ([340bdb3](https://github.com/andymai/brepjs/commit/340bdb370f6271dca1a0ead29959b5b374bebb65))
- align hashPoint precision with PRECISION_INTERSECTION ([#34](https://github.com/andymai/brepjs/issues/34)) ([bc84b64](https://github.com/andymai/brepjs/commit/bc84b641f7563b5d7eaff3ee6e7eec43036b3315))
- **brepjs-opencascade:** add repository field for npm provenance ([5f9edf7](https://github.com/andymai/brepjs/commit/5f9edf76f593dabb4702d5264550291d4231df7d))
- **ci:** pin ytt to v0.50.0 for opencascade build ([#12](https://github.com/andymai/brepjs/issues/12)) ([6a34f3a](https://github.com/andymai/brepjs/commit/6a34f3a402031e5d53e373d0beac8e60a16b7cb7))
- **ci:** use checked-in build-config instead of running ytt ([#14](https://github.com/andymai/brepjs/issues/14)) ([6cc2e53](https://github.com/andymai/brepjs/commit/6cc2e5388a0952ec41a5571302b56141efa5b420))
- comprehensive memory leak fixes across codebase ([#31](https://github.com/andymai/brepjs/issues/31)) ([207aa8e](https://github.com/andymai/brepjs/commit/207aa8e49451b7b324e436eef0ccc2e8a8de256d))
- correct bulgeArc Y-coordinate and resolve pre-existing typecheck errors ([fe15053](https://github.com/andymai/brepjs/commit/fe15053132b22a1074a79b2602662da1b05a0a65))
- delete leaked OCCT objects in buildLawFromProfile and buildCompoundOc ([8e1941c](https://github.com/andymai/brepjs/commit/8e1941ccbf137accf4e05b7f5608138848ef0d1a))
- delete leaked OCCT objects in ProjectionCamera.lookAt and 2D offset ([8d37047](https://github.com/andymai/brepjs/commit/8d37047e6e8fe5c81bc6655bfb8ba5be70e83660))
- delete transformer in Transformation.transform() to prevent memory leak ([2bff11f](https://github.com/andymai/brepjs/commit/2bff11f5f849980805bd4392f2083e488accd549))
- drawProjection crash, add coverage thresholds and pre-commit check ([a49e3e5](https://github.com/andymai/brepjs/commit/a49e3e563f5fcdfa9d5210b9713345b458feb0a7))
- ensure importSTEP/importSTL clean up on all paths ([5024479](https://github.com/andymai/brepjs/commit/5024479a2c4794ab957b0e1e173625b8a5146b98))
- guard against division by zero in miter offset and avoid array mutation in reverseSegment ([37cb6c1](https://github.com/andymai/brepjs/commit/37cb6c1b4c40ad6a95357bc5187b3035d6d09425))
- guard normalize2d against zero-length vector division ([ad42780](https://github.com/andymai/brepjs/commit/ad4278083601124ced05ded000b24636fec37681))
- improve error handling across multiple modules ([61e4f96](https://github.com/andymai/brepjs/commit/61e4f962611cff2c0557cb13038cec7d440024c9))
- make MeshData compatible with embind copy semantics ([#15](https://github.com/andymai/brepjs/issues/15)) ([5d7cb66](https://github.com/andymai/brepjs/commit/5d7cb665afc561f21add1ffb24fa62276d51bb2e))
- make WrappingObj.delete() idempotent ([1823bbd](https://github.com/andymai/brepjs/commit/1823bbd236b7eb81daa6509515f548a2a4623377))
- memory leaks and code quality improvements ([#30](https://github.com/andymai/brepjs/issues/30)) ([ee9fb2f](https://github.com/andymai/brepjs/commit/ee9fb2faffd5e0295e9b92da48a0d605ccebff5a))
- memory leaks on error paths and axis helpers ([#27](https://github.com/andymai/brepjs/issues/27)) ([8c2d469](https://github.com/andymai/brepjs/commit/8c2d469ebd51309faa04e686060d54bea007bc8a))
- memory leaks, file I/O race conditions, and dead code ([#24](https://github.com/andymai/brepjs/issues/24)) ([735e52f](https://github.com/andymai/brepjs/commit/735e52ffa8748627b751847c232408114aa6c3b5))
- memory management and correctness improvements ([#26](https://github.com/andymai/brepjs/issues/26)) ([acf8687](https://github.com/andymai/brepjs/commit/acf8687c6b35212a05887c9733aa5ab50d0ac138))
- **opencascade:** disable exception catching in threaded build ([c316b93](https://github.com/andymai/brepjs/commit/c316b93ae6d200cad5716299390c25069a6a63da))
- optimize mesh rendering and fix distance query memory leaks ([9b3fb30](https://github.com/andymai/brepjs/commit/9b3fb30e9e4c6a2a7998f8300ced1aaa81d24bec))
- pass required Message_ProgressRange to BRepExtrema Perform() ([28ae316](https://github.com/andymai/brepjs/commit/28ae31688250c546cfc3408d4c90a1abdef4bf85))
- plug intermediate Vector leaks in Plane methods ([888ec1e](https://github.com/andymai/brepjs/commit/888ec1e0ae88e20ff32fe3ff5e2875dd744625d7))
- plug memory leaks in edgesToDrawing, drawFaceOutline, and baseFace setter ([facf83f](https://github.com/andymai/brepjs/commit/facf83f2316bb18749f83c3570036c66cb2f20fd))
- plug memory leaks in occtAdapter for makeEdge, loft, sweep, mesh, importSTEP ([a087cb5](https://github.com/andymai/brepjs/commit/a087cb53ab97d157cdec9a03c48ef1397a913e17))
- plug Vector leaks in CompoundSketch.extrude and makePlaneFromFace ([df7d5f7](https://github.com/andymai/brepjs/commit/df7d5f7ae71419e3eba1af4be9d0fddd2c728036))
- plug Vector leaks in ProjectionCamera and makeTangentArc ([586fc42](https://github.com/andymai/brepjs/commit/586fc428bfcd9d4f18ff514853c8b9bd4693cbbb))
- plug Vector leaks in supportExtrude, complexExtrude, twistExtrude ([038606e](https://github.com/andymai/brepjs/commit/038606e7e30cdf567ded5aa9aea3827ab3395c46))
- plug Vector leaks in Transformation.translate and BoundingBox.repr ([d5721a0](https://github.com/andymai/brepjs/commit/d5721a082101a98815f65fb214bed63f1aa8c408))
- prevent memory leaks in Plane transforms and delete ([719fcce](https://github.com/andymai/brepjs/commit/719fccec5050b5df24e349928e0e145501418403))
- prevent memory leaks in Sketcher pointer and lifecycle ([a16155b](https://github.com/andymai/brepjs/commit/a16155b3ac6c4e82c264fc0e77d2f9227810dd57))
- remove console.error calls from library code ([74c58b3](https://github.com/andymai/brepjs/commit/74c58b3b17801851412b61058093338b79b81724))
- remove console.warn from fillet/chamfer corner operations ([17d0d17](https://github.com/andymai/brepjs/commit/17d0d17ad064cd42fdd3da68cff9b0040003851c))
- replace lazy text dependency injection with direct imports ([759e8e1](https://github.com/andymai/brepjs/commit/759e8e11e6e72e9616a96d334496f9e30f615926))
- resolve layer boundary violation — move bug/BrepBugError to utils ([ded6e68](https://github.com/andymai/brepjs/commit/ded6e6828e79efb5148135a8e10e74325a9679d5))
- stop compoundShapes from deleting caller-owned shapes ([c5a90e0](https://github.com/andymai/brepjs/commit/c5a90e070dbe79079ed195861f4558aa8ef9e46f))
- type blueprint sketchOnPlane/sketchOnFace, remove stale TODOs, add isCompSolid ([e0ba86a](https://github.com/andymai/brepjs/commit/e0ba86ae87c4daef5759e0e6b9f4306023aef1c3))
- type textBlueprints return as Blueprints and remove console.warn ([8fe3542](https://github.com/andymai/brepjs/commit/8fe3542b298621ef601ba725768873951ea2fdc1))
- use epsilon comparison for floating-point validation ([81de132](https://github.com/andymai/brepjs/commit/81de132b0f65a4e200f6c4ab8cd027be8d9e7671))
- use IsSame to prevent hash collisions in shape iteration ([09d1a04](https://github.com/andymai/brepjs/commit/09d1a041da1f53ca5e3759036f373e1dbeae4755))
- use recursive pairwise fuse in fuseAll instead of compounds ([#18](https://github.com/andymai/brepjs/issues/18)) ([8d161b8](https://github.com/andymai/brepjs/commit/8d161b88005db56ad88adcd441400db750dd900b))
- wrap smoothSplineTo in try-finally for exception-safe GC ([c3036a3](https://github.com/andymai/brepjs/commit/c3036a3d62bdd6d3b81a52a212afae90a7ea4a43))

### Performance Improvements

- boolean operation and meshing performance optimizations ([#21](https://github.com/andymai/brepjs/issues/21)) ([f7ce008](https://github.com/andymai/brepjs/commit/f7ce00802d23174b3d29f189554f5cc9ba8f41c6))
- bulk C++ mesh extraction with unified APIs ([#9](https://github.com/andymai/brepjs/issues/9)) ([65709bf](https://github.com/andymai/brepjs/commit/65709bf7f19eaf454da1491279e77b820409b86a))
- cache hot-path maps and fix builder leak in kernel adapter ([e77a65e](https://github.com/andymai/brepjs/commit/e77a65e310a26bb7517362a9e91a5f81f6c97df9))
- edge mesh caching and bulk C++ extractors ([#23](https://github.com/andymai/brepjs/issues/23)) ([347f5a3](https://github.com/andymai/brepjs/commit/347f5a35fec301a608cbdf0cad5d2c83a50d2d65))
- optimize O(n²) to O(1) lookup in boolean operations ([#32](https://github.com/andymai/brepjs/issues/32)) ([8c64db6](https://github.com/andymai/brepjs/commit/8c64db6f371951beaac4267223473efb0c4d580e))

### Code Refactoring

- remove all deprecated legacy APIs ([#37](https://github.com/andymai/brepjs/issues/37)) ([cf2739f](https://github.com/andymai/brepjs/commit/cf2739fd2088b5d94925dc41023d0715f195d156))
- remove deprecated geometry classes from internal usage ([#40](https://github.com/andymai/brepjs/issues/40)) ([7269c95](https://github.com/andymai/brepjs/commit/7269c951fa69987a6658db15d0076145fb71bbc7))

## [3.0.2](https://github.com/andymai/brepjs/compare/brepjs-v3.0.1...brepjs-v3.0.2) (2026-02-04)

### Dependencies

- The following workspace dependencies were updated
  - devDependencies
    - brepjs-opencascade bumped from ^0.4.1 to ^0.5.1
  - peerDependencies
    - brepjs-opencascade bumped from ^0.4.1 to ^0.5.1

## [3.0.1](https://github.com/andymai/brepjs/compare/brepjs-v3.0.0...brepjs-v3.0.1) (2026-02-04)

### Bug Fixes

- **brepjs-opencascade:** add repository field for npm provenance ([5f9edf7](https://github.com/andymai/brepjs/commit/5f9edf76f593dabb4702d5264550291d4231df7d))

## [3.0.0](https://github.com/andymai/brepjs/compare/brepjs-v2.0.4...brepjs-v3.0.0) (2026-02-04)

### ⚠ BREAKING CHANGES

- remove deprecated geometry classes from internal usage ([#40](https://github.com/andymai/brepjs/issues/40))
- remove all deprecated legacy APIs ([#37](https://github.com/andymai/brepjs/issues/37))
- boolean operation and meshing performance optimizations ([#21](https://github.com/andymai/brepjs/issues/21))

### Features

- add functional API modules for topology, operations, query, measurement, and io ([721e04b](https://github.com/andymai/brepjs/commit/721e04b786893c9e35279d85195d9354b0453ade))
- add functional core type system and upgrade to TS 5.9 ([7d054fc](https://github.com/andymai/brepjs/commit/7d054fccba042b98ac5dd0b168685d8427b7ebe0))
- add Phase 2 functional 2D layer modules ([d738d83](https://github.com/andymai/brepjs/commit/d738d83262291c9d9770e74810dfcb71c88a4cdd))
- add Phase 3 sketching layer functional core ([a0faa97](https://github.com/andymai/brepjs/commit/a0faa97b20b6984ca2c07eacf60d1620e142c110))
- add Phase 4 projection camera functional API and text tests ([c7c1e34](https://github.com/andymai/brepjs/commit/c7c1e34e3e172240cdcaa88f1e26508ea20e9dd7))
- add Result&lt;T, E&gt; type and BrepError domain errors ([5b400f1](https://github.com/andymai/brepjs/commit/5b400f11ae3acf7410057e826ab3ddd3676319ef))
- focused improvement sprint - DX, quality, performance, production readiness ([#36](https://github.com/andymai/brepjs/issues/36)) ([2cebdd5](https://github.com/andymai/brepjs/commit/2cebdd56086eba999a35a8e02bbeea4d328657ea))
- **opencascade:** add multi-threaded WASM build ([e042efd](https://github.com/andymai/brepjs/commit/e042efd61cd2d296576798f56fa24ff761ab4d51))

### Bug Fixes

- add explicit permissions to workflow files ([#8](https://github.com/andymai/brepjs/issues/8)) ([4e78f95](https://github.com/andymai/brepjs/commit/4e78f95d7346a23c8d1b4182ffe9b9376cb0a1d0))
- add input validation to makeBezierCurve and CompoundSketch ([24d3580](https://github.com/andymai/brepjs/commit/24d3580ad6d12d78900ccc0d11d57f7a9453191b))
- add safety checks and fix memory leaks ([#29](https://github.com/andymai/brepjs/issues/29)) ([5260393](https://github.com/andymai/brepjs/commit/5260393283944ed234046e7112ce3c12d6aacdb2))
- add wire edges to non-planar face builder in kernel adapter ([340bdb3](https://github.com/andymai/brepjs/commit/340bdb370f6271dca1a0ead29959b5b374bebb65))
- align hashPoint precision with PRECISION_INTERSECTION ([#34](https://github.com/andymai/brepjs/issues/34)) ([bc84b64](https://github.com/andymai/brepjs/commit/bc84b641f7563b5d7eaff3ee6e7eec43036b3315))
- **ci:** pin ytt to v0.50.0 for opencascade build ([#12](https://github.com/andymai/brepjs/issues/12)) ([6a34f3a](https://github.com/andymai/brepjs/commit/6a34f3a402031e5d53e373d0beac8e60a16b7cb7))
- **ci:** use checked-in build-config instead of running ytt ([#14](https://github.com/andymai/brepjs/issues/14)) ([6cc2e53](https://github.com/andymai/brepjs/commit/6cc2e5388a0952ec41a5571302b56141efa5b420))
- comprehensive memory leak fixes across codebase ([#31](https://github.com/andymai/brepjs/issues/31)) ([207aa8e](https://github.com/andymai/brepjs/commit/207aa8e49451b7b324e436eef0ccc2e8a8de256d))
- correct bulgeArc Y-coordinate and resolve pre-existing typecheck errors ([fe15053](https://github.com/andymai/brepjs/commit/fe15053132b22a1074a79b2602662da1b05a0a65))
- delete leaked OCCT objects in buildLawFromProfile and buildCompoundOc ([8e1941c](https://github.com/andymai/brepjs/commit/8e1941ccbf137accf4e05b7f5608138848ef0d1a))
- delete leaked OCCT objects in ProjectionCamera.lookAt and 2D offset ([8d37047](https://github.com/andymai/brepjs/commit/8d37047e6e8fe5c81bc6655bfb8ba5be70e83660))
- delete transformer in Transformation.transform() to prevent memory leak ([2bff11f](https://github.com/andymai/brepjs/commit/2bff11f5f849980805bd4392f2083e488accd549))
- drawProjection crash, add coverage thresholds and pre-commit check ([a49e3e5](https://github.com/andymai/brepjs/commit/a49e3e563f5fcdfa9d5210b9713345b458feb0a7))
- ensure importSTEP/importSTL clean up on all paths ([5024479](https://github.com/andymai/brepjs/commit/5024479a2c4794ab957b0e1e173625b8a5146b98))
- guard against division by zero in miter offset and avoid array mutation in reverseSegment ([37cb6c1](https://github.com/andymai/brepjs/commit/37cb6c1b4c40ad6a95357bc5187b3035d6d09425))
- guard normalize2d against zero-length vector division ([ad42780](https://github.com/andymai/brepjs/commit/ad4278083601124ced05ded000b24636fec37681))
- improve error handling across multiple modules ([61e4f96](https://github.com/andymai/brepjs/commit/61e4f962611cff2c0557cb13038cec7d440024c9))
- make MeshData compatible with embind copy semantics ([#15](https://github.com/andymai/brepjs/issues/15)) ([5d7cb66](https://github.com/andymai/brepjs/commit/5d7cb665afc561f21add1ffb24fa62276d51bb2e))
- make WrappingObj.delete() idempotent ([1823bbd](https://github.com/andymai/brepjs/commit/1823bbd236b7eb81daa6509515f548a2a4623377))
- memory leaks and code quality improvements ([#30](https://github.com/andymai/brepjs/issues/30)) ([ee9fb2f](https://github.com/andymai/brepjs/commit/ee9fb2faffd5e0295e9b92da48a0d605ccebff5a))
- memory leaks on error paths and axis helpers ([#27](https://github.com/andymai/brepjs/issues/27)) ([8c2d469](https://github.com/andymai/brepjs/commit/8c2d469ebd51309faa04e686060d54bea007bc8a))
- memory leaks, file I/O race conditions, and dead code ([#24](https://github.com/andymai/brepjs/issues/24)) ([735e52f](https://github.com/andymai/brepjs/commit/735e52ffa8748627b751847c232408114aa6c3b5))
- memory management and correctness improvements ([#26](https://github.com/andymai/brepjs/issues/26)) ([acf8687](https://github.com/andymai/brepjs/commit/acf8687c6b35212a05887c9733aa5ab50d0ac138))
- **opencascade:** disable exception catching in threaded build ([c316b93](https://github.com/andymai/brepjs/commit/c316b93ae6d200cad5716299390c25069a6a63da))
- optimize mesh rendering and fix distance query memory leaks ([9b3fb30](https://github.com/andymai/brepjs/commit/9b3fb30e9e4c6a2a7998f8300ced1aaa81d24bec))
- pass required Message_ProgressRange to BRepExtrema Perform() ([28ae316](https://github.com/andymai/brepjs/commit/28ae31688250c546cfc3408d4c90a1abdef4bf85))
- plug intermediate Vector leaks in Plane methods ([888ec1e](https://github.com/andymai/brepjs/commit/888ec1e0ae88e20ff32fe3ff5e2875dd744625d7))
- plug memory leaks in edgesToDrawing, drawFaceOutline, and baseFace setter ([facf83f](https://github.com/andymai/brepjs/commit/facf83f2316bb18749f83c3570036c66cb2f20fd))
- plug memory leaks in occtAdapter for makeEdge, loft, sweep, mesh, importSTEP ([a087cb5](https://github.com/andymai/brepjs/commit/a087cb53ab97d157cdec9a03c48ef1397a913e17))
- plug Vector leaks in CompoundSketch.extrude and makePlaneFromFace ([df7d5f7](https://github.com/andymai/brepjs/commit/df7d5f7ae71419e3eba1af4be9d0fddd2c728036))
- plug Vector leaks in ProjectionCamera and makeTangentArc ([586fc42](https://github.com/andymai/brepjs/commit/586fc428bfcd9d4f18ff514853c8b9bd4693cbbb))
- plug Vector leaks in supportExtrude, complexExtrude, twistExtrude ([038606e](https://github.com/andymai/brepjs/commit/038606e7e30cdf567ded5aa9aea3827ab3395c46))
- plug Vector leaks in Transformation.translate and BoundingBox.repr ([d5721a0](https://github.com/andymai/brepjs/commit/d5721a082101a98815f65fb214bed63f1aa8c408))
- prevent memory leaks in Plane transforms and delete ([719fcce](https://github.com/andymai/brepjs/commit/719fccec5050b5df24e349928e0e145501418403))
- prevent memory leaks in Sketcher pointer and lifecycle ([a16155b](https://github.com/andymai/brepjs/commit/a16155b3ac6c4e82c264fc0e77d2f9227810dd57))
- remove console.error calls from library code ([74c58b3](https://github.com/andymai/brepjs/commit/74c58b3b17801851412b61058093338b79b81724))
- remove console.warn from fillet/chamfer corner operations ([17d0d17](https://github.com/andymai/brepjs/commit/17d0d17ad064cd42fdd3da68cff9b0040003851c))
- replace lazy text dependency injection with direct imports ([759e8e1](https://github.com/andymai/brepjs/commit/759e8e11e6e72e9616a96d334496f9e30f615926))
- resolve layer boundary violation — move bug/BrepBugError to utils ([ded6e68](https://github.com/andymai/brepjs/commit/ded6e6828e79efb5148135a8e10e74325a9679d5))
- stop compoundShapes from deleting caller-owned shapes ([c5a90e0](https://github.com/andymai/brepjs/commit/c5a90e070dbe79079ed195861f4558aa8ef9e46f))
- type blueprint sketchOnPlane/sketchOnFace, remove stale TODOs, add isCompSolid ([e0ba86a](https://github.com/andymai/brepjs/commit/e0ba86ae87c4daef5759e0e6b9f4306023aef1c3))
- type textBlueprints return as Blueprints and remove console.warn ([8fe3542](https://github.com/andymai/brepjs/commit/8fe3542b298621ef601ba725768873951ea2fdc1))
- use epsilon comparison for floating-point validation ([81de132](https://github.com/andymai/brepjs/commit/81de132b0f65a4e200f6c4ab8cd027be8d9e7671))
- use IsSame to prevent hash collisions in shape iteration ([09d1a04](https://github.com/andymai/brepjs/commit/09d1a041da1f53ca5e3759036f373e1dbeae4755))
- use recursive pairwise fuse in fuseAll instead of compounds ([#18](https://github.com/andymai/brepjs/issues/18)) ([8d161b8](https://github.com/andymai/brepjs/commit/8d161b88005db56ad88adcd441400db750dd900b))
- wrap smoothSplineTo in try-finally for exception-safe GC ([c3036a3](https://github.com/andymai/brepjs/commit/c3036a3d62bdd6d3b81a52a212afae90a7ea4a43))

### Performance Improvements

- boolean operation and meshing performance optimizations ([#21](https://github.com/andymai/brepjs/issues/21)) ([f7ce008](https://github.com/andymai/brepjs/commit/f7ce00802d23174b3d29f189554f5cc9ba8f41c6))
- bulk C++ mesh extraction with unified APIs ([#9](https://github.com/andymai/brepjs/issues/9)) ([65709bf](https://github.com/andymai/brepjs/commit/65709bf7f19eaf454da1491279e77b820409b86a))
- cache hot-path maps and fix builder leak in kernel adapter ([e77a65e](https://github.com/andymai/brepjs/commit/e77a65e310a26bb7517362a9e91a5f81f6c97df9))
- edge mesh caching and bulk C++ extractors ([#23](https://github.com/andymai/brepjs/issues/23)) ([347f5a3](https://github.com/andymai/brepjs/commit/347f5a35fec301a608cbdf0cad5d2c83a50d2d65))
- optimize O(n²) to O(1) lookup in boolean operations ([#32](https://github.com/andymai/brepjs/issues/32)) ([8c64db6](https://github.com/andymai/brepjs/commit/8c64db6f371951beaac4267223473efb0c4d580e))

### Code Refactoring

- remove all deprecated legacy APIs ([#37](https://github.com/andymai/brepjs/issues/37)) ([cf2739f](https://github.com/andymai/brepjs/commit/cf2739fd2088b5d94925dc41023d0715f195d156))
- remove deprecated geometry classes from internal usage ([#40](https://github.com/andymai/brepjs/issues/40)) ([7269c95](https://github.com/andymai/brepjs/commit/7269c951fa69987a6658db15d0076145fb71bbc7))

## [2.1.0](https://github.com/andymai/brepjs/compare/v2.0.2...v2.1.0) (2026-02-03)

### Features

- **opencascade:** add multi-threaded WASM build ([e042efd](https://github.com/andymai/brepjs/commit/e042efd61cd2d296576798f56fa24ff761ab4d51))

## [2.0.2](https://github.com/andymai/brepjs/compare/v2.0.1...v2.0.2) (2026-02-03)

### Bug Fixes

- align hashPoint precision with PRECISION_INTERSECTION ([#34](https://github.com/andymai/brepjs/issues/34)) ([bc84b64](https://github.com/andymai/brepjs/commit/bc84b641f7563b5d7eaff3ee6e7eec43036b3315))

## [2.0.1](https://github.com/andymai/brepjs/compare/v2.0.0...v2.0.1) (2026-02-03)

### Bug Fixes

- add safety checks and fix memory leaks ([#29](https://github.com/andymai/brepjs/issues/29)) ([5260393](https://github.com/andymai/brepjs/commit/5260393283944ed234046e7112ce3c12d6aacdb2))
- comprehensive memory leak fixes across codebase ([#31](https://github.com/andymai/brepjs/issues/31)) ([207aa8e](https://github.com/andymai/brepjs/commit/207aa8e49451b7b324e436eef0ccc2e8a8de256d))
- memory leaks and code quality improvements ([#30](https://github.com/andymai/brepjs/issues/30)) ([ee9fb2f](https://github.com/andymai/brepjs/commit/ee9fb2faffd5e0295e9b92da48a0d605ccebff5a))
- memory leaks on error paths and axis helpers ([#27](https://github.com/andymai/brepjs/issues/27)) ([8c2d469](https://github.com/andymai/brepjs/commit/8c2d469ebd51309faa04e686060d54bea007bc8a))
- memory leaks, file I/O race conditions, and dead code ([#24](https://github.com/andymai/brepjs/issues/24)) ([735e52f](https://github.com/andymai/brepjs/commit/735e52ffa8748627b751847c232408114aa6c3b5))
- memory management and correctness improvements ([#26](https://github.com/andymai/brepjs/issues/26)) ([acf8687](https://github.com/andymai/brepjs/commit/acf8687c6b35212a05887c9733aa5ab50d0ac138))
- use epsilon comparison for floating-point validation ([81de132](https://github.com/andymai/brepjs/commit/81de132b0f65a4e200f6c4ab8cd027be8d9e7671))

### Performance Improvements

- optimize O(n²) to O(1) lookup in boolean operations ([#32](https://github.com/andymai/brepjs/issues/32)) ([8c64db6](https://github.com/andymai/brepjs/commit/8c64db6f371951beaac4267223473efb0c4d580e))

## [2.0.0](https://github.com/andymai/brepjs/compare/v1.0.4...v2.0.0) (2026-02-03)

### ⚠ BREAKING CHANGES

- boolean operation and meshing performance optimizations ([#21](https://github.com/andymai/brepjs/issues/21))

### Performance Improvements

- boolean operation and meshing performance optimizations ([#21](https://github.com/andymai/brepjs/issues/21)) ([f7ce008](https://github.com/andymai/brepjs/commit/f7ce00802d23174b3d29f189554f5cc9ba8f41c6))
- edge mesh caching and bulk C++ extractors ([#23](https://github.com/andymai/brepjs/issues/23)) ([347f5a3](https://github.com/andymai/brepjs/commit/347f5a35fec301a608cbdf0cad5d2c83a50d2d65))

## [1.0.4](https://github.com/andymai/brepjs/compare/v1.0.3...v1.0.4) (2026-02-02)

### Bug Fixes

- use recursive pairwise fuse in fuseAll instead of compounds ([#18](https://github.com/andymai/brepjs/issues/18)) ([8d161b8](https://github.com/andymai/brepjs/commit/8d161b88005db56ad88adcd441400db750dd900b))

## [1.0.3](https://github.com/andymai/brepjs/compare/v1.0.2...v1.0.3) (2026-02-02)

### Bug Fixes

- **ci:** pin ytt to v0.50.0 for opencascade build ([#12](https://github.com/andymai/brepjs/issues/12)) ([6a34f3a](https://github.com/andymai/brepjs/commit/6a34f3a402031e5d53e373d0beac8e60a16b7cb7))
- **ci:** use checked-in build-config instead of running ytt ([#14](https://github.com/andymai/brepjs/issues/14)) ([6cc2e53](https://github.com/andymai/brepjs/commit/6cc2e5388a0952ec41a5571302b56141efa5b420))
- make MeshData compatible with embind copy semantics ([#15](https://github.com/andymai/brepjs/issues/15)) ([5d7cb66](https://github.com/andymai/brepjs/commit/5d7cb665afc561f21add1ffb24fa62276d51bb2e))

## [1.0.2](https://github.com/andymai/brepjs/compare/v1.0.1...v1.0.2) (2026-02-02)

### Performance Improvements

- bulk C++ mesh extraction with unified APIs ([#9](https://github.com/andymai/brepjs/issues/9)) ([65709bf](https://github.com/andymai/brepjs/commit/65709bf7f19eaf454da1491279e77b820409b86a))

## [1.0.1](https://github.com/andymai/brepjs/compare/v1.0.0...v1.0.1) (2026-02-02)

### Bug Fixes

- add explicit permissions to workflow files ([#8](https://github.com/andymai/brepjs/issues/8)) ([4e78f95](https://github.com/andymai/brepjs/commit/4e78f95d7346a23c8d1b4182ffe9b9376cb0a1d0))

### Performance Improvements

- cache hot-path maps and fix builder leak in kernel adapter ([e77a65e](https://github.com/andymai/brepjs/commit/e77a65e310a26bb7517362a9e91a5f81f6c97df9))

## 1.0.0 (2026-02-02)

### Features

- add functional API modules for topology, operations, query, measurement, and io ([721e04b](https://github.com/andymai/brepjs/commit/721e04b786893c9e35279d85195d9354b0453ade))
- add functional core type system and upgrade to TS 5.9 ([7d054fc](https://github.com/andymai/brepjs/commit/7d054fccba042b98ac5dd0b168685d8427b7ebe0))
- add Phase 2 functional 2D layer modules ([d738d83](https://github.com/andymai/brepjs/commit/d738d83262291c9d9770e74810dfcb71c88a4cdd))
- add Phase 3 sketching layer functional core ([a0faa97](https://github.com/andymai/brepjs/commit/a0faa97b20b6984ca2c07eacf60d1620e142c110))
- add Phase 4 projection camera functional API and text tests ([c7c1e34](https://github.com/andymai/brepjs/commit/c7c1e34e3e172240cdcaa88f1e26508ea20e9dd7))
- add Result&lt;T, E&gt; type and BrepError domain errors ([5b400f1](https://github.com/andymai/brepjs/commit/5b400f11ae3acf7410057e826ab3ddd3676319ef))

### Bug Fixes

- add input validation to makeBezierCurve and CompoundSketch ([24d3580](https://github.com/andymai/brepjs/commit/24d3580ad6d12d78900ccc0d11d57f7a9453191b))
- add wire edges to non-planar face builder in kernel adapter ([340bdb3](https://github.com/andymai/brepjs/commit/340bdb370f6271dca1a0ead29959b5b374bebb65))
- correct bulgeArc Y-coordinate and resolve pre-existing typecheck errors ([fe15053](https://github.com/andymai/brepjs/commit/fe15053132b22a1074a79b2602662da1b05a0a65))
- delete leaked OCCT objects in buildLawFromProfile and buildCompoundOc ([8e1941c](https://github.com/andymai/brepjs/commit/8e1941ccbf137accf4e05b7f5608138848ef0d1a))
- delete leaked OCCT objects in ProjectionCamera.lookAt and 2D offset ([8d37047](https://github.com/andymai/brepjs/commit/8d37047e6e8fe5c81bc6655bfb8ba5be70e83660))
- delete transformer in Transformation.transform() to prevent memory leak ([2bff11f](https://github.com/andymai/brepjs/commit/2bff11f5f849980805bd4392f2083e488accd549))
- drawProjection crash, add coverage thresholds and pre-commit check ([a49e3e5](https://github.com/andymai/brepjs/commit/a49e3e563f5fcdfa9d5210b9713345b458feb0a7))
- ensure importSTEP/importSTL clean up on all paths ([5024479](https://github.com/andymai/brepjs/commit/5024479a2c4794ab957b0e1e173625b8a5146b98))
- guard against division by zero in miter offset and avoid array mutation in reverseSegment ([37cb6c1](https://github.com/andymai/brepjs/commit/37cb6c1b4c40ad6a95357bc5187b3035d6d09425))
- guard normalize2d against zero-length vector division ([ad42780](https://github.com/andymai/brepjs/commit/ad4278083601124ced05ded000b24636fec37681))
- improve error handling across multiple modules ([61e4f96](https://github.com/andymai/brepjs/commit/61e4f962611cff2c0557cb13038cec7d440024c9))
- make WrappingObj.delete() idempotent ([1823bbd](https://github.com/andymai/brepjs/commit/1823bbd236b7eb81daa6509515f548a2a4623377))
- optimize mesh rendering and fix distance query memory leaks ([9b3fb30](https://github.com/andymai/brepjs/commit/9b3fb30e9e4c6a2a7998f8300ced1aaa81d24bec))
- pass required Message_ProgressRange to BRepExtrema Perform() ([28ae316](https://github.com/andymai/brepjs/commit/28ae31688250c546cfc3408d4c90a1abdef4bf85))
- plug intermediate Vector leaks in Plane methods ([888ec1e](https://github.com/andymai/brepjs/commit/888ec1e0ae88e20ff32fe3ff5e2875dd744625d7))
- plug memory leaks in edgesToDrawing, drawFaceOutline, and baseFace setter ([facf83f](https://github.com/andymai/brepjs/commit/facf83f2316bb18749f83c3570036c66cb2f20fd))
- plug memory leaks in occtAdapter for makeEdge, loft, sweep, mesh, importSTEP ([a087cb5](https://github.com/andymai/brepjs/commit/a087cb53ab97d157cdec9a03c48ef1397a913e17))
- plug Vector leaks in CompoundSketch.extrude and makePlaneFromFace ([df7d5f7](https://github.com/andymai/brepjs/commit/df7d5f7ae71419e3eba1af4be9d0fddd2c728036))
- plug Vector leaks in ProjectionCamera and makeTangentArc ([586fc42](https://github.com/andymai/brepjs/commit/586fc428bfcd9d4f18ff514853c8b9bd4693cbbb))
- plug Vector leaks in supportExtrude, complexExtrude, twistExtrude ([038606e](https://github.com/andymai/brepjs/commit/038606e7e30cdf567ded5aa9aea3827ab3395c46))
- plug Vector leaks in Transformation.translate and BoundingBox.repr ([d5721a0](https://github.com/andymai/brepjs/commit/d5721a082101a98815f65fb214bed63f1aa8c408))
- prevent memory leaks in Plane transforms and delete ([719fcce](https://github.com/andymai/brepjs/commit/719fccec5050b5df24e349928e0e145501418403))
- prevent memory leaks in Sketcher pointer and lifecycle ([a16155b](https://github.com/andymai/brepjs/commit/a16155b3ac6c4e82c264fc0e77d2f9227810dd57))
- remove console.error calls from library code ([74c58b3](https://github.com/andymai/brepjs/commit/74c58b3b17801851412b61058093338b79b81724))
- remove console.warn from fillet/chamfer corner operations ([17d0d17](https://github.com/andymai/brepjs/commit/17d0d17ad064cd42fdd3da68cff9b0040003851c))
- replace lazy text dependency injection with direct imports ([759e8e1](https://github.com/andymai/brepjs/commit/759e8e11e6e72e9616a96d334496f9e30f615926))
- resolve layer boundary violation — move bug/BrepBugError to utils ([ded6e68](https://github.com/andymai/brepjs/commit/ded6e6828e79efb5148135a8e10e74325a9679d5))
- stop compoundShapes from deleting caller-owned shapes ([c5a90e0](https://github.com/andymai/brepjs/commit/c5a90e070dbe79079ed195861f4558aa8ef9e46f))
- type blueprint sketchOnPlane/sketchOnFace, remove stale TODOs, add isCompSolid ([e0ba86a](https://github.com/andymai/brepjs/commit/e0ba86ae87c4daef5759e0e6b9f4306023aef1c3))
- type textBlueprints return as Blueprints and remove console.warn ([8fe3542](https://github.com/andymai/brepjs/commit/8fe3542b298621ef601ba725768873951ea2fdc1))
- use IsSame to prevent hash collisions in shape iteration ([09d1a04](https://github.com/andymai/brepjs/commit/09d1a041da1f53ca5e3759036f373e1dbeae4755))
- wrap smoothSplineTo in try-finally for exception-safe GC ([c3036a3](https://github.com/andymai/brepjs/commit/c3036a3d62bdd6d3b81a52a212afae90a7ea4a43))
