# Changelog

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
