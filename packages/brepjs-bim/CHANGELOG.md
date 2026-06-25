# Changelog

## [0.3.1](https://github.com/andymai/brepjs/compare/brepjs-bim-v0.3.0...brepjs-bim-v0.3.1) (2026-06-25)


### Bug Fixes

* **bim:** make BCF XML tokenizer linear (polynomial ReDoS) ([#1666](https://github.com/andymai/brepjs/issues/1666)) ([3c93f03](https://github.com/andymai/brepjs/commit/3c93f036827b5daf158e2a339362c38bf3ea2864))


### Dependencies

* The following workspace dependencies were updated
  * peerDependencies
    * brepjs bumped from >=18.0.0 to >=18.117.1

## [0.3.0](https://github.com/andymai/brepjs/compare/brepjs-bim-v0.2.0...brepjs-bim-v0.3.0) (2026-06-18)


### Features

* **brepjs-bim:** real roof shapes, posted railings, placed-geometry accessor ([#1476](https://github.com/andymai/brepjs/issues/1476)) ([d99af0b](https://github.com/andymai/brepjs/commit/d99af0b3a02cc27e8ee1a90e187fb78190cccdfd))

## [0.2.0](https://github.com/andymai/brepjs/compare/brepjs-bim-v0.1.0...brepjs-bim-v0.2.0) (2026-06-17)


### Features

* **bim:** add brepjs-bim package — IFC4 wall round-trip M1 ([#1061](https://github.com/andymai/brepjs/issues/1061)) ([89112df](https://github.com/andymai/brepjs/commit/89112df15b39a42b8fc3311d3bf3e03a05c3110a))
* **bim:** add Openings, Doors, and Windows — M3 ([#1065](https://github.com/andymai/brepjs/issues/1065)) ([66d1cfe](https://github.com/andymai/brepjs/commit/66d1cfe7cd9c40a94170c3166b8a1c36e89bf9c7))
* **bim:** add Psets, Qtos, and material grouping — M2 ([#1063](https://github.com/andymai/brepjs/issues/1063)) ([277bde0](https://github.com/andymai/brepjs/commit/277bde0eae2440075616ccc6a4bd6bc51ddf51f5))
* **bim:** beams & columns with profile family — M7 ([#1075](https://github.com/andymai/brepjs/issues/1075)) ([dd27d7f](https://github.com/andymai/brepjs/commit/dd27d7fe5b73f6f1d0cdc913a186e02efdc49a7b))
* **bim:** BIM model tree panel + architectural-scale camera ([#1459](https://github.com/andymai/brepjs/issues/1459)) ([df4f51e](https://github.com/andymai/brepjs/commit/df4f51e109b421fd646164e762c82e09448a919f))
* **bim:** boolean-cut walls + net quantities — M4 ([#1069](https://github.com/andymai/brepjs/issues/1069)) ([097b62d](https://github.com/andymai/brepjs/commit/097b62d5738c4c6554d8237eb236d79e05f29684))
* **bim:** export and download BIM models as IFC from the playground ([#1465](https://github.com/andymai/brepjs/issues/1465)) ([ecc8bca](https://github.com/andymai/brepjs/commit/ecc8bcace766a801113a19955065a95a2e312f4a))
* **bim:** phase 1 foundations — deterministic guids, type layer, mvd, validation gates ([#1156](https://github.com/andymai/brepjs/issues/1156)) ([cf70425](https://github.com/andymai/brepjs/commit/cf70425ac496de7f7b7e822d36f0b653350ad27c))
* **bim:** phase 2 data conformance + geometry-representation breadth ([#1166](https://github.com/andymai/brepjs/issues/1166)) ([bafb95e](https://github.com/andymai/brepjs/commit/bafb95ea04687a4fb0d2ecb7b55f3f7a1d150a1d))
* **bim:** phase 3 element & profile breadth ([#1158](https://github.com/andymai/brepjs/issues/1158)) ([2dad1aa](https://github.com/andymai/brepjs/commit/2dad1aa07ac8f7ad2ccdb9cdc5527a0c0d7c31de))
* **bim:** phase 4 IFC import & symmetric round-trip ([#1159](https://github.com/andymai/brepjs/issues/1159)) ([f15ce9b](https://github.com/andymai/brepjs/commit/f15ce9b87260dde01a60809319df2bcccaa04b49))
* **bim:** phase 5 certification, IDS, BCF & FM deliverables ([#1160](https://github.com/andymai/brepjs/issues/1160)) ([addc71f](https://github.com/andymai/brepjs/commit/addc71fb34c2862ee38ea36414afd55636be7bbb))
* **bim:** slab openings — M6 ([#1073](https://github.com/andymai/brepjs/issues/1073)) ([8fec5dd](https://github.com/andymai/brepjs/commit/8fec5dd9a2f9cfe1e4e6ef5097e98e273f965508))
* **bim:** slabs & roofs (IfcSlab + Pset_SlabCommon + Qto) — M5 ([#1071](https://github.com/andymai/brepjs/issues/1071)) ([1a136a6](https://github.com/andymai/brepjs/commit/1a136a6045afa272abb2fa97b7cc3ae39a9364b5))
* **playground:** make truss, I-beam, and enclosure examples true to life ([#1464](https://github.com/andymai/brepjs/issues/1464)) ([b491021](https://github.com/andymai/brepjs/commit/b4910214e98ca86142eb4a4587142e12517d4f7b))


### Bug Fixes

* **bim:** spec-conformant IFC GlobalIds + FILE_NAME header (independently validated) ([#1463](https://github.com/andymai/brepjs/issues/1463)) ([cb4301a](https://github.com/andymai/brepjs/commit/cb4301acca129c109067a23c5d738b0d621e042d))
