---
title: Why brepjs
---

# Why brepjs

> **Try it live:** the [in-browser playground](/playground) compiles a TypeScript snippet and renders the resulting solid in a few hundred milliseconds — no install, no setup.

**brepjs** is a code-first CAD library for JavaScript. It models real solids — exact mathematical boundaries, not triangle meshes — so booleans are precise, fillets land on real edges, measurements are real numbers, and STEP export round-trips with SolidWorks, Fusion, FreeCAD, and OpenSCAD. The library is built on top of OpenCascade WASM today and a Rust-based kernel ([brepkit](https://github.com/andymai/brepkit)) tomorrow; the kernel is pluggable behind a small abstraction layer.

The differentiator: brepjs leans on TypeScript's type system to prove geometric invariants at compile time. Branded types separate `Edge` from `Wire` from `Face`. Validity brands like `ClosedWire`, `OrientedFace`, and `ValidSolid` encode topological properties — a wire that forms a loop, a face with a consistent normal, a solid that passes BRepCheck. If your code compiles, the geometry is structurally valid.

## What can you build?

The library targets **parametric parts defined by parameters** — enclosures, brackets, fixtures, gridfinity bins, mounts, jigs, signs, name plates, parts that snap to a grid or follow a formula. It is not optimized for organic sculpting (no SubD modeling, no T-splines). The sweet spot is anything you might otherwise write in OpenSCAD or SolidWorks, but as a JavaScript program you can deploy to the web.

The default unit is millimetres, but brepjs is unit-agnostic — pick whatever your kernel is configured for. The OpenCascade kernel uses double-precision floating point throughout.

## Where does it fit?

| Library                                         | Representation            | Booleans         | Type safety              | Browser-native |
| ----------------------------------------------- | ------------------------- | ---------------- | ------------------------ | -------------- |
| **brepjs**                                      | Exact B-Rep               | Exact            | Branded + validity types | Yes (WASM)     |
| [Replicad](https://replicad.xyz/)               | Exact B-Rep (OpenCascade) | Exact            | Standard TS              | Yes            |
| [JSCAD](https://jscad.app/)                     | Mesh                      | CSG-on-mesh      | Standard JS              | Yes            |
| [Manifold](https://github.com/elalish/manifold) | Manifold mesh             | Exact (manifold) | Standard TS              | Yes (WASM)     |
| [Three.js + CSG](https://threejs.org/)          | Mesh                      | CSG hacks        | Standard                 | Yes            |
| [OpenSCAD](https://openscad.org/)               | CSG tree                  | Exact            | None (custom DSL)        | No             |

The closest peer is Replicad — same kernel family, same code-CAD ethos. brepjs's pitch over Replicad is the type system: you do not need to wonder whether a wire is closed before passing it to `face()`, because the compiler already proved it.

## Why I built this

brepjs grew out of [gridfinitylayouttool.com](https://gridfinitylayouttool.com). I needed parametric CAD in the browser, I'm not a 3D modeler, but I know TypeScript. OpenSCAD nailed code-first CAD but lives outside the JS ecosystem. Replicad proved OpenCascade works in JS but I kept fighting the API — too easy to pass the wrong shape to the wrong function and discover it at runtime.

Neither had the type safety I wanted, so brepjs leans hard on it: branded types, `Result<T,E>`, phantom dimension parameters, validity brands. **If it compiles, the geometry is valid.**

## Status

The OpenCascade kernel is production-ready. brepkit (Rust) is in active development as a faster replacement and is **not** yet production-ready. The kernel abstraction layer means switching is a one-line change.

See [Status, Stability & Versioning](./stability) for detailed compatibility, deprecation policy, and supported environments. See [What brepjs is NOT](./non-goals) for explicit non-goals before you adopt.

## Next steps

- New here? Start with [Install & Initialize](../getting-started/install) and [Your First Solid](../getting-started/first-solid).
- Curious about the type system? Read [Types That Prove Geometry Is Valid](../concepts/types).
- Coming from another library? See [Migration](../migration/replicad).
