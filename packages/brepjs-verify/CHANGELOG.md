# Changelog

## [0.23.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.22.1...brepjs-verify-v0.23.0) (2026-06-15)


### Features

* **brepjs-verify:** auto-open browser on --serve + document the MCP server ([#1308](https://github.com/andymai/brepjs/issues/1308)) ([de4272c](https://github.com/andymai/brepjs/commit/de4272c9196f70baec4ff762a33636fccef4c012))
* **brepjs-verify:** burn bbox dimensions into agent snapshots ([#1280](https://github.com/andymai/brepjs/issues/1280)) ([25b6b8d](https://github.com/andymai/brepjs/commit/25b6b8df68909a41eaef5307519a29a8a05ccc00))
* **brepjs-verify:** eval-driven skill, hint, and reference improvements ([#1219](https://github.com/andymai/brepjs/issues/1219)) ([1a9b80f](https://github.com/andymai/brepjs/commit/1a9b80f3d3dbb44d7a8ae2f601ff305b70534efe))
* **brepjs-verify:** live text-to-cad eval flywheel ([#1215](https://github.com/andymai/brepjs/issues/1215)) ([4e81fc4](https://github.com/andymai/brepjs/commit/4e81fc4053491ce3e08182d57d76bd649252ea3c))
* **brepjs-verify:** standalone bundled CLI + rename from brepjs-cad ([#1211](https://github.com/andymai/brepjs/issues/1211)) ([05b3799](https://github.com/andymai/brepjs/commit/05b3799a0e9ee4968d4cac92f3a2ea236e39cd35))
* native thread() operation + maker-breadth skill references ([#1330](https://github.com/andymai/brepjs/issues/1330)) ([1bfc73d](https://github.com/andymai/brepjs/commit/1bfc73d696b0b779230e6ed3542e7b8415426992))
* **verify:** add center of mass to the verify report ([#1288](https://github.com/andymai/brepjs/issues/1288)) ([5738600](https://github.com/andymai/brepjs/commit/5738600e31f56c00d928d62e32ab9d5e8220b377))
* **verify:** add export_part MCP tool and sandbox export ([#1316](https://github.com/andymai/brepjs/issues/1316)) ([8a52f90](https://github.com/andymai/brepjs/commit/8a52f90c5b3d76c8bf6ef50a36c6977833af59bb))
* **verify:** add JSONL run-record provenance for sandbox runs ([#1309](https://github.com/andymai/brepjs/issues/1309)) ([6bda9b6](https://github.com/andymai/brepjs/commit/6bda9b630b8e4edf6eb860002c58b3e36cf1bfd4))
* **verify:** add manifold flag to the topology channel ([#1291](https://github.com/andymai/brepjs/issues/1291)) ([5ea5bb4](https://github.com/andymai/brepjs/commit/5ea5bb4db5bc8539f2773752e1c42770c91b5e0d))
* **verify:** add MCP server with run_program tool (stdio) ([#1300](https://github.com/andymai/brepjs/issues/1300)) ([e3c2c9e](https://github.com/andymai/brepjs/commit/e3c2c9e678dd719608cea8b6ee38101de9775e5d))
* **verify:** add topology counts to the verify report ([#1285](https://github.com/andymai/brepjs/issues/1285)) ([17a0eed](https://github.com/andymai/brepjs/commit/17a0eede727ac29007591cb0249274a35896facb))
* **verify:** sandbox executor — run agent code in an isolated child process ([#1295](https://github.com/andymai/brepjs/issues/1295)) ([8b72aa2](https://github.com/andymai/brepjs/commit/8b72aa2e272a58aa6d3886b8304eeaefb1a09b2e))
* **verify:** validate each body of multi-solid assemblies ([#1293](https://github.com/andymai/brepjs/issues/1293)) ([deb682f](https://github.com/andymai/brepjs/commit/deb682f1104179f261f232be7d94ceb154985328))
* **viewer:** click-to-inspect face picking in verify --serve ([#1278](https://github.com/andymai/brepjs/issues/1278)) ([735dc04](https://github.com/andymai/brepjs/commit/735dc0401143ff47046a79e6fb7bac53cf00a91e))
* **viewer:** measurements info panel in verify --serve ([#1277](https://github.com/andymai/brepjs/issues/1277)) ([c1ccf1d](https://github.com/andymai/brepjs/commit/c1ccf1d7c50ab43dc0444468f92fcf9365fda9da))
* **viewer:** orthographic/perspective projection toggle ([#1281](https://github.com/andymai/brepjs/issues/1281)) ([96673e4](https://github.com/andymai/brepjs/commit/96673e45e1ee316f9d26e52c995b4daba691e8b0))
* **viewer:** section/clipping plane in verify --serve ([#1279](https://github.com/andymai/brepjs/issues/1279)) ([cc0d00b](https://github.com/andymai/brepjs/commit/cc0d00b7a6296cc698fce1ae42b7503e6d47c032))
* **viewer:** shared ViewerControls toolbar; interactive verify --serve ([#1275](https://github.com/andymai/brepjs/issues/1275)) ([139ae15](https://github.com/andymai/brepjs/commit/139ae15a29d8a7ad5e520ba21d6dc9788242c089))


### Bug Fixes

* **brepjs-verify:** correct fillet/chamfer arg order in no-edges hints ([#1218](https://github.com/andymai/brepjs/issues/1218)) ([835f13a](https://github.com/andymai/brepjs/commit/835f13ac966b4264ba56a5cfc371bbbbbd1a0f01))
* **brepjs-verify:** point skills entry at ./skill directory, not SKILL.md ([#1270](https://github.com/andymai/brepjs/issues/1270)) ([9413a57](https://github.com/andymai/brepjs/commit/9413a57d8c2cac943371e75bcbaf11b3fdd9a657))
* **brepjs-verify:** repair preview viewer + GLB Y-up/materials fidelity ([#1271](https://github.com/andymai/brepjs/issues/1271)) ([2823d21](https://github.com/andymai/brepjs/commit/2823d212e2fc5f79e785911ec2b9f3320bdfdbbf))
* **verify:** reap orphaned sandbox processes on timeout and host shutdown ([#1380](https://github.com/andymai/brepjs/issues/1380)) ([7489ba8](https://github.com/andymai/brepjs/commit/7489ba8f665a71549d5b80367757f3373e1af0fb))
* **verify:** relax brepjs-viewer devDep to * so workspace links ([#1320](https://github.com/andymai/brepjs/issues/1320)) ([b26a18d](https://github.com/andymai/brepjs/commit/b26a18d406a051806c72e36d67da0f644588f315))
* **verify:** unpin brepjs-viewer devDep to workspace wildcard ([#1408](https://github.com/andymai/brepjs/issues/1408)) ([ab1d331](https://github.com/andymai/brepjs/commit/ab1d331908b5fd6d20a1e1cb2ab81aeaf6ad004a))

## [0.22.1](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.22.0...brepjs-verify-v0.22.1) (2026-06-15)

## [0.22.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.21.2...brepjs-verify-v0.22.0) (2026-06-15)


### Features

* **brepjs-verify:** auto-open browser on --serve + document the MCP server ([#1308](https://github.com/andymai/brepjs/issues/1308)) ([de4272c](https://github.com/andymai/brepjs/commit/de4272c9196f70baec4ff762a33636fccef4c012))
* **brepjs-verify:** burn bbox dimensions into agent snapshots ([#1280](https://github.com/andymai/brepjs/issues/1280)) ([25b6b8d](https://github.com/andymai/brepjs/commit/25b6b8df68909a41eaef5307519a29a8a05ccc00))
* **brepjs-verify:** eval-driven skill, hint, and reference improvements ([#1219](https://github.com/andymai/brepjs/issues/1219)) ([1a9b80f](https://github.com/andymai/brepjs/commit/1a9b80f3d3dbb44d7a8ae2f601ff305b70534efe))
* **brepjs-verify:** live text-to-cad eval flywheel ([#1215](https://github.com/andymai/brepjs/issues/1215)) ([4e81fc4](https://github.com/andymai/brepjs/commit/4e81fc4053491ce3e08182d57d76bd649252ea3c))
* **brepjs-verify:** standalone bundled CLI + rename from brepjs-cad ([#1211](https://github.com/andymai/brepjs/issues/1211)) ([05b3799](https://github.com/andymai/brepjs/commit/05b3799a0e9ee4968d4cac92f3a2ea236e39cd35))
* native thread() operation + maker-breadth skill references ([#1330](https://github.com/andymai/brepjs/issues/1330)) ([1bfc73d](https://github.com/andymai/brepjs/commit/1bfc73d696b0b779230e6ed3542e7b8415426992))
* **verify:** add center of mass to the verify report ([#1288](https://github.com/andymai/brepjs/issues/1288)) ([5738600](https://github.com/andymai/brepjs/commit/5738600e31f56c00d928d62e32ab9d5e8220b377))
* **verify:** add export_part MCP tool and sandbox export ([#1316](https://github.com/andymai/brepjs/issues/1316)) ([8a52f90](https://github.com/andymai/brepjs/commit/8a52f90c5b3d76c8bf6ef50a36c6977833af59bb))
* **verify:** add JSONL run-record provenance for sandbox runs ([#1309](https://github.com/andymai/brepjs/issues/1309)) ([6bda9b6](https://github.com/andymai/brepjs/commit/6bda9b630b8e4edf6eb860002c58b3e36cf1bfd4))
* **verify:** add manifold flag to the topology channel ([#1291](https://github.com/andymai/brepjs/issues/1291)) ([5ea5bb4](https://github.com/andymai/brepjs/commit/5ea5bb4db5bc8539f2773752e1c42770c91b5e0d))
* **verify:** add MCP server with run_program tool (stdio) ([#1300](https://github.com/andymai/brepjs/issues/1300)) ([e3c2c9e](https://github.com/andymai/brepjs/commit/e3c2c9e678dd719608cea8b6ee38101de9775e5d))
* **verify:** add topology counts to the verify report ([#1285](https://github.com/andymai/brepjs/issues/1285)) ([17a0eed](https://github.com/andymai/brepjs/commit/17a0eede727ac29007591cb0249274a35896facb))
* **verify:** sandbox executor — run agent code in an isolated child process ([#1295](https://github.com/andymai/brepjs/issues/1295)) ([8b72aa2](https://github.com/andymai/brepjs/commit/8b72aa2e272a58aa6d3886b8304eeaefb1a09b2e))
* **verify:** validate each body of multi-solid assemblies ([#1293](https://github.com/andymai/brepjs/issues/1293)) ([deb682f](https://github.com/andymai/brepjs/commit/deb682f1104179f261f232be7d94ceb154985328))
* **viewer:** click-to-inspect face picking in verify --serve ([#1278](https://github.com/andymai/brepjs/issues/1278)) ([735dc04](https://github.com/andymai/brepjs/commit/735dc0401143ff47046a79e6fb7bac53cf00a91e))
* **viewer:** measurements info panel in verify --serve ([#1277](https://github.com/andymai/brepjs/issues/1277)) ([c1ccf1d](https://github.com/andymai/brepjs/commit/c1ccf1d7c50ab43dc0444468f92fcf9365fda9da))
* **viewer:** orthographic/perspective projection toggle ([#1281](https://github.com/andymai/brepjs/issues/1281)) ([96673e4](https://github.com/andymai/brepjs/commit/96673e45e1ee316f9d26e52c995b4daba691e8b0))
* **viewer:** section/clipping plane in verify --serve ([#1279](https://github.com/andymai/brepjs/issues/1279)) ([cc0d00b](https://github.com/andymai/brepjs/commit/cc0d00b7a6296cc698fce1ae42b7503e6d47c032))
* **viewer:** shared ViewerControls toolbar; interactive verify --serve ([#1275](https://github.com/andymai/brepjs/issues/1275)) ([139ae15](https://github.com/andymai/brepjs/commit/139ae15a29d8a7ad5e520ba21d6dc9788242c089))


### Bug Fixes

* **brepjs-verify:** correct fillet/chamfer arg order in no-edges hints ([#1218](https://github.com/andymai/brepjs/issues/1218)) ([835f13a](https://github.com/andymai/brepjs/commit/835f13ac966b4264ba56a5cfc371bbbbbd1a0f01))
* **brepjs-verify:** point skills entry at ./skill directory, not SKILL.md ([#1270](https://github.com/andymai/brepjs/issues/1270)) ([9413a57](https://github.com/andymai/brepjs/commit/9413a57d8c2cac943371e75bcbaf11b3fdd9a657))
* **brepjs-verify:** repair preview viewer + GLB Y-up/materials fidelity ([#1271](https://github.com/andymai/brepjs/issues/1271)) ([2823d21](https://github.com/andymai/brepjs/commit/2823d212e2fc5f79e785911ec2b9f3320bdfdbbf))
* **verify:** reap orphaned sandbox processes on timeout and host shutdown ([#1380](https://github.com/andymai/brepjs/issues/1380)) ([7489ba8](https://github.com/andymai/brepjs/commit/7489ba8f665a71549d5b80367757f3373e1af0fb))
* **verify:** relax brepjs-viewer devDep to * so workspace links ([#1320](https://github.com/andymai/brepjs/issues/1320)) ([b26a18d](https://github.com/andymai/brepjs/commit/b26a18d406a051806c72e36d67da0f644588f315))
* **verify:** unpin brepjs-viewer devDep to workspace wildcard ([#1408](https://github.com/andymai/brepjs/issues/1408)) ([ab1d331](https://github.com/andymai/brepjs/commit/ab1d331908b5fd6d20a1e1cb2ab81aeaf6ad004a))

## [0.21.2](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.21.1...brepjs-verify-v0.21.2) (2026-06-15)

## [0.21.1](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.21.0...brepjs-verify-v0.21.1) (2026-06-15)


### Bug Fixes

* **verify:** unpin brepjs-viewer devDep to workspace wildcard ([#1408](https://github.com/andymai/brepjs/issues/1408)) ([ab1d331](https://github.com/andymai/brepjs/commit/ab1d331908b5fd6d20a1e1cb2ab81aeaf6ad004a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * brepjs bumped from ^18.0.0 to ^18.83.2
  * devDependencies
    * brepjs-viewer bumped from * to 0.2.1

## [0.21.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.20.1...brepjs-verify-v0.21.0) (2026-06-15)


### Features

* **brepjs-verify:** auto-open browser on --serve + document the MCP server ([#1308](https://github.com/andymai/brepjs/issues/1308)) ([de4272c](https://github.com/andymai/brepjs/commit/de4272c9196f70baec4ff762a33636fccef4c012))
* **brepjs-verify:** burn bbox dimensions into agent snapshots ([#1280](https://github.com/andymai/brepjs/issues/1280)) ([25b6b8d](https://github.com/andymai/brepjs/commit/25b6b8df68909a41eaef5307519a29a8a05ccc00))
* **brepjs-verify:** eval-driven skill, hint, and reference improvements ([#1219](https://github.com/andymai/brepjs/issues/1219)) ([1a9b80f](https://github.com/andymai/brepjs/commit/1a9b80f3d3dbb44d7a8ae2f601ff305b70534efe))
* **brepjs-verify:** live text-to-cad eval flywheel ([#1215](https://github.com/andymai/brepjs/issues/1215)) ([4e81fc4](https://github.com/andymai/brepjs/commit/4e81fc4053491ce3e08182d57d76bd649252ea3c))
* **brepjs-verify:** standalone bundled CLI + rename from brepjs-cad ([#1211](https://github.com/andymai/brepjs/issues/1211)) ([05b3799](https://github.com/andymai/brepjs/commit/05b3799a0e9ee4968d4cac92f3a2ea236e39cd35))
* native thread() operation + maker-breadth skill references ([#1330](https://github.com/andymai/brepjs/issues/1330)) ([1bfc73d](https://github.com/andymai/brepjs/commit/1bfc73d696b0b779230e6ed3542e7b8415426992))
* **verify:** add center of mass to the verify report ([#1288](https://github.com/andymai/brepjs/issues/1288)) ([5738600](https://github.com/andymai/brepjs/commit/5738600e31f56c00d928d62e32ab9d5e8220b377))
* **verify:** add export_part MCP tool and sandbox export ([#1316](https://github.com/andymai/brepjs/issues/1316)) ([8a52f90](https://github.com/andymai/brepjs/commit/8a52f90c5b3d76c8bf6ef50a36c6977833af59bb))
* **verify:** add JSONL run-record provenance for sandbox runs ([#1309](https://github.com/andymai/brepjs/issues/1309)) ([6bda9b6](https://github.com/andymai/brepjs/commit/6bda9b630b8e4edf6eb860002c58b3e36cf1bfd4))
* **verify:** add manifold flag to the topology channel ([#1291](https://github.com/andymai/brepjs/issues/1291)) ([5ea5bb4](https://github.com/andymai/brepjs/commit/5ea5bb4db5bc8539f2773752e1c42770c91b5e0d))
* **verify:** add MCP server with run_program tool (stdio) ([#1300](https://github.com/andymai/brepjs/issues/1300)) ([e3c2c9e](https://github.com/andymai/brepjs/commit/e3c2c9e678dd719608cea8b6ee38101de9775e5d))
* **verify:** add topology counts to the verify report ([#1285](https://github.com/andymai/brepjs/issues/1285)) ([17a0eed](https://github.com/andymai/brepjs/commit/17a0eede727ac29007591cb0249274a35896facb))
* **verify:** sandbox executor — run agent code in an isolated child process ([#1295](https://github.com/andymai/brepjs/issues/1295)) ([8b72aa2](https://github.com/andymai/brepjs/commit/8b72aa2e272a58aa6d3886b8304eeaefb1a09b2e))
* **verify:** validate each body of multi-solid assemblies ([#1293](https://github.com/andymai/brepjs/issues/1293)) ([deb682f](https://github.com/andymai/brepjs/commit/deb682f1104179f261f232be7d94ceb154985328))
* **viewer:** click-to-inspect face picking in verify --serve ([#1278](https://github.com/andymai/brepjs/issues/1278)) ([735dc04](https://github.com/andymai/brepjs/commit/735dc0401143ff47046a79e6fb7bac53cf00a91e))
* **viewer:** measurements info panel in verify --serve ([#1277](https://github.com/andymai/brepjs/issues/1277)) ([c1ccf1d](https://github.com/andymai/brepjs/commit/c1ccf1d7c50ab43dc0444468f92fcf9365fda9da))
* **viewer:** orthographic/perspective projection toggle ([#1281](https://github.com/andymai/brepjs/issues/1281)) ([96673e4](https://github.com/andymai/brepjs/commit/96673e45e1ee316f9d26e52c995b4daba691e8b0))
* **viewer:** section/clipping plane in verify --serve ([#1279](https://github.com/andymai/brepjs/issues/1279)) ([cc0d00b](https://github.com/andymai/brepjs/commit/cc0d00b7a6296cc698fce1ae42b7503e6d47c032))
* **viewer:** shared ViewerControls toolbar; interactive verify --serve ([#1275](https://github.com/andymai/brepjs/issues/1275)) ([139ae15](https://github.com/andymai/brepjs/commit/139ae15a29d8a7ad5e520ba21d6dc9788242c089))


### Bug Fixes

* **brepjs-verify:** correct fillet/chamfer arg order in no-edges hints ([#1218](https://github.com/andymai/brepjs/issues/1218)) ([835f13a](https://github.com/andymai/brepjs/commit/835f13ac966b4264ba56a5cfc371bbbbbd1a0f01))
* **brepjs-verify:** point skills entry at ./skill directory, not SKILL.md ([#1270](https://github.com/andymai/brepjs/issues/1270)) ([9413a57](https://github.com/andymai/brepjs/commit/9413a57d8c2cac943371e75bcbaf11b3fdd9a657))
* **brepjs-verify:** repair preview viewer + GLB Y-up/materials fidelity ([#1271](https://github.com/andymai/brepjs/issues/1271)) ([2823d21](https://github.com/andymai/brepjs/commit/2823d212e2fc5f79e785911ec2b9f3320bdfdbbf))
* **verify:** reap orphaned sandbox processes on timeout and host shutdown ([#1380](https://github.com/andymai/brepjs/issues/1380)) ([7489ba8](https://github.com/andymai/brepjs/commit/7489ba8f665a71549d5b80367757f3373e1af0fb))
* **verify:** relax brepjs-viewer devDep to * so workspace links ([#1320](https://github.com/andymai/brepjs/issues/1320)) ([b26a18d](https://github.com/andymai/brepjs/commit/b26a18d406a051806c72e36d67da0f644588f315))

## [0.20.1](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.20.0...brepjs-verify-v0.20.1) (2026-06-15)

## [0.20.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.19.1...brepjs-verify-v0.20.0) (2026-06-15)


### Features

* **brepjs-verify:** auto-open browser on --serve + document the MCP server ([#1308](https://github.com/andymai/brepjs/issues/1308)) ([de4272c](https://github.com/andymai/brepjs/commit/de4272c9196f70baec4ff762a33636fccef4c012))
* **brepjs-verify:** burn bbox dimensions into agent snapshots ([#1280](https://github.com/andymai/brepjs/issues/1280)) ([25b6b8d](https://github.com/andymai/brepjs/commit/25b6b8df68909a41eaef5307519a29a8a05ccc00))
* **brepjs-verify:** eval-driven skill, hint, and reference improvements ([#1219](https://github.com/andymai/brepjs/issues/1219)) ([1a9b80f](https://github.com/andymai/brepjs/commit/1a9b80f3d3dbb44d7a8ae2f601ff305b70534efe))
* **brepjs-verify:** live text-to-cad eval flywheel ([#1215](https://github.com/andymai/brepjs/issues/1215)) ([4e81fc4](https://github.com/andymai/brepjs/commit/4e81fc4053491ce3e08182d57d76bd649252ea3c))
* **brepjs-verify:** standalone bundled CLI + rename from brepjs-cad ([#1211](https://github.com/andymai/brepjs/issues/1211)) ([05b3799](https://github.com/andymai/brepjs/commit/05b3799a0e9ee4968d4cac92f3a2ea236e39cd35))
* native thread() operation + maker-breadth skill references ([#1330](https://github.com/andymai/brepjs/issues/1330)) ([1bfc73d](https://github.com/andymai/brepjs/commit/1bfc73d696b0b779230e6ed3542e7b8415426992))
* **verify:** add center of mass to the verify report ([#1288](https://github.com/andymai/brepjs/issues/1288)) ([5738600](https://github.com/andymai/brepjs/commit/5738600e31f56c00d928d62e32ab9d5e8220b377))
* **verify:** add export_part MCP tool and sandbox export ([#1316](https://github.com/andymai/brepjs/issues/1316)) ([8a52f90](https://github.com/andymai/brepjs/commit/8a52f90c5b3d76c8bf6ef50a36c6977833af59bb))
* **verify:** add JSONL run-record provenance for sandbox runs ([#1309](https://github.com/andymai/brepjs/issues/1309)) ([6bda9b6](https://github.com/andymai/brepjs/commit/6bda9b630b8e4edf6eb860002c58b3e36cf1bfd4))
* **verify:** add manifold flag to the topology channel ([#1291](https://github.com/andymai/brepjs/issues/1291)) ([5ea5bb4](https://github.com/andymai/brepjs/commit/5ea5bb4db5bc8539f2773752e1c42770c91b5e0d))
* **verify:** add MCP server with run_program tool (stdio) ([#1300](https://github.com/andymai/brepjs/issues/1300)) ([e3c2c9e](https://github.com/andymai/brepjs/commit/e3c2c9e678dd719608cea8b6ee38101de9775e5d))
* **verify:** add topology counts to the verify report ([#1285](https://github.com/andymai/brepjs/issues/1285)) ([17a0eed](https://github.com/andymai/brepjs/commit/17a0eede727ac29007591cb0249274a35896facb))
* **verify:** sandbox executor — run agent code in an isolated child process ([#1295](https://github.com/andymai/brepjs/issues/1295)) ([8b72aa2](https://github.com/andymai/brepjs/commit/8b72aa2e272a58aa6d3886b8304eeaefb1a09b2e))
* **verify:** validate each body of multi-solid assemblies ([#1293](https://github.com/andymai/brepjs/issues/1293)) ([deb682f](https://github.com/andymai/brepjs/commit/deb682f1104179f261f232be7d94ceb154985328))
* **viewer:** click-to-inspect face picking in verify --serve ([#1278](https://github.com/andymai/brepjs/issues/1278)) ([735dc04](https://github.com/andymai/brepjs/commit/735dc0401143ff47046a79e6fb7bac53cf00a91e))
* **viewer:** measurements info panel in verify --serve ([#1277](https://github.com/andymai/brepjs/issues/1277)) ([c1ccf1d](https://github.com/andymai/brepjs/commit/c1ccf1d7c50ab43dc0444468f92fcf9365fda9da))
* **viewer:** orthographic/perspective projection toggle ([#1281](https://github.com/andymai/brepjs/issues/1281)) ([96673e4](https://github.com/andymai/brepjs/commit/96673e45e1ee316f9d26e52c995b4daba691e8b0))
* **viewer:** section/clipping plane in verify --serve ([#1279](https://github.com/andymai/brepjs/issues/1279)) ([cc0d00b](https://github.com/andymai/brepjs/commit/cc0d00b7a6296cc698fce1ae42b7503e6d47c032))
* **viewer:** shared ViewerControls toolbar; interactive verify --serve ([#1275](https://github.com/andymai/brepjs/issues/1275)) ([139ae15](https://github.com/andymai/brepjs/commit/139ae15a29d8a7ad5e520ba21d6dc9788242c089))


### Bug Fixes

* **brepjs-verify:** correct fillet/chamfer arg order in no-edges hints ([#1218](https://github.com/andymai/brepjs/issues/1218)) ([835f13a](https://github.com/andymai/brepjs/commit/835f13ac966b4264ba56a5cfc371bbbbbd1a0f01))
* **brepjs-verify:** point skills entry at ./skill directory, not SKILL.md ([#1270](https://github.com/andymai/brepjs/issues/1270)) ([9413a57](https://github.com/andymai/brepjs/commit/9413a57d8c2cac943371e75bcbaf11b3fdd9a657))
* **brepjs-verify:** repair preview viewer + GLB Y-up/materials fidelity ([#1271](https://github.com/andymai/brepjs/issues/1271)) ([2823d21](https://github.com/andymai/brepjs/commit/2823d212e2fc5f79e785911ec2b9f3320bdfdbbf))
* **verify:** reap orphaned sandbox processes on timeout and host shutdown ([#1380](https://github.com/andymai/brepjs/issues/1380)) ([7489ba8](https://github.com/andymai/brepjs/commit/7489ba8f665a71549d5b80367757f3373e1af0fb))
* **verify:** relax brepjs-viewer devDep to * so workspace links ([#1320](https://github.com/andymai/brepjs/issues/1320)) ([b26a18d](https://github.com/andymai/brepjs/commit/b26a18d406a051806c72e36d67da0f644588f315))

## [0.19.1](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.19.0...brepjs-verify-v0.19.1) (2026-06-15)

## [0.19.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.18.1...brepjs-verify-v0.19.0) (2026-06-15)


### Features

* **brepjs-verify:** auto-open browser on --serve + document the MCP server ([#1308](https://github.com/andymai/brepjs/issues/1308)) ([de4272c](https://github.com/andymai/brepjs/commit/de4272c9196f70baec4ff762a33636fccef4c012))
* **brepjs-verify:** burn bbox dimensions into agent snapshots ([#1280](https://github.com/andymai/brepjs/issues/1280)) ([25b6b8d](https://github.com/andymai/brepjs/commit/25b6b8df68909a41eaef5307519a29a8a05ccc00))
* **brepjs-verify:** eval-driven skill, hint, and reference improvements ([#1219](https://github.com/andymai/brepjs/issues/1219)) ([1a9b80f](https://github.com/andymai/brepjs/commit/1a9b80f3d3dbb44d7a8ae2f601ff305b70534efe))
* **brepjs-verify:** live text-to-cad eval flywheel ([#1215](https://github.com/andymai/brepjs/issues/1215)) ([4e81fc4](https://github.com/andymai/brepjs/commit/4e81fc4053491ce3e08182d57d76bd649252ea3c))
* **brepjs-verify:** standalone bundled CLI + rename from brepjs-cad ([#1211](https://github.com/andymai/brepjs/issues/1211)) ([05b3799](https://github.com/andymai/brepjs/commit/05b3799a0e9ee4968d4cac92f3a2ea236e39cd35))
* native thread() operation + maker-breadth skill references ([#1330](https://github.com/andymai/brepjs/issues/1330)) ([1bfc73d](https://github.com/andymai/brepjs/commit/1bfc73d696b0b779230e6ed3542e7b8415426992))
* **verify:** add center of mass to the verify report ([#1288](https://github.com/andymai/brepjs/issues/1288)) ([5738600](https://github.com/andymai/brepjs/commit/5738600e31f56c00d928d62e32ab9d5e8220b377))
* **verify:** add export_part MCP tool and sandbox export ([#1316](https://github.com/andymai/brepjs/issues/1316)) ([8a52f90](https://github.com/andymai/brepjs/commit/8a52f90c5b3d76c8bf6ef50a36c6977833af59bb))
* **verify:** add JSONL run-record provenance for sandbox runs ([#1309](https://github.com/andymai/brepjs/issues/1309)) ([6bda9b6](https://github.com/andymai/brepjs/commit/6bda9b630b8e4edf6eb860002c58b3e36cf1bfd4))
* **verify:** add manifold flag to the topology channel ([#1291](https://github.com/andymai/brepjs/issues/1291)) ([5ea5bb4](https://github.com/andymai/brepjs/commit/5ea5bb4db5bc8539f2773752e1c42770c91b5e0d))
* **verify:** add MCP server with run_program tool (stdio) ([#1300](https://github.com/andymai/brepjs/issues/1300)) ([e3c2c9e](https://github.com/andymai/brepjs/commit/e3c2c9e678dd719608cea8b6ee38101de9775e5d))
* **verify:** add topology counts to the verify report ([#1285](https://github.com/andymai/brepjs/issues/1285)) ([17a0eed](https://github.com/andymai/brepjs/commit/17a0eede727ac29007591cb0249274a35896facb))
* **verify:** sandbox executor — run agent code in an isolated child process ([#1295](https://github.com/andymai/brepjs/issues/1295)) ([8b72aa2](https://github.com/andymai/brepjs/commit/8b72aa2e272a58aa6d3886b8304eeaefb1a09b2e))
* **verify:** validate each body of multi-solid assemblies ([#1293](https://github.com/andymai/brepjs/issues/1293)) ([deb682f](https://github.com/andymai/brepjs/commit/deb682f1104179f261f232be7d94ceb154985328))
* **viewer:** click-to-inspect face picking in verify --serve ([#1278](https://github.com/andymai/brepjs/issues/1278)) ([735dc04](https://github.com/andymai/brepjs/commit/735dc0401143ff47046a79e6fb7bac53cf00a91e))
* **viewer:** measurements info panel in verify --serve ([#1277](https://github.com/andymai/brepjs/issues/1277)) ([c1ccf1d](https://github.com/andymai/brepjs/commit/c1ccf1d7c50ab43dc0444468f92fcf9365fda9da))
* **viewer:** orthographic/perspective projection toggle ([#1281](https://github.com/andymai/brepjs/issues/1281)) ([96673e4](https://github.com/andymai/brepjs/commit/96673e45e1ee316f9d26e52c995b4daba691e8b0))
* **viewer:** section/clipping plane in verify --serve ([#1279](https://github.com/andymai/brepjs/issues/1279)) ([cc0d00b](https://github.com/andymai/brepjs/commit/cc0d00b7a6296cc698fce1ae42b7503e6d47c032))
* **viewer:** shared ViewerControls toolbar; interactive verify --serve ([#1275](https://github.com/andymai/brepjs/issues/1275)) ([139ae15](https://github.com/andymai/brepjs/commit/139ae15a29d8a7ad5e520ba21d6dc9788242c089))


### Bug Fixes

* **brepjs-verify:** correct fillet/chamfer arg order in no-edges hints ([#1218](https://github.com/andymai/brepjs/issues/1218)) ([835f13a](https://github.com/andymai/brepjs/commit/835f13ac966b4264ba56a5cfc371bbbbbd1a0f01))
* **brepjs-verify:** point skills entry at ./skill directory, not SKILL.md ([#1270](https://github.com/andymai/brepjs/issues/1270)) ([9413a57](https://github.com/andymai/brepjs/commit/9413a57d8c2cac943371e75bcbaf11b3fdd9a657))
* **brepjs-verify:** repair preview viewer + GLB Y-up/materials fidelity ([#1271](https://github.com/andymai/brepjs/issues/1271)) ([2823d21](https://github.com/andymai/brepjs/commit/2823d212e2fc5f79e785911ec2b9f3320bdfdbbf))
* **verify:** reap orphaned sandbox processes on timeout and host shutdown ([#1380](https://github.com/andymai/brepjs/issues/1380)) ([7489ba8](https://github.com/andymai/brepjs/commit/7489ba8f665a71549d5b80367757f3373e1af0fb))
* **verify:** relax brepjs-viewer devDep to * so workspace links ([#1320](https://github.com/andymai/brepjs/issues/1320)) ([b26a18d](https://github.com/andymai/brepjs/commit/b26a18d406a051806c72e36d67da0f644588f315))

## [0.18.1](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.18.0...brepjs-verify-v0.18.1) (2026-06-15)

## [0.18.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.17.1...brepjs-verify-v0.18.0) (2026-06-15)


### Features

* **brepjs-verify:** auto-open browser on --serve + document the MCP server ([#1308](https://github.com/andymai/brepjs/issues/1308)) ([de4272c](https://github.com/andymai/brepjs/commit/de4272c9196f70baec4ff762a33636fccef4c012))
* **brepjs-verify:** burn bbox dimensions into agent snapshots ([#1280](https://github.com/andymai/brepjs/issues/1280)) ([25b6b8d](https://github.com/andymai/brepjs/commit/25b6b8df68909a41eaef5307519a29a8a05ccc00))
* **brepjs-verify:** eval-driven skill, hint, and reference improvements ([#1219](https://github.com/andymai/brepjs/issues/1219)) ([1a9b80f](https://github.com/andymai/brepjs/commit/1a9b80f3d3dbb44d7a8ae2f601ff305b70534efe))
* **brepjs-verify:** live text-to-cad eval flywheel ([#1215](https://github.com/andymai/brepjs/issues/1215)) ([4e81fc4](https://github.com/andymai/brepjs/commit/4e81fc4053491ce3e08182d57d76bd649252ea3c))
* **brepjs-verify:** standalone bundled CLI + rename from brepjs-cad ([#1211](https://github.com/andymai/brepjs/issues/1211)) ([05b3799](https://github.com/andymai/brepjs/commit/05b3799a0e9ee4968d4cac92f3a2ea236e39cd35))
* native thread() operation + maker-breadth skill references ([#1330](https://github.com/andymai/brepjs/issues/1330)) ([1bfc73d](https://github.com/andymai/brepjs/commit/1bfc73d696b0b779230e6ed3542e7b8415426992))
* **verify:** add center of mass to the verify report ([#1288](https://github.com/andymai/brepjs/issues/1288)) ([5738600](https://github.com/andymai/brepjs/commit/5738600e31f56c00d928d62e32ab9d5e8220b377))
* **verify:** add export_part MCP tool and sandbox export ([#1316](https://github.com/andymai/brepjs/issues/1316)) ([8a52f90](https://github.com/andymai/brepjs/commit/8a52f90c5b3d76c8bf6ef50a36c6977833af59bb))
* **verify:** add JSONL run-record provenance for sandbox runs ([#1309](https://github.com/andymai/brepjs/issues/1309)) ([6bda9b6](https://github.com/andymai/brepjs/commit/6bda9b630b8e4edf6eb860002c58b3e36cf1bfd4))
* **verify:** add manifold flag to the topology channel ([#1291](https://github.com/andymai/brepjs/issues/1291)) ([5ea5bb4](https://github.com/andymai/brepjs/commit/5ea5bb4db5bc8539f2773752e1c42770c91b5e0d))
* **verify:** add MCP server with run_program tool (stdio) ([#1300](https://github.com/andymai/brepjs/issues/1300)) ([e3c2c9e](https://github.com/andymai/brepjs/commit/e3c2c9e678dd719608cea8b6ee38101de9775e5d))
* **verify:** add topology counts to the verify report ([#1285](https://github.com/andymai/brepjs/issues/1285)) ([17a0eed](https://github.com/andymai/brepjs/commit/17a0eede727ac29007591cb0249274a35896facb))
* **verify:** sandbox executor — run agent code in an isolated child process ([#1295](https://github.com/andymai/brepjs/issues/1295)) ([8b72aa2](https://github.com/andymai/brepjs/commit/8b72aa2e272a58aa6d3886b8304eeaefb1a09b2e))
* **verify:** validate each body of multi-solid assemblies ([#1293](https://github.com/andymai/brepjs/issues/1293)) ([deb682f](https://github.com/andymai/brepjs/commit/deb682f1104179f261f232be7d94ceb154985328))
* **viewer:** click-to-inspect face picking in verify --serve ([#1278](https://github.com/andymai/brepjs/issues/1278)) ([735dc04](https://github.com/andymai/brepjs/commit/735dc0401143ff47046a79e6fb7bac53cf00a91e))
* **viewer:** measurements info panel in verify --serve ([#1277](https://github.com/andymai/brepjs/issues/1277)) ([c1ccf1d](https://github.com/andymai/brepjs/commit/c1ccf1d7c50ab43dc0444468f92fcf9365fda9da))
* **viewer:** orthographic/perspective projection toggle ([#1281](https://github.com/andymai/brepjs/issues/1281)) ([96673e4](https://github.com/andymai/brepjs/commit/96673e45e1ee316f9d26e52c995b4daba691e8b0))
* **viewer:** section/clipping plane in verify --serve ([#1279](https://github.com/andymai/brepjs/issues/1279)) ([cc0d00b](https://github.com/andymai/brepjs/commit/cc0d00b7a6296cc698fce1ae42b7503e6d47c032))
* **viewer:** shared ViewerControls toolbar; interactive verify --serve ([#1275](https://github.com/andymai/brepjs/issues/1275)) ([139ae15](https://github.com/andymai/brepjs/commit/139ae15a29d8a7ad5e520ba21d6dc9788242c089))


### Bug Fixes

* **brepjs-verify:** correct fillet/chamfer arg order in no-edges hints ([#1218](https://github.com/andymai/brepjs/issues/1218)) ([835f13a](https://github.com/andymai/brepjs/commit/835f13ac966b4264ba56a5cfc371bbbbbd1a0f01))
* **brepjs-verify:** point skills entry at ./skill directory, not SKILL.md ([#1270](https://github.com/andymai/brepjs/issues/1270)) ([9413a57](https://github.com/andymai/brepjs/commit/9413a57d8c2cac943371e75bcbaf11b3fdd9a657))
* **brepjs-verify:** repair preview viewer + GLB Y-up/materials fidelity ([#1271](https://github.com/andymai/brepjs/issues/1271)) ([2823d21](https://github.com/andymai/brepjs/commit/2823d212e2fc5f79e785911ec2b9f3320bdfdbbf))
* **verify:** reap orphaned sandbox processes on timeout and host shutdown ([#1380](https://github.com/andymai/brepjs/issues/1380)) ([7489ba8](https://github.com/andymai/brepjs/commit/7489ba8f665a71549d5b80367757f3373e1af0fb))
* **verify:** relax brepjs-viewer devDep to * so workspace links ([#1320](https://github.com/andymai/brepjs/issues/1320)) ([b26a18d](https://github.com/andymai/brepjs/commit/b26a18d406a051806c72e36d67da0f644588f315))

## [0.17.1](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.17.0...brepjs-verify-v0.17.1) (2026-06-15)

## [0.17.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.16.2...brepjs-verify-v0.17.0) (2026-06-15)


### Features

* **brepjs-verify:** auto-open browser on --serve + document the MCP server ([#1308](https://github.com/andymai/brepjs/issues/1308)) ([de4272c](https://github.com/andymai/brepjs/commit/de4272c9196f70baec4ff762a33636fccef4c012))
* **brepjs-verify:** burn bbox dimensions into agent snapshots ([#1280](https://github.com/andymai/brepjs/issues/1280)) ([25b6b8d](https://github.com/andymai/brepjs/commit/25b6b8df68909a41eaef5307519a29a8a05ccc00))
* **brepjs-verify:** eval-driven skill, hint, and reference improvements ([#1219](https://github.com/andymai/brepjs/issues/1219)) ([1a9b80f](https://github.com/andymai/brepjs/commit/1a9b80f3d3dbb44d7a8ae2f601ff305b70534efe))
* **brepjs-verify:** live text-to-cad eval flywheel ([#1215](https://github.com/andymai/brepjs/issues/1215)) ([4e81fc4](https://github.com/andymai/brepjs/commit/4e81fc4053491ce3e08182d57d76bd649252ea3c))
* **brepjs-verify:** standalone bundled CLI + rename from brepjs-cad ([#1211](https://github.com/andymai/brepjs/issues/1211)) ([05b3799](https://github.com/andymai/brepjs/commit/05b3799a0e9ee4968d4cac92f3a2ea236e39cd35))
* native thread() operation + maker-breadth skill references ([#1330](https://github.com/andymai/brepjs/issues/1330)) ([1bfc73d](https://github.com/andymai/brepjs/commit/1bfc73d696b0b779230e6ed3542e7b8415426992))
* **verify:** add center of mass to the verify report ([#1288](https://github.com/andymai/brepjs/issues/1288)) ([5738600](https://github.com/andymai/brepjs/commit/5738600e31f56c00d928d62e32ab9d5e8220b377))
* **verify:** add export_part MCP tool and sandbox export ([#1316](https://github.com/andymai/brepjs/issues/1316)) ([8a52f90](https://github.com/andymai/brepjs/commit/8a52f90c5b3d76c8bf6ef50a36c6977833af59bb))
* **verify:** add JSONL run-record provenance for sandbox runs ([#1309](https://github.com/andymai/brepjs/issues/1309)) ([6bda9b6](https://github.com/andymai/brepjs/commit/6bda9b630b8e4edf6eb860002c58b3e36cf1bfd4))
* **verify:** add manifold flag to the topology channel ([#1291](https://github.com/andymai/brepjs/issues/1291)) ([5ea5bb4](https://github.com/andymai/brepjs/commit/5ea5bb4db5bc8539f2773752e1c42770c91b5e0d))
* **verify:** add MCP server with run_program tool (stdio) ([#1300](https://github.com/andymai/brepjs/issues/1300)) ([e3c2c9e](https://github.com/andymai/brepjs/commit/e3c2c9e678dd719608cea8b6ee38101de9775e5d))
* **verify:** add topology counts to the verify report ([#1285](https://github.com/andymai/brepjs/issues/1285)) ([17a0eed](https://github.com/andymai/brepjs/commit/17a0eede727ac29007591cb0249274a35896facb))
* **verify:** sandbox executor — run agent code in an isolated child process ([#1295](https://github.com/andymai/brepjs/issues/1295)) ([8b72aa2](https://github.com/andymai/brepjs/commit/8b72aa2e272a58aa6d3886b8304eeaefb1a09b2e))
* **verify:** validate each body of multi-solid assemblies ([#1293](https://github.com/andymai/brepjs/issues/1293)) ([deb682f](https://github.com/andymai/brepjs/commit/deb682f1104179f261f232be7d94ceb154985328))
* **viewer:** click-to-inspect face picking in verify --serve ([#1278](https://github.com/andymai/brepjs/issues/1278)) ([735dc04](https://github.com/andymai/brepjs/commit/735dc0401143ff47046a79e6fb7bac53cf00a91e))
* **viewer:** measurements info panel in verify --serve ([#1277](https://github.com/andymai/brepjs/issues/1277)) ([c1ccf1d](https://github.com/andymai/brepjs/commit/c1ccf1d7c50ab43dc0444468f92fcf9365fda9da))
* **viewer:** orthographic/perspective projection toggle ([#1281](https://github.com/andymai/brepjs/issues/1281)) ([96673e4](https://github.com/andymai/brepjs/commit/96673e45e1ee316f9d26e52c995b4daba691e8b0))
* **viewer:** section/clipping plane in verify --serve ([#1279](https://github.com/andymai/brepjs/issues/1279)) ([cc0d00b](https://github.com/andymai/brepjs/commit/cc0d00b7a6296cc698fce1ae42b7503e6d47c032))
* **viewer:** shared ViewerControls toolbar; interactive verify --serve ([#1275](https://github.com/andymai/brepjs/issues/1275)) ([139ae15](https://github.com/andymai/brepjs/commit/139ae15a29d8a7ad5e520ba21d6dc9788242c089))


### Bug Fixes

* **brepjs-verify:** correct fillet/chamfer arg order in no-edges hints ([#1218](https://github.com/andymai/brepjs/issues/1218)) ([835f13a](https://github.com/andymai/brepjs/commit/835f13ac966b4264ba56a5cfc371bbbbbd1a0f01))
* **brepjs-verify:** point skills entry at ./skill directory, not SKILL.md ([#1270](https://github.com/andymai/brepjs/issues/1270)) ([9413a57](https://github.com/andymai/brepjs/commit/9413a57d8c2cac943371e75bcbaf11b3fdd9a657))
* **brepjs-verify:** repair preview viewer + GLB Y-up/materials fidelity ([#1271](https://github.com/andymai/brepjs/issues/1271)) ([2823d21](https://github.com/andymai/brepjs/commit/2823d212e2fc5f79e785911ec2b9f3320bdfdbbf))
* **verify:** reap orphaned sandbox processes on timeout and host shutdown ([#1380](https://github.com/andymai/brepjs/issues/1380)) ([7489ba8](https://github.com/andymai/brepjs/commit/7489ba8f665a71549d5b80367757f3373e1af0fb))
* **verify:** relax brepjs-viewer devDep to * so workspace links ([#1320](https://github.com/andymai/brepjs/issues/1320)) ([b26a18d](https://github.com/andymai/brepjs/commit/b26a18d406a051806c72e36d67da0f644588f315))

## [0.16.2](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.16.1...brepjs-verify-v0.16.2) (2026-06-15)

## [0.16.1](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.16.0...brepjs-verify-v0.16.1) (2026-06-15)

## [0.16.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.15.1...brepjs-verify-v0.16.0) (2026-06-15)


### Features

* **brepjs-verify:** auto-open browser on --serve + document the MCP server ([#1308](https://github.com/andymai/brepjs/issues/1308)) ([de4272c](https://github.com/andymai/brepjs/commit/de4272c9196f70baec4ff762a33636fccef4c012))
* **brepjs-verify:** burn bbox dimensions into agent snapshots ([#1280](https://github.com/andymai/brepjs/issues/1280)) ([25b6b8d](https://github.com/andymai/brepjs/commit/25b6b8df68909a41eaef5307519a29a8a05ccc00))
* **brepjs-verify:** eval-driven skill, hint, and reference improvements ([#1219](https://github.com/andymai/brepjs/issues/1219)) ([1a9b80f](https://github.com/andymai/brepjs/commit/1a9b80f3d3dbb44d7a8ae2f601ff305b70534efe))
* **brepjs-verify:** live text-to-cad eval flywheel ([#1215](https://github.com/andymai/brepjs/issues/1215)) ([4e81fc4](https://github.com/andymai/brepjs/commit/4e81fc4053491ce3e08182d57d76bd649252ea3c))
* **brepjs-verify:** standalone bundled CLI + rename from brepjs-cad ([#1211](https://github.com/andymai/brepjs/issues/1211)) ([05b3799](https://github.com/andymai/brepjs/commit/05b3799a0e9ee4968d4cac92f3a2ea236e39cd35))
* native thread() operation + maker-breadth skill references ([#1330](https://github.com/andymai/brepjs/issues/1330)) ([1bfc73d](https://github.com/andymai/brepjs/commit/1bfc73d696b0b779230e6ed3542e7b8415426992))
* **verify:** add center of mass to the verify report ([#1288](https://github.com/andymai/brepjs/issues/1288)) ([5738600](https://github.com/andymai/brepjs/commit/5738600e31f56c00d928d62e32ab9d5e8220b377))
* **verify:** add export_part MCP tool and sandbox export ([#1316](https://github.com/andymai/brepjs/issues/1316)) ([8a52f90](https://github.com/andymai/brepjs/commit/8a52f90c5b3d76c8bf6ef50a36c6977833af59bb))
* **verify:** add JSONL run-record provenance for sandbox runs ([#1309](https://github.com/andymai/brepjs/issues/1309)) ([6bda9b6](https://github.com/andymai/brepjs/commit/6bda9b630b8e4edf6eb860002c58b3e36cf1bfd4))
* **verify:** add manifold flag to the topology channel ([#1291](https://github.com/andymai/brepjs/issues/1291)) ([5ea5bb4](https://github.com/andymai/brepjs/commit/5ea5bb4db5bc8539f2773752e1c42770c91b5e0d))
* **verify:** add MCP server with run_program tool (stdio) ([#1300](https://github.com/andymai/brepjs/issues/1300)) ([e3c2c9e](https://github.com/andymai/brepjs/commit/e3c2c9e678dd719608cea8b6ee38101de9775e5d))
* **verify:** add topology counts to the verify report ([#1285](https://github.com/andymai/brepjs/issues/1285)) ([17a0eed](https://github.com/andymai/brepjs/commit/17a0eede727ac29007591cb0249274a35896facb))
* **verify:** sandbox executor — run agent code in an isolated child process ([#1295](https://github.com/andymai/brepjs/issues/1295)) ([8b72aa2](https://github.com/andymai/brepjs/commit/8b72aa2e272a58aa6d3886b8304eeaefb1a09b2e))
* **verify:** validate each body of multi-solid assemblies ([#1293](https://github.com/andymai/brepjs/issues/1293)) ([deb682f](https://github.com/andymai/brepjs/commit/deb682f1104179f261f232be7d94ceb154985328))
* **viewer:** click-to-inspect face picking in verify --serve ([#1278](https://github.com/andymai/brepjs/issues/1278)) ([735dc04](https://github.com/andymai/brepjs/commit/735dc0401143ff47046a79e6fb7bac53cf00a91e))
* **viewer:** measurements info panel in verify --serve ([#1277](https://github.com/andymai/brepjs/issues/1277)) ([c1ccf1d](https://github.com/andymai/brepjs/commit/c1ccf1d7c50ab43dc0444468f92fcf9365fda9da))
* **viewer:** orthographic/perspective projection toggle ([#1281](https://github.com/andymai/brepjs/issues/1281)) ([96673e4](https://github.com/andymai/brepjs/commit/96673e45e1ee316f9d26e52c995b4daba691e8b0))
* **viewer:** section/clipping plane in verify --serve ([#1279](https://github.com/andymai/brepjs/issues/1279)) ([cc0d00b](https://github.com/andymai/brepjs/commit/cc0d00b7a6296cc698fce1ae42b7503e6d47c032))
* **viewer:** shared ViewerControls toolbar; interactive verify --serve ([#1275](https://github.com/andymai/brepjs/issues/1275)) ([139ae15](https://github.com/andymai/brepjs/commit/139ae15a29d8a7ad5e520ba21d6dc9788242c089))


### Bug Fixes

* **brepjs-verify:** correct fillet/chamfer arg order in no-edges hints ([#1218](https://github.com/andymai/brepjs/issues/1218)) ([835f13a](https://github.com/andymai/brepjs/commit/835f13ac966b4264ba56a5cfc371bbbbbd1a0f01))
* **brepjs-verify:** point skills entry at ./skill directory, not SKILL.md ([#1270](https://github.com/andymai/brepjs/issues/1270)) ([9413a57](https://github.com/andymai/brepjs/commit/9413a57d8c2cac943371e75bcbaf11b3fdd9a657))
* **brepjs-verify:** repair preview viewer + GLB Y-up/materials fidelity ([#1271](https://github.com/andymai/brepjs/issues/1271)) ([2823d21](https://github.com/andymai/brepjs/commit/2823d212e2fc5f79e785911ec2b9f3320bdfdbbf))
* **verify:** reap orphaned sandbox processes on timeout and host shutdown ([#1380](https://github.com/andymai/brepjs/issues/1380)) ([7489ba8](https://github.com/andymai/brepjs/commit/7489ba8f665a71549d5b80367757f3373e1af0fb))
* **verify:** relax brepjs-viewer devDep to * so workspace links ([#1320](https://github.com/andymai/brepjs/issues/1320)) ([b26a18d](https://github.com/andymai/brepjs/commit/b26a18d406a051806c72e36d67da0f644588f315))

## [0.15.1](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.15.0...brepjs-verify-v0.15.1) (2026-06-15)


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * brepjs-viewer bumped from * to 0.2.1

## [0.15.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.14.0...brepjs-verify-v0.15.0) (2026-06-15)


### Features

* **brepjs-verify:** auto-open browser on --serve + document the MCP server ([#1308](https://github.com/andymai/brepjs/issues/1308)) ([de4272c](https://github.com/andymai/brepjs/commit/de4272c9196f70baec4ff762a33636fccef4c012))
* **brepjs-verify:** burn bbox dimensions into agent snapshots ([#1280](https://github.com/andymai/brepjs/issues/1280)) ([25b6b8d](https://github.com/andymai/brepjs/commit/25b6b8df68909a41eaef5307519a29a8a05ccc00))
* **brepjs-verify:** eval-driven skill, hint, and reference improvements ([#1219](https://github.com/andymai/brepjs/issues/1219)) ([1a9b80f](https://github.com/andymai/brepjs/commit/1a9b80f3d3dbb44d7a8ae2f601ff305b70534efe))
* **brepjs-verify:** live text-to-cad eval flywheel ([#1215](https://github.com/andymai/brepjs/issues/1215)) ([4e81fc4](https://github.com/andymai/brepjs/commit/4e81fc4053491ce3e08182d57d76bd649252ea3c))
* **brepjs-verify:** standalone bundled CLI + rename from brepjs-cad ([#1211](https://github.com/andymai/brepjs/issues/1211)) ([05b3799](https://github.com/andymai/brepjs/commit/05b3799a0e9ee4968d4cac92f3a2ea236e39cd35))
* native thread() operation + maker-breadth skill references ([#1330](https://github.com/andymai/brepjs/issues/1330)) ([1bfc73d](https://github.com/andymai/brepjs/commit/1bfc73d696b0b779230e6ed3542e7b8415426992))
* **verify:** add center of mass to the verify report ([#1288](https://github.com/andymai/brepjs/issues/1288)) ([5738600](https://github.com/andymai/brepjs/commit/5738600e31f56c00d928d62e32ab9d5e8220b377))
* **verify:** add export_part MCP tool and sandbox export ([#1316](https://github.com/andymai/brepjs/issues/1316)) ([8a52f90](https://github.com/andymai/brepjs/commit/8a52f90c5b3d76c8bf6ef50a36c6977833af59bb))
* **verify:** add JSONL run-record provenance for sandbox runs ([#1309](https://github.com/andymai/brepjs/issues/1309)) ([6bda9b6](https://github.com/andymai/brepjs/commit/6bda9b630b8e4edf6eb860002c58b3e36cf1bfd4))
* **verify:** add manifold flag to the topology channel ([#1291](https://github.com/andymai/brepjs/issues/1291)) ([5ea5bb4](https://github.com/andymai/brepjs/commit/5ea5bb4db5bc8539f2773752e1c42770c91b5e0d))
* **verify:** add MCP server with run_program tool (stdio) ([#1300](https://github.com/andymai/brepjs/issues/1300)) ([e3c2c9e](https://github.com/andymai/brepjs/commit/e3c2c9e678dd719608cea8b6ee38101de9775e5d))
* **verify:** add topology counts to the verify report ([#1285](https://github.com/andymai/brepjs/issues/1285)) ([17a0eed](https://github.com/andymai/brepjs/commit/17a0eede727ac29007591cb0249274a35896facb))
* **verify:** sandbox executor — run agent code in an isolated child process ([#1295](https://github.com/andymai/brepjs/issues/1295)) ([8b72aa2](https://github.com/andymai/brepjs/commit/8b72aa2e272a58aa6d3886b8304eeaefb1a09b2e))
* **verify:** validate each body of multi-solid assemblies ([#1293](https://github.com/andymai/brepjs/issues/1293)) ([deb682f](https://github.com/andymai/brepjs/commit/deb682f1104179f261f232be7d94ceb154985328))
* **viewer:** click-to-inspect face picking in verify --serve ([#1278](https://github.com/andymai/brepjs/issues/1278)) ([735dc04](https://github.com/andymai/brepjs/commit/735dc0401143ff47046a79e6fb7bac53cf00a91e))
* **viewer:** measurements info panel in verify --serve ([#1277](https://github.com/andymai/brepjs/issues/1277)) ([c1ccf1d](https://github.com/andymai/brepjs/commit/c1ccf1d7c50ab43dc0444468f92fcf9365fda9da))
* **viewer:** orthographic/perspective projection toggle ([#1281](https://github.com/andymai/brepjs/issues/1281)) ([96673e4](https://github.com/andymai/brepjs/commit/96673e45e1ee316f9d26e52c995b4daba691e8b0))
* **viewer:** section/clipping plane in verify --serve ([#1279](https://github.com/andymai/brepjs/issues/1279)) ([cc0d00b](https://github.com/andymai/brepjs/commit/cc0d00b7a6296cc698fce1ae42b7503e6d47c032))
* **viewer:** shared ViewerControls toolbar; interactive verify --serve ([#1275](https://github.com/andymai/brepjs/issues/1275)) ([139ae15](https://github.com/andymai/brepjs/commit/139ae15a29d8a7ad5e520ba21d6dc9788242c089))


### Bug Fixes

* **brepjs-verify:** correct fillet/chamfer arg order in no-edges hints ([#1218](https://github.com/andymai/brepjs/issues/1218)) ([835f13a](https://github.com/andymai/brepjs/commit/835f13ac966b4264ba56a5cfc371bbbbbd1a0f01))
* **brepjs-verify:** point skills entry at ./skill directory, not SKILL.md ([#1270](https://github.com/andymai/brepjs/issues/1270)) ([9413a57](https://github.com/andymai/brepjs/commit/9413a57d8c2cac943371e75bcbaf11b3fdd9a657))
* **brepjs-verify:** repair preview viewer + GLB Y-up/materials fidelity ([#1271](https://github.com/andymai/brepjs/issues/1271)) ([2823d21](https://github.com/andymai/brepjs/commit/2823d212e2fc5f79e785911ec2b9f3320bdfdbbf))
* **verify:** reap orphaned sandbox processes on timeout and host shutdown ([#1380](https://github.com/andymai/brepjs/issues/1380)) ([7489ba8](https://github.com/andymai/brepjs/commit/7489ba8f665a71549d5b80367757f3373e1af0fb))
* **verify:** relax brepjs-viewer devDep to * so workspace links ([#1320](https://github.com/andymai/brepjs/issues/1320)) ([b26a18d](https://github.com/andymai/brepjs/commit/b26a18d406a051806c72e36d67da0f644588f315))

## [0.14.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.13.1...brepjs-verify-v0.14.0) (2026-06-15)


### Features

* **brepjs-verify:** auto-open browser on --serve + document the MCP server ([#1308](https://github.com/andymai/brepjs/issues/1308)) ([de4272c](https://github.com/andymai/brepjs/commit/de4272c9196f70baec4ff762a33636fccef4c012))
* **brepjs-verify:** burn bbox dimensions into agent snapshots ([#1280](https://github.com/andymai/brepjs/issues/1280)) ([25b6b8d](https://github.com/andymai/brepjs/commit/25b6b8df68909a41eaef5307519a29a8a05ccc00))
* **brepjs-verify:** eval-driven skill, hint, and reference improvements ([#1219](https://github.com/andymai/brepjs/issues/1219)) ([1a9b80f](https://github.com/andymai/brepjs/commit/1a9b80f3d3dbb44d7a8ae2f601ff305b70534efe))
* **brepjs-verify:** live text-to-cad eval flywheel ([#1215](https://github.com/andymai/brepjs/issues/1215)) ([4e81fc4](https://github.com/andymai/brepjs/commit/4e81fc4053491ce3e08182d57d76bd649252ea3c))
* **brepjs-verify:** standalone bundled CLI + rename from brepjs-cad ([#1211](https://github.com/andymai/brepjs/issues/1211)) ([05b3799](https://github.com/andymai/brepjs/commit/05b3799a0e9ee4968d4cac92f3a2ea236e39cd35))
* native thread() operation + maker-breadth skill references ([#1330](https://github.com/andymai/brepjs/issues/1330)) ([1bfc73d](https://github.com/andymai/brepjs/commit/1bfc73d696b0b779230e6ed3542e7b8415426992))
* **verify:** add center of mass to the verify report ([#1288](https://github.com/andymai/brepjs/issues/1288)) ([5738600](https://github.com/andymai/brepjs/commit/5738600e31f56c00d928d62e32ab9d5e8220b377))
* **verify:** add export_part MCP tool and sandbox export ([#1316](https://github.com/andymai/brepjs/issues/1316)) ([8a52f90](https://github.com/andymai/brepjs/commit/8a52f90c5b3d76c8bf6ef50a36c6977833af59bb))
* **verify:** add JSONL run-record provenance for sandbox runs ([#1309](https://github.com/andymai/brepjs/issues/1309)) ([6bda9b6](https://github.com/andymai/brepjs/commit/6bda9b630b8e4edf6eb860002c58b3e36cf1bfd4))
* **verify:** add manifold flag to the topology channel ([#1291](https://github.com/andymai/brepjs/issues/1291)) ([5ea5bb4](https://github.com/andymai/brepjs/commit/5ea5bb4db5bc8539f2773752e1c42770c91b5e0d))
* **verify:** add MCP server with run_program tool (stdio) ([#1300](https://github.com/andymai/brepjs/issues/1300)) ([e3c2c9e](https://github.com/andymai/brepjs/commit/e3c2c9e678dd719608cea8b6ee38101de9775e5d))
* **verify:** add topology counts to the verify report ([#1285](https://github.com/andymai/brepjs/issues/1285)) ([17a0eed](https://github.com/andymai/brepjs/commit/17a0eede727ac29007591cb0249274a35896facb))
* **verify:** sandbox executor — run agent code in an isolated child process ([#1295](https://github.com/andymai/brepjs/issues/1295)) ([8b72aa2](https://github.com/andymai/brepjs/commit/8b72aa2e272a58aa6d3886b8304eeaefb1a09b2e))
* **verify:** validate each body of multi-solid assemblies ([#1293](https://github.com/andymai/brepjs/issues/1293)) ([deb682f](https://github.com/andymai/brepjs/commit/deb682f1104179f261f232be7d94ceb154985328))
* **viewer:** click-to-inspect face picking in verify --serve ([#1278](https://github.com/andymai/brepjs/issues/1278)) ([735dc04](https://github.com/andymai/brepjs/commit/735dc0401143ff47046a79e6fb7bac53cf00a91e))
* **viewer:** measurements info panel in verify --serve ([#1277](https://github.com/andymai/brepjs/issues/1277)) ([c1ccf1d](https://github.com/andymai/brepjs/commit/c1ccf1d7c50ab43dc0444468f92fcf9365fda9da))
* **viewer:** orthographic/perspective projection toggle ([#1281](https://github.com/andymai/brepjs/issues/1281)) ([96673e4](https://github.com/andymai/brepjs/commit/96673e45e1ee316f9d26e52c995b4daba691e8b0))
* **viewer:** section/clipping plane in verify --serve ([#1279](https://github.com/andymai/brepjs/issues/1279)) ([cc0d00b](https://github.com/andymai/brepjs/commit/cc0d00b7a6296cc698fce1ae42b7503e6d47c032))
* **viewer:** shared ViewerControls toolbar; interactive verify --serve ([#1275](https://github.com/andymai/brepjs/issues/1275)) ([139ae15](https://github.com/andymai/brepjs/commit/139ae15a29d8a7ad5e520ba21d6dc9788242c089))


### Bug Fixes

* **brepjs-verify:** correct fillet/chamfer arg order in no-edges hints ([#1218](https://github.com/andymai/brepjs/issues/1218)) ([835f13a](https://github.com/andymai/brepjs/commit/835f13ac966b4264ba56a5cfc371bbbbbd1a0f01))
* **brepjs-verify:** point skills entry at ./skill directory, not SKILL.md ([#1270](https://github.com/andymai/brepjs/issues/1270)) ([9413a57](https://github.com/andymai/brepjs/commit/9413a57d8c2cac943371e75bcbaf11b3fdd9a657))
* **brepjs-verify:** repair preview viewer + GLB Y-up/materials fidelity ([#1271](https://github.com/andymai/brepjs/issues/1271)) ([2823d21](https://github.com/andymai/brepjs/commit/2823d212e2fc5f79e785911ec2b9f3320bdfdbbf))
* **verify:** reap orphaned sandbox processes on timeout and host shutdown ([#1380](https://github.com/andymai/brepjs/issues/1380)) ([7489ba8](https://github.com/andymai/brepjs/commit/7489ba8f665a71549d5b80367757f3373e1af0fb))
* **verify:** relax brepjs-viewer devDep to * so workspace links ([#1320](https://github.com/andymai/brepjs/issues/1320)) ([b26a18d](https://github.com/andymai/brepjs/commit/b26a18d406a051806c72e36d67da0f644588f315))

## [0.13.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.12.2...brepjs-verify-v0.13.0) (2026-06-15)


### Features

* **brepjs-verify:** auto-open browser on --serve + document the MCP server ([#1308](https://github.com/andymai/brepjs/issues/1308)) ([de4272c](https://github.com/andymai/brepjs/commit/de4272c9196f70baec4ff762a33636fccef4c012))
* **brepjs-verify:** burn bbox dimensions into agent snapshots ([#1280](https://github.com/andymai/brepjs/issues/1280)) ([25b6b8d](https://github.com/andymai/brepjs/commit/25b6b8df68909a41eaef5307519a29a8a05ccc00))
* **brepjs-verify:** eval-driven skill, hint, and reference improvements ([#1219](https://github.com/andymai/brepjs/issues/1219)) ([1a9b80f](https://github.com/andymai/brepjs/commit/1a9b80f3d3dbb44d7a8ae2f601ff305b70534efe))
* **brepjs-verify:** live text-to-cad eval flywheel ([#1215](https://github.com/andymai/brepjs/issues/1215)) ([4e81fc4](https://github.com/andymai/brepjs/commit/4e81fc4053491ce3e08182d57d76bd649252ea3c))
* **brepjs-verify:** standalone bundled CLI + rename from brepjs-cad ([#1211](https://github.com/andymai/brepjs/issues/1211)) ([05b3799](https://github.com/andymai/brepjs/commit/05b3799a0e9ee4968d4cac92f3a2ea236e39cd35))
* native thread() operation + maker-breadth skill references ([#1330](https://github.com/andymai/brepjs/issues/1330)) ([1bfc73d](https://github.com/andymai/brepjs/commit/1bfc73d696b0b779230e6ed3542e7b8415426992))
* **verify:** add center of mass to the verify report ([#1288](https://github.com/andymai/brepjs/issues/1288)) ([5738600](https://github.com/andymai/brepjs/commit/5738600e31f56c00d928d62e32ab9d5e8220b377))
* **verify:** add export_part MCP tool and sandbox export ([#1316](https://github.com/andymai/brepjs/issues/1316)) ([8a52f90](https://github.com/andymai/brepjs/commit/8a52f90c5b3d76c8bf6ef50a36c6977833af59bb))
* **verify:** add JSONL run-record provenance for sandbox runs ([#1309](https://github.com/andymai/brepjs/issues/1309)) ([6bda9b6](https://github.com/andymai/brepjs/commit/6bda9b630b8e4edf6eb860002c58b3e36cf1bfd4))
* **verify:** add manifold flag to the topology channel ([#1291](https://github.com/andymai/brepjs/issues/1291)) ([5ea5bb4](https://github.com/andymai/brepjs/commit/5ea5bb4db5bc8539f2773752e1c42770c91b5e0d))
* **verify:** add MCP server with run_program tool (stdio) ([#1300](https://github.com/andymai/brepjs/issues/1300)) ([e3c2c9e](https://github.com/andymai/brepjs/commit/e3c2c9e678dd719608cea8b6ee38101de9775e5d))
* **verify:** add topology counts to the verify report ([#1285](https://github.com/andymai/brepjs/issues/1285)) ([17a0eed](https://github.com/andymai/brepjs/commit/17a0eede727ac29007591cb0249274a35896facb))
* **verify:** sandbox executor — run agent code in an isolated child process ([#1295](https://github.com/andymai/brepjs/issues/1295)) ([8b72aa2](https://github.com/andymai/brepjs/commit/8b72aa2e272a58aa6d3886b8304eeaefb1a09b2e))
* **verify:** validate each body of multi-solid assemblies ([#1293](https://github.com/andymai/brepjs/issues/1293)) ([deb682f](https://github.com/andymai/brepjs/commit/deb682f1104179f261f232be7d94ceb154985328))
* **viewer:** click-to-inspect face picking in verify --serve ([#1278](https://github.com/andymai/brepjs/issues/1278)) ([735dc04](https://github.com/andymai/brepjs/commit/735dc0401143ff47046a79e6fb7bac53cf00a91e))
* **viewer:** measurements info panel in verify --serve ([#1277](https://github.com/andymai/brepjs/issues/1277)) ([c1ccf1d](https://github.com/andymai/brepjs/commit/c1ccf1d7c50ab43dc0444468f92fcf9365fda9da))
* **viewer:** orthographic/perspective projection toggle ([#1281](https://github.com/andymai/brepjs/issues/1281)) ([96673e4](https://github.com/andymai/brepjs/commit/96673e45e1ee316f9d26e52c995b4daba691e8b0))
* **viewer:** section/clipping plane in verify --serve ([#1279](https://github.com/andymai/brepjs/issues/1279)) ([cc0d00b](https://github.com/andymai/brepjs/commit/cc0d00b7a6296cc698fce1ae42b7503e6d47c032))
* **viewer:** shared ViewerControls toolbar; interactive verify --serve ([#1275](https://github.com/andymai/brepjs/issues/1275)) ([139ae15](https://github.com/andymai/brepjs/commit/139ae15a29d8a7ad5e520ba21d6dc9788242c089))


### Bug Fixes

* **brepjs-verify:** correct fillet/chamfer arg order in no-edges hints ([#1218](https://github.com/andymai/brepjs/issues/1218)) ([835f13a](https://github.com/andymai/brepjs/commit/835f13ac966b4264ba56a5cfc371bbbbbd1a0f01))
* **brepjs-verify:** point skills entry at ./skill directory, not SKILL.md ([#1270](https://github.com/andymai/brepjs/issues/1270)) ([9413a57](https://github.com/andymai/brepjs/commit/9413a57d8c2cac943371e75bcbaf11b3fdd9a657))
* **brepjs-verify:** repair preview viewer + GLB Y-up/materials fidelity ([#1271](https://github.com/andymai/brepjs/issues/1271)) ([2823d21](https://github.com/andymai/brepjs/commit/2823d212e2fc5f79e785911ec2b9f3320bdfdbbf))
* **verify:** reap orphaned sandbox processes on timeout and host shutdown ([#1380](https://github.com/andymai/brepjs/issues/1380)) ([7489ba8](https://github.com/andymai/brepjs/commit/7489ba8f665a71549d5b80367757f3373e1af0fb))
* **verify:** relax brepjs-viewer devDep to * so workspace links ([#1320](https://github.com/andymai/brepjs/issues/1320)) ([b26a18d](https://github.com/andymai/brepjs/commit/b26a18d406a051806c72e36d67da0f644588f315))

## [0.12.1](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.12.0...brepjs-verify-v0.12.1) (2026-06-15)


### Bug Fixes

* **verify:** reap orphaned sandbox processes on timeout and host shutdown ([#1380](https://github.com/andymai/brepjs/issues/1380)) ([7489ba8](https://github.com/andymai/brepjs/commit/7489ba8f665a71549d5b80367757f3373e1af0fb))

## [0.12.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.11.1...brepjs-verify-v0.12.0) (2026-06-15)


### Features

* **brepjs-verify:** auto-open browser on --serve + document the MCP server ([#1308](https://github.com/andymai/brepjs/issues/1308)) ([de4272c](https://github.com/andymai/brepjs/commit/de4272c9196f70baec4ff762a33636fccef4c012))
* **brepjs-verify:** burn bbox dimensions into agent snapshots ([#1280](https://github.com/andymai/brepjs/issues/1280)) ([25b6b8d](https://github.com/andymai/brepjs/commit/25b6b8df68909a41eaef5307519a29a8a05ccc00))
* **brepjs-verify:** eval-driven skill, hint, and reference improvements ([#1219](https://github.com/andymai/brepjs/issues/1219)) ([1a9b80f](https://github.com/andymai/brepjs/commit/1a9b80f3d3dbb44d7a8ae2f601ff305b70534efe))
* **brepjs-verify:** live text-to-cad eval flywheel ([#1215](https://github.com/andymai/brepjs/issues/1215)) ([4e81fc4](https://github.com/andymai/brepjs/commit/4e81fc4053491ce3e08182d57d76bd649252ea3c))
* **brepjs-verify:** standalone bundled CLI + rename from brepjs-cad ([#1211](https://github.com/andymai/brepjs/issues/1211)) ([05b3799](https://github.com/andymai/brepjs/commit/05b3799a0e9ee4968d4cac92f3a2ea236e39cd35))
* native thread() operation + maker-breadth skill references ([#1330](https://github.com/andymai/brepjs/issues/1330)) ([1bfc73d](https://github.com/andymai/brepjs/commit/1bfc73d696b0b779230e6ed3542e7b8415426992))
* **verify:** add center of mass to the verify report ([#1288](https://github.com/andymai/brepjs/issues/1288)) ([5738600](https://github.com/andymai/brepjs/commit/5738600e31f56c00d928d62e32ab9d5e8220b377))
* **verify:** add export_part MCP tool and sandbox export ([#1316](https://github.com/andymai/brepjs/issues/1316)) ([8a52f90](https://github.com/andymai/brepjs/commit/8a52f90c5b3d76c8bf6ef50a36c6977833af59bb))
* **verify:** add JSONL run-record provenance for sandbox runs ([#1309](https://github.com/andymai/brepjs/issues/1309)) ([6bda9b6](https://github.com/andymai/brepjs/commit/6bda9b630b8e4edf6eb860002c58b3e36cf1bfd4))
* **verify:** add manifold flag to the topology channel ([#1291](https://github.com/andymai/brepjs/issues/1291)) ([5ea5bb4](https://github.com/andymai/brepjs/commit/5ea5bb4db5bc8539f2773752e1c42770c91b5e0d))
* **verify:** add MCP server with run_program tool (stdio) ([#1300](https://github.com/andymai/brepjs/issues/1300)) ([e3c2c9e](https://github.com/andymai/brepjs/commit/e3c2c9e678dd719608cea8b6ee38101de9775e5d))
* **verify:** add topology counts to the verify report ([#1285](https://github.com/andymai/brepjs/issues/1285)) ([17a0eed](https://github.com/andymai/brepjs/commit/17a0eede727ac29007591cb0249274a35896facb))
* **verify:** sandbox executor — run agent code in an isolated child process ([#1295](https://github.com/andymai/brepjs/issues/1295)) ([8b72aa2](https://github.com/andymai/brepjs/commit/8b72aa2e272a58aa6d3886b8304eeaefb1a09b2e))
* **verify:** validate each body of multi-solid assemblies ([#1293](https://github.com/andymai/brepjs/issues/1293)) ([deb682f](https://github.com/andymai/brepjs/commit/deb682f1104179f261f232be7d94ceb154985328))
* **viewer:** click-to-inspect face picking in verify --serve ([#1278](https://github.com/andymai/brepjs/issues/1278)) ([735dc04](https://github.com/andymai/brepjs/commit/735dc0401143ff47046a79e6fb7bac53cf00a91e))
* **viewer:** measurements info panel in verify --serve ([#1277](https://github.com/andymai/brepjs/issues/1277)) ([c1ccf1d](https://github.com/andymai/brepjs/commit/c1ccf1d7c50ab43dc0444468f92fcf9365fda9da))
* **viewer:** orthographic/perspective projection toggle ([#1281](https://github.com/andymai/brepjs/issues/1281)) ([96673e4](https://github.com/andymai/brepjs/commit/96673e45e1ee316f9d26e52c995b4daba691e8b0))
* **viewer:** section/clipping plane in verify --serve ([#1279](https://github.com/andymai/brepjs/issues/1279)) ([cc0d00b](https://github.com/andymai/brepjs/commit/cc0d00b7a6296cc698fce1ae42b7503e6d47c032))
* **viewer:** shared ViewerControls toolbar; interactive verify --serve ([#1275](https://github.com/andymai/brepjs/issues/1275)) ([139ae15](https://github.com/andymai/brepjs/commit/139ae15a29d8a7ad5e520ba21d6dc9788242c089))


### Bug Fixes

* **brepjs-verify:** correct fillet/chamfer arg order in no-edges hints ([#1218](https://github.com/andymai/brepjs/issues/1218)) ([835f13a](https://github.com/andymai/brepjs/commit/835f13ac966b4264ba56a5cfc371bbbbbd1a0f01))
* **brepjs-verify:** point skills entry at ./skill directory, not SKILL.md ([#1270](https://github.com/andymai/brepjs/issues/1270)) ([9413a57](https://github.com/andymai/brepjs/commit/9413a57d8c2cac943371e75bcbaf11b3fdd9a657))
* **brepjs-verify:** repair preview viewer + GLB Y-up/materials fidelity ([#1271](https://github.com/andymai/brepjs/issues/1271)) ([2823d21](https://github.com/andymai/brepjs/commit/2823d212e2fc5f79e785911ec2b9f3320bdfdbbf))
* **verify:** relax brepjs-viewer devDep to * so workspace links ([#1320](https://github.com/andymai/brepjs/issues/1320)) ([b26a18d](https://github.com/andymai/brepjs/commit/b26a18d406a051806c72e36d67da0f644588f315))

## [0.11.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.10.1...brepjs-verify-v0.11.0) (2026-06-14)


### Features

* **brepjs-verify:** auto-open browser on --serve + document the MCP server ([#1308](https://github.com/andymai/brepjs/issues/1308)) ([de4272c](https://github.com/andymai/brepjs/commit/de4272c9196f70baec4ff762a33636fccef4c012))
* **brepjs-verify:** burn bbox dimensions into agent snapshots ([#1280](https://github.com/andymai/brepjs/issues/1280)) ([25b6b8d](https://github.com/andymai/brepjs/commit/25b6b8df68909a41eaef5307519a29a8a05ccc00))
* **brepjs-verify:** eval-driven skill, hint, and reference improvements ([#1219](https://github.com/andymai/brepjs/issues/1219)) ([1a9b80f](https://github.com/andymai/brepjs/commit/1a9b80f3d3dbb44d7a8ae2f601ff305b70534efe))
* **brepjs-verify:** live text-to-cad eval flywheel ([#1215](https://github.com/andymai/brepjs/issues/1215)) ([4e81fc4](https://github.com/andymai/brepjs/commit/4e81fc4053491ce3e08182d57d76bd649252ea3c))
* **brepjs-verify:** standalone bundled CLI + rename from brepjs-cad ([#1211](https://github.com/andymai/brepjs/issues/1211)) ([05b3799](https://github.com/andymai/brepjs/commit/05b3799a0e9ee4968d4cac92f3a2ea236e39cd35))
* native thread() operation + maker-breadth skill references ([#1330](https://github.com/andymai/brepjs/issues/1330)) ([1bfc73d](https://github.com/andymai/brepjs/commit/1bfc73d696b0b779230e6ed3542e7b8415426992))
* **verify:** add center of mass to the verify report ([#1288](https://github.com/andymai/brepjs/issues/1288)) ([5738600](https://github.com/andymai/brepjs/commit/5738600e31f56c00d928d62e32ab9d5e8220b377))
* **verify:** add export_part MCP tool and sandbox export ([#1316](https://github.com/andymai/brepjs/issues/1316)) ([8a52f90](https://github.com/andymai/brepjs/commit/8a52f90c5b3d76c8bf6ef50a36c6977833af59bb))
* **verify:** add JSONL run-record provenance for sandbox runs ([#1309](https://github.com/andymai/brepjs/issues/1309)) ([6bda9b6](https://github.com/andymai/brepjs/commit/6bda9b630b8e4edf6eb860002c58b3e36cf1bfd4))
* **verify:** add manifold flag to the topology channel ([#1291](https://github.com/andymai/brepjs/issues/1291)) ([5ea5bb4](https://github.com/andymai/brepjs/commit/5ea5bb4db5bc8539f2773752e1c42770c91b5e0d))
* **verify:** add MCP server with run_program tool (stdio) ([#1300](https://github.com/andymai/brepjs/issues/1300)) ([e3c2c9e](https://github.com/andymai/brepjs/commit/e3c2c9e678dd719608cea8b6ee38101de9775e5d))
* **verify:** add topology counts to the verify report ([#1285](https://github.com/andymai/brepjs/issues/1285)) ([17a0eed](https://github.com/andymai/brepjs/commit/17a0eede727ac29007591cb0249274a35896facb))
* **verify:** sandbox executor — run agent code in an isolated child process ([#1295](https://github.com/andymai/brepjs/issues/1295)) ([8b72aa2](https://github.com/andymai/brepjs/commit/8b72aa2e272a58aa6d3886b8304eeaefb1a09b2e))
* **verify:** validate each body of multi-solid assemblies ([#1293](https://github.com/andymai/brepjs/issues/1293)) ([deb682f](https://github.com/andymai/brepjs/commit/deb682f1104179f261f232be7d94ceb154985328))
* **viewer:** click-to-inspect face picking in verify --serve ([#1278](https://github.com/andymai/brepjs/issues/1278)) ([735dc04](https://github.com/andymai/brepjs/commit/735dc0401143ff47046a79e6fb7bac53cf00a91e))
* **viewer:** measurements info panel in verify --serve ([#1277](https://github.com/andymai/brepjs/issues/1277)) ([c1ccf1d](https://github.com/andymai/brepjs/commit/c1ccf1d7c50ab43dc0444468f92fcf9365fda9da))
* **viewer:** orthographic/perspective projection toggle ([#1281](https://github.com/andymai/brepjs/issues/1281)) ([96673e4](https://github.com/andymai/brepjs/commit/96673e45e1ee316f9d26e52c995b4daba691e8b0))
* **viewer:** section/clipping plane in verify --serve ([#1279](https://github.com/andymai/brepjs/issues/1279)) ([cc0d00b](https://github.com/andymai/brepjs/commit/cc0d00b7a6296cc698fce1ae42b7503e6d47c032))
* **viewer:** shared ViewerControls toolbar; interactive verify --serve ([#1275](https://github.com/andymai/brepjs/issues/1275)) ([139ae15](https://github.com/andymai/brepjs/commit/139ae15a29d8a7ad5e520ba21d6dc9788242c089))


### Bug Fixes

* **brepjs-verify:** correct fillet/chamfer arg order in no-edges hints ([#1218](https://github.com/andymai/brepjs/issues/1218)) ([835f13a](https://github.com/andymai/brepjs/commit/835f13ac966b4264ba56a5cfc371bbbbbd1a0f01))
* **brepjs-verify:** point skills entry at ./skill directory, not SKILL.md ([#1270](https://github.com/andymai/brepjs/issues/1270)) ([9413a57](https://github.com/andymai/brepjs/commit/9413a57d8c2cac943371e75bcbaf11b3fdd9a657))
* **brepjs-verify:** repair preview viewer + GLB Y-up/materials fidelity ([#1271](https://github.com/andymai/brepjs/issues/1271)) ([2823d21](https://github.com/andymai/brepjs/commit/2823d212e2fc5f79e785911ec2b9f3320bdfdbbf))
* **verify:** relax brepjs-viewer devDep to * so workspace links ([#1320](https://github.com/andymai/brepjs/issues/1320)) ([b26a18d](https://github.com/andymai/brepjs/commit/b26a18d406a051806c72e36d67da0f644588f315))

## [0.10.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.9.1...brepjs-verify-v0.10.0) (2026-06-14)


### Features

* **brepjs-verify:** auto-open browser on --serve + document the MCP server ([#1308](https://github.com/andymai/brepjs/issues/1308)) ([de4272c](https://github.com/andymai/brepjs/commit/de4272c9196f70baec4ff762a33636fccef4c012))
* **brepjs-verify:** burn bbox dimensions into agent snapshots ([#1280](https://github.com/andymai/brepjs/issues/1280)) ([25b6b8d](https://github.com/andymai/brepjs/commit/25b6b8df68909a41eaef5307519a29a8a05ccc00))
* **brepjs-verify:** eval-driven skill, hint, and reference improvements ([#1219](https://github.com/andymai/brepjs/issues/1219)) ([1a9b80f](https://github.com/andymai/brepjs/commit/1a9b80f3d3dbb44d7a8ae2f601ff305b70534efe))
* **brepjs-verify:** live text-to-cad eval flywheel ([#1215](https://github.com/andymai/brepjs/issues/1215)) ([4e81fc4](https://github.com/andymai/brepjs/commit/4e81fc4053491ce3e08182d57d76bd649252ea3c))
* **brepjs-verify:** standalone bundled CLI + rename from brepjs-cad ([#1211](https://github.com/andymai/brepjs/issues/1211)) ([05b3799](https://github.com/andymai/brepjs/commit/05b3799a0e9ee4968d4cac92f3a2ea236e39cd35))
* native thread() operation + maker-breadth skill references ([#1330](https://github.com/andymai/brepjs/issues/1330)) ([1bfc73d](https://github.com/andymai/brepjs/commit/1bfc73d696b0b779230e6ed3542e7b8415426992))
* **verify:** add center of mass to the verify report ([#1288](https://github.com/andymai/brepjs/issues/1288)) ([5738600](https://github.com/andymai/brepjs/commit/5738600e31f56c00d928d62e32ab9d5e8220b377))
* **verify:** add export_part MCP tool and sandbox export ([#1316](https://github.com/andymai/brepjs/issues/1316)) ([8a52f90](https://github.com/andymai/brepjs/commit/8a52f90c5b3d76c8bf6ef50a36c6977833af59bb))
* **verify:** add JSONL run-record provenance for sandbox runs ([#1309](https://github.com/andymai/brepjs/issues/1309)) ([6bda9b6](https://github.com/andymai/brepjs/commit/6bda9b630b8e4edf6eb860002c58b3e36cf1bfd4))
* **verify:** add manifold flag to the topology channel ([#1291](https://github.com/andymai/brepjs/issues/1291)) ([5ea5bb4](https://github.com/andymai/brepjs/commit/5ea5bb4db5bc8539f2773752e1c42770c91b5e0d))
* **verify:** add MCP server with run_program tool (stdio) ([#1300](https://github.com/andymai/brepjs/issues/1300)) ([e3c2c9e](https://github.com/andymai/brepjs/commit/e3c2c9e678dd719608cea8b6ee38101de9775e5d))
* **verify:** add topology counts to the verify report ([#1285](https://github.com/andymai/brepjs/issues/1285)) ([17a0eed](https://github.com/andymai/brepjs/commit/17a0eede727ac29007591cb0249274a35896facb))
* **verify:** sandbox executor — run agent code in an isolated child process ([#1295](https://github.com/andymai/brepjs/issues/1295)) ([8b72aa2](https://github.com/andymai/brepjs/commit/8b72aa2e272a58aa6d3886b8304eeaefb1a09b2e))
* **verify:** validate each body of multi-solid assemblies ([#1293](https://github.com/andymai/brepjs/issues/1293)) ([deb682f](https://github.com/andymai/brepjs/commit/deb682f1104179f261f232be7d94ceb154985328))
* **viewer:** click-to-inspect face picking in verify --serve ([#1278](https://github.com/andymai/brepjs/issues/1278)) ([735dc04](https://github.com/andymai/brepjs/commit/735dc0401143ff47046a79e6fb7bac53cf00a91e))
* **viewer:** measurements info panel in verify --serve ([#1277](https://github.com/andymai/brepjs/issues/1277)) ([c1ccf1d](https://github.com/andymai/brepjs/commit/c1ccf1d7c50ab43dc0444468f92fcf9365fda9da))
* **viewer:** orthographic/perspective projection toggle ([#1281](https://github.com/andymai/brepjs/issues/1281)) ([96673e4](https://github.com/andymai/brepjs/commit/96673e45e1ee316f9d26e52c995b4daba691e8b0))
* **viewer:** section/clipping plane in verify --serve ([#1279](https://github.com/andymai/brepjs/issues/1279)) ([cc0d00b](https://github.com/andymai/brepjs/commit/cc0d00b7a6296cc698fce1ae42b7503e6d47c032))
* **viewer:** shared ViewerControls toolbar; interactive verify --serve ([#1275](https://github.com/andymai/brepjs/issues/1275)) ([139ae15](https://github.com/andymai/brepjs/commit/139ae15a29d8a7ad5e520ba21d6dc9788242c089))


### Bug Fixes

* **brepjs-verify:** correct fillet/chamfer arg order in no-edges hints ([#1218](https://github.com/andymai/brepjs/issues/1218)) ([835f13a](https://github.com/andymai/brepjs/commit/835f13ac966b4264ba56a5cfc371bbbbbd1a0f01))
* **brepjs-verify:** point skills entry at ./skill directory, not SKILL.md ([#1270](https://github.com/andymai/brepjs/issues/1270)) ([9413a57](https://github.com/andymai/brepjs/commit/9413a57d8c2cac943371e75bcbaf11b3fdd9a657))
* **brepjs-verify:** repair preview viewer + GLB Y-up/materials fidelity ([#1271](https://github.com/andymai/brepjs/issues/1271)) ([2823d21](https://github.com/andymai/brepjs/commit/2823d212e2fc5f79e785911ec2b9f3320bdfdbbf))
* **verify:** relax brepjs-viewer devDep to * so workspace links ([#1320](https://github.com/andymai/brepjs/issues/1320)) ([b26a18d](https://github.com/andymai/brepjs/commit/b26a18d406a051806c72e36d67da0f644588f315))

## [0.9.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.8.0...brepjs-verify-v0.9.0) (2026-06-13)


### Features

* native thread() operation + maker-breadth skill references ([#1330](https://github.com/andymai/brepjs/issues/1330)) ([1bfc73d](https://github.com/andymai/brepjs/commit/1bfc73d696b0b779230e6ed3542e7b8415426992))


### Bug Fixes

* **verify:** relax brepjs-viewer devDep to * so workspace links ([#1320](https://github.com/andymai/brepjs/issues/1320)) ([b26a18d](https://github.com/andymai/brepjs/commit/b26a18d406a051806c72e36d67da0f644588f315))

## [0.8.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.7.1...brepjs-verify-v0.8.0) (2026-06-13)


### Features

* **brepjs-verify:** auto-open browser on --serve + document the MCP server ([#1308](https://github.com/andymai/brepjs/issues/1308)) ([de4272c](https://github.com/andymai/brepjs/commit/de4272c9196f70baec4ff762a33636fccef4c012))
* **brepjs-verify:** burn bbox dimensions into agent snapshots ([#1280](https://github.com/andymai/brepjs/issues/1280)) ([25b6b8d](https://github.com/andymai/brepjs/commit/25b6b8df68909a41eaef5307519a29a8a05ccc00))
* **verify:** add center of mass to the verify report ([#1288](https://github.com/andymai/brepjs/issues/1288)) ([5738600](https://github.com/andymai/brepjs/commit/5738600e31f56c00d928d62e32ab9d5e8220b377))
* **verify:** add export_part MCP tool and sandbox export ([#1316](https://github.com/andymai/brepjs/issues/1316)) ([8a52f90](https://github.com/andymai/brepjs/commit/8a52f90c5b3d76c8bf6ef50a36c6977833af59bb))
* **verify:** add JSONL run-record provenance for sandbox runs ([#1309](https://github.com/andymai/brepjs/issues/1309)) ([6bda9b6](https://github.com/andymai/brepjs/commit/6bda9b630b8e4edf6eb860002c58b3e36cf1bfd4))
* **verify:** add manifold flag to the topology channel ([#1291](https://github.com/andymai/brepjs/issues/1291)) ([5ea5bb4](https://github.com/andymai/brepjs/commit/5ea5bb4db5bc8539f2773752e1c42770c91b5e0d))
* **verify:** add MCP server with run_program tool (stdio) ([#1300](https://github.com/andymai/brepjs/issues/1300)) ([e3c2c9e](https://github.com/andymai/brepjs/commit/e3c2c9e678dd719608cea8b6ee38101de9775e5d))
* **verify:** add topology counts to the verify report ([#1285](https://github.com/andymai/brepjs/issues/1285)) ([17a0eed](https://github.com/andymai/brepjs/commit/17a0eede727ac29007591cb0249274a35896facb))
* **verify:** sandbox executor — run agent code in an isolated child process ([#1295](https://github.com/andymai/brepjs/issues/1295)) ([8b72aa2](https://github.com/andymai/brepjs/commit/8b72aa2e272a58aa6d3886b8304eeaefb1a09b2e))
* **verify:** validate each body of multi-solid assemblies ([#1293](https://github.com/andymai/brepjs/issues/1293)) ([deb682f](https://github.com/andymai/brepjs/commit/deb682f1104179f261f232be7d94ceb154985328))
* **viewer:** click-to-inspect face picking in verify --serve ([#1278](https://github.com/andymai/brepjs/issues/1278)) ([735dc04](https://github.com/andymai/brepjs/commit/735dc0401143ff47046a79e6fb7bac53cf00a91e))
* **viewer:** measurements info panel in verify --serve ([#1277](https://github.com/andymai/brepjs/issues/1277)) ([c1ccf1d](https://github.com/andymai/brepjs/commit/c1ccf1d7c50ab43dc0444468f92fcf9365fda9da))
* **viewer:** orthographic/perspective projection toggle ([#1281](https://github.com/andymai/brepjs/issues/1281)) ([96673e4](https://github.com/andymai/brepjs/commit/96673e45e1ee316f9d26e52c995b4daba691e8b0))
* **viewer:** section/clipping plane in verify --serve ([#1279](https://github.com/andymai/brepjs/issues/1279)) ([cc0d00b](https://github.com/andymai/brepjs/commit/cc0d00b7a6296cc698fce1ae42b7503e6d47c032))
* **viewer:** shared ViewerControls toolbar; interactive verify --serve ([#1275](https://github.com/andymai/brepjs/issues/1275)) ([139ae15](https://github.com/andymai/brepjs/commit/139ae15a29d8a7ad5e520ba21d6dc9788242c089))

## [0.7.1](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.7.0...brepjs-verify-v0.7.1) (2026-06-13)


### Bug Fixes

* **brepjs-verify:** repair preview viewer + GLB Y-up/materials fidelity ([#1271](https://github.com/andymai/brepjs/issues/1271)) ([2823d21](https://github.com/andymai/brepjs/commit/2823d212e2fc5f79e785911ec2b9f3320bdfdbbf))

## [0.7.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.6.0...brepjs-verify-v0.7.0) (2026-06-10)


### Features

* **brepjs-verify:** eval-driven skill, hint, and reference improvements ([#1219](https://github.com/andymai/brepjs/issues/1219)) ([1a9b80f](https://github.com/andymai/brepjs/commit/1a9b80f3d3dbb44d7a8ae2f601ff305b70534efe))
* **brepjs-verify:** live text-to-cad eval flywheel ([#1215](https://github.com/andymai/brepjs/issues/1215)) ([4e81fc4](https://github.com/andymai/brepjs/commit/4e81fc4053491ce3e08182d57d76bd649252ea3c))
* **brepjs-verify:** standalone bundled CLI + rename from brepjs-cad ([#1211](https://github.com/andymai/brepjs/issues/1211)) ([05b3799](https://github.com/andymai/brepjs/commit/05b3799a0e9ee4968d4cac92f3a2ea236e39cd35))


### Bug Fixes

* **brepjs-verify:** correct fillet/chamfer arg order in no-edges hints ([#1218](https://github.com/andymai/brepjs/issues/1218)) ([835f13a](https://github.com/andymai/brepjs/commit/835f13ac966b4264ba56a5cfc371bbbbbd1a0f01))
* **brepjs-verify:** point skills entry at ./skill directory, not SKILL.md ([#1270](https://github.com/andymai/brepjs/issues/1270)) ([9413a57](https://github.com/andymai/brepjs/commit/9413a57d8c2cac943371e75bcbaf11b3fdd9a657))

## [0.6.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.5.1...brepjs-verify-v0.6.0) (2026-06-09)


### Features

* **brepjs-verify:** eval-driven skill, hint, and reference improvements ([#1219](https://github.com/andymai/brepjs/issues/1219)) ([1a9b80f](https://github.com/andymai/brepjs/commit/1a9b80f3d3dbb44d7a8ae2f601ff305b70534efe))
* **brepjs-verify:** live text-to-cad eval flywheel ([#1215](https://github.com/andymai/brepjs/issues/1215)) ([4e81fc4](https://github.com/andymai/brepjs/commit/4e81fc4053491ce3e08182d57d76bd649252ea3c))
* **brepjs-verify:** standalone bundled CLI + rename from brepjs-cad ([#1211](https://github.com/andymai/brepjs/issues/1211)) ([05b3799](https://github.com/andymai/brepjs/commit/05b3799a0e9ee4968d4cac92f3a2ea236e39cd35))


### Bug Fixes

* **brepjs-verify:** correct fillet/chamfer arg order in no-edges hints ([#1218](https://github.com/andymai/brepjs/issues/1218)) ([835f13a](https://github.com/andymai/brepjs/commit/835f13ac966b4264ba56a5cfc371bbbbbd1a0f01))

## [0.5.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.4.1...brepjs-verify-v0.5.0) (2026-06-08)


### Features

* **brepjs-verify:** eval-driven skill, hint, and reference improvements ([#1219](https://github.com/andymai/brepjs/issues/1219)) ([1a9b80f](https://github.com/andymai/brepjs/commit/1a9b80f3d3dbb44d7a8ae2f601ff305b70534efe))
* **brepjs-verify:** live text-to-cad eval flywheel ([#1215](https://github.com/andymai/brepjs/issues/1215)) ([4e81fc4](https://github.com/andymai/brepjs/commit/4e81fc4053491ce3e08182d57d76bd649252ea3c))
* **brepjs-verify:** standalone bundled CLI + rename from brepjs-cad ([#1211](https://github.com/andymai/brepjs/issues/1211)) ([05b3799](https://github.com/andymai/brepjs/commit/05b3799a0e9ee4968d4cac92f3a2ea236e39cd35))


### Bug Fixes

* **brepjs-verify:** correct fillet/chamfer arg order in no-edges hints ([#1218](https://github.com/andymai/brepjs/issues/1218)) ([835f13a](https://github.com/andymai/brepjs/commit/835f13ac966b4264ba56a5cfc371bbbbbd1a0f01))

## [0.4.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.3.0...brepjs-verify-v0.4.0) (2026-06-04)


### Features

* **brepjs-verify:** eval-driven skill, hint, and reference improvements ([#1219](https://github.com/andymai/brepjs/issues/1219)) ([1a9b80f](https://github.com/andymai/brepjs/commit/1a9b80f3d3dbb44d7a8ae2f601ff305b70534efe))

## [0.3.0](https://github.com/andymai/brepjs/compare/brepjs-verify-v0.2.1...brepjs-verify-v0.3.0) (2026-06-04)


### Features

* **brepjs-verify:** live text-to-cad eval flywheel ([#1215](https://github.com/andymai/brepjs/issues/1215)) ([4e81fc4](https://github.com/andymai/brepjs/commit/4e81fc4053491ce3e08182d57d76bd649252ea3c))
* **brepjs-verify:** standalone bundled CLI + rename from brepjs-cad ([#1211](https://github.com/andymai/brepjs/issues/1211)) ([05b3799](https://github.com/andymai/brepjs/commit/05b3799a0e9ee4968d4cac92f3a2ea236e39cd35))


### Bug Fixes

* **brepjs-verify:** correct fillet/chamfer arg order in no-edges hints ([#1218](https://github.com/andymai/brepjs/issues/1218)) ([835f13a](https://github.com/andymai/brepjs/commit/835f13ac966b4264ba56a5cfc371bbbbbd1a0f01))

## [0.2.1](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.2.0...brepjs-cad-v0.2.1) (2026-06-04)


### Bug Fixes

* **brepjs-cad:** load .ts parts via native type-stripping ([#1207](https://github.com/andymai/brepjs/issues/1207)) ([198078b](https://github.com/andymai/brepjs/commit/198078becf570614c0cbf61537714fc94c2de43a))

## [0.2.0](https://github.com/andymai/brepjs/compare/brepjs-cad-v0.1.0...brepjs-cad-v0.2.0) (2026-06-04)


### Features

* **brepjs-cad:** CLI subcommands + verify hints + gridfinity examples + eval harness ([#1204](https://github.com/andymai/brepjs/issues/1204)) ([4d57198](https://github.com/andymai/brepjs/commit/4d5719874b5f5e685a4f909fd2d2363c0331770b))
* **brepjs-cad:** rename from brepjs-agent + make npm-publishable (publish held) ([#1201](https://github.com/andymai/brepjs/issues/1201)) ([630bbba](https://github.com/andymai/brepjs/commit/630bbbab4885604bd4d5fb2148584a6572c8d99c))


### Bug Fixes

* **brepjs-cad:** run CLI via bin symlink + quality pass ([#1206](https://github.com/andymai/brepjs/issues/1206)) ([ac5b1fe](https://github.com/andymai/brepjs/commit/ac5b1feee3c5b424c37716ca06c397f7898838f1))
* **opencascade:** prevent LTO stripping of custom bindings ([#666](https://github.com/andymai/brepjs/issues/666)) ([977dd75](https://github.com/andymai/brepjs/commit/977dd757e162d6fa47152b14aa31bac4edd9ae82))

## Changelog
