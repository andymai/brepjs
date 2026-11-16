# Changelog

## [0.3.0](https://github.com/andymai/brepjs/compare/brepjs-mesh2solid-v0.2.0...brepjs-mesh2solid-v0.3.0) (2026-11-16)


### Features

* **mesh2solid:** keep exact faces on a part with a freeform region ([#2707](https://github.com/andymai/brepjs/issues/2707)) ([4f5ae58](https://github.com/andymai/brepjs/commit/4f5ae58e6d731c241e7a6a985a4462989cb2735e))

## [0.2.0](https://github.com/andymai/brepjs/compare/brepjs-mesh2solid-v0.1.0...brepjs-mesh2solid-v0.2.0) (2026-11-16)


### Features

* **mesh2solid:** read a mesh's format, size, and units before converting it ([#2597](https://github.com/andymai/brepjs/issues/2597)) ([1c93971](https://github.com/andymai/brepjs/commit/1c93971045d07a3fbb0687b7b5d900c12212d200))
* **mesh2solid:** rebuild filleted scans from full-resolution fits (tier 3) ([#2596](https://github.com/andymai/brepjs/issues/2596)) ([1d98392](https://github.com/andymai/brepjs/commit/1d9839208619e319b01e3ea91085cedde4745ba3))
* **mesh2solid:** rebuild noisy scans from exact surfaces (tier 3) ([#2595](https://github.com/andymai/brepjs/issues/2595)) ([4512c87](https://github.com/andymai/brepjs/commit/4512c8772e89a705eb93f627945ac4e2bbad2c6e))
* **mesh2solid:** rebuild organic meshes from trimmed B-spline faces ([#2605](https://github.com/andymai/brepjs/issues/2605)) ([1b89a16](https://github.com/andymai/brepjs/commit/1b89a16c1478a0b742504c297bcc558d5b3cb4d2))
* **mesh2solid:** rebuild parts from exact analytic surfaces (tier 1) ([#2592](https://github.com/andymai/brepjs/issues/2592)) ([ef2e4c5](https://github.com/andymai/brepjs/commit/ef2e4c587baf38eadeb188eaae003eaae5df52f4))
* **mesh2solid:** recognize chamfers, countersinks, and several bodies (tier 2) ([#2594](https://github.com/andymai/brepjs/issues/2594)) ([03a0395](https://github.com/andymai/brepjs/commit/03a03951f0eb404f2095fddb501b369ebd24f244))
* **mesh2solid:** write the rebuilt part as an editable feature program (tier 2) ([#2593](https://github.com/andymai/brepjs/issues/2593)) ([5b59c3f](https://github.com/andymai/brepjs/commit/5b59c3f7a20732d368b03ffbbca4119c0b56377d))


### Bug Fixes

* **mesh2solid:** merge a fillet sliver split off along its tangent seam ([#2599](https://github.com/andymai/brepjs/issues/2599)) ([c544513](https://github.com/andymai/brepjs/commit/c544513ba034f3638cc814ecab9a914fcd203a09))
* **mesh2solid:** rebuild scans with holes, split faces and thin walls at the exact tier ([#2675](https://github.com/andymai/brepjs/issues/2675)) ([986bfc3](https://github.com/andymai/brepjs/commit/986bfc39cf86cd733760dcfaf02b1351f2eceb0d))
* **mesh2solid:** write a regular hexagon as six lines, not as a rhombus with chamfers ([#2676](https://github.com/andymai/brepjs/issues/2676)) ([ae3023b](https://github.com/andymai/brepjs/commit/ae3023b9d1060bdabf678ca178652f84a88e6a25))
