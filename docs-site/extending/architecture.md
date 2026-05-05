---
title: Architecture & Layers
---

# Architecture & Layers

brepjs is a layered library with enforced boundaries. Imports flow downward only, from the high-level API to the kernel adapters, never the reverse. This chapter is the architecture map: what each layer contains, what it can import, and why the rules exist.

## The four layers

```
Layer 3  sketching/, text/, projection/        High-level API
Layer 2  topology/, operations/, 2d/, query/,
         measurement/, io/, worker/             Domain logic
Layer 1  core/                                  Types, memory, errors
Layer 0  kernel/, utils/                        WASM bindings, foundation
```

The rule: **a module in layer N can import from layers 0…N. Importing upward is forbidden.**

Layer 0 imports nothing internal. Layer 1 imports only Layer 0. Layer 2 modules import each other freely (they are peers) plus layers 0 and 1. Layer 3 imports anything.

`npm run check:boundaries` enforces the rule in pre-commit and CI. A PR that introduces an upward import fails the build.

## What each layer contains

### Layer 0: kernel/ and utils/

The foundation. Nothing internal-imported here.

- `kernel/` — the WASM kernel abstraction
  - `types.ts` — `KernelInterface` and shared types (the public stable API for kernel implementers)
  - `interfaces/` — segregated interface fragments (`KernelBooleans`, `KernelMesh`, etc.)
  - `occt/` — OpenCascade adapter (private; only the registered kernel id `'occt'` is public)
  - `brepkit/` — brepkit adapter (private; only `'brepkit'` is public)
- `utils/` — math helpers, type predicates, generic JS utilities

### Layer 1: core/

Memory management, errors, branded types, the `Result` type.

- `core/disposal.ts` — `DisposalScope`, `withScope`, `createHandle`, `createKernelHandle`, the `using`-compatible cleanup machinery
- `core/result.ts` — `Result<T,E>`, `ok`, `err`, `isOk`, `isErr`, `unwrap`, `match`
- `core/shapeTypes.ts` — branded types (`Edge`, `Wire`, `Face`, `Solid`, etc.) and validity brands (`ClosedWire`, `OrientedFace`, `ManifoldShell`, `ValidSolid`)
- `core/errors.ts` — `BrepError` shape and well-known error codes
- `core/dimensions.ts` — phantom dimension types
- `core/vectors.ts` — vector math helpers
- `core/planes.ts` — `Plane` type, plane name resolution

Layer 1 is small, stable, and has no external runtime dependencies beyond Layer 0.

### Layer 2: domain modules

Each module owns one concern. Layer 2 modules import each other peer-to-peer.

- `topology/` — primitives (`box`, `cylinder`, …), shape construction, type guards (`isSolid`, `isFace`)
- `operations/` — extrude, revolve, loft, sweep, patterns, assembly, history
- `2d/` — drawings, 2D booleans, blueprints
- `query/` — finders (`edgeFinder`, `faceFinder`, …)
- `measurement/` — volume, area, length, distance, curvature
- `io/` — STEP, IGES, BREP, STL, OBJ, glTF, DXF, 3MF, SVG
- `worker/` — typed RPC for `brepjs/worker`

Each Layer 2 module exports through an `index.ts` that brepjs's package.json exposes as a sub-path (`brepjs/topology`, `brepjs/operations`, etc.).

### Layer 3: high-level API

Composes Layer 2 into ergonomic surfaces.

- `sketching/` — the `Sketcher` builder, sketch-to-shape operations, canned profiles
- `text/` — text-as-2D-curves (using `opentype.js`)
- `projection/` — projecting 3D to 2D drawings for laser / SVG export

Layer 3 is what most users touch indirectly: `Sketcher` underlies most 2D-to-3D pipelines, `text/` underlies any nameplate or label feature.

## Why the rules

### Boundaries prevent circular imports

Every Layer 1 type is depended on by every Layer 2 module. If Layer 1 also imported Layer 2, the dependency graph would become circular and TypeScript's incremental builds would slow to a crawl. The ban makes the dependency graph a strict DAG.

### Layer 2 modules are peers

`topology` and `operations` need each other (operations creates shapes that topology functions consume; topology has primitives that operations transform). Same for `query` and the others. The peer relationship is intentional — they're all "domain logic" — but they all sit above the same foundation.

### Layer 3 cannot leak into Layer 2

The `Sketcher` is in Layer 3 because it composes `topology`, `operations`, and `2d`. If `topology` could import `Sketcher`, the API would be tangled — tests would have to load the full sketching machinery to test a primitive. The ban keeps each layer testable in isolation.

## The `.wrapped` rule

Each shape brepjs ships is a TypeScript handle wrapping a kernel WASM object. The kernel object is exposed as `.wrapped`. Two rules:

1. **Layer 0 may call methods on `.wrapped` directly** (it's the kernel adapter — that's what it does).
2. **Layers 1, 2, 3 must never call methods on `.wrapped`.** Always go through `getKernel().method(shape.wrapped)`.

ESLint enforces this via `no-restricted-syntax`. The reason: by routing through `getKernel()`, the kernel can be swapped at runtime without changing user code. Direct `.wrapped.method()` bypasses the abstraction and breaks dual-kernel testing.

## The `withKernel` constraint

Layer 2+ code uses `getKernel()` for the active kernel. To run a block against a specific kernel, use `withKernel(id, fn)`. The constraint: **`fn` must be synchronous**. After the first `await`, the active kernel reverts to whatever was current.

The pattern checker (`npm run check:patterns`) flags `async` callbacks to `withKernel`. For async work, use `getKernel(id)` directly and pass the kernel through.

## The `*Fns.ts` convention

New domain functionality goes in `*Fns.ts` files — flat functions that take and return branded types. The legacy classes (`Shape`, `Solid`, `Edge` in `topology/`) are deprecated and frozen — no new methods. The `*Fns` files are the canonical surface that the fluent `shape()` wrapper composes.

This is why the docs and the migration guides emphasize the functional API: it's the API that's still growing. The class-based wrappers are kept for backwards compatibility and removed in the next major.

## The pattern checker

`npm run check:patterns` runs an AST-based linter (`scripts/check-patterns.ts`) that catches issues ESLint can't:

- `async withKernel(...)` callbacks
- Double type casts (`x as unknown as T`)
- Missing `using` on shape allocations
- Functions over a length threshold
- Nesting depth over a threshold

The rules and their baselines are in the script. Each rule has an inline-disable comment (`// brepjs-patterns-disable: <rule-id>`) for the rare case where the rule is wrong about a specific line.

See [Pattern Checker Rules](./pattern-checker) for the full rule catalog.

## How to add to brepjs

Adding a new operation typically touches three layers:

1. **Layer 0** (`kernel/types.ts` + adapter) — extend `KernelInterface` with the new method, implement in the OpenCascade and brepkit adapters.
2. **Layer 2** (`operations/<newOpFns.ts>`) — write the `*Fns` function that calls `getKernel().newMethod(...)`.
3. **Layer 3** (`sketching/index.ts` if applicable) — expose via the fluent wrapper.

Each step is a separate concern: the kernel says _what's possible_, the operation says _how to invoke it_, the wrapper says _how to compose it_. Decoupling makes each step testable in isolation.

See [Writing Custom Operations](./custom-ops) for the full walkthrough and [Writing a Custom Kernel](./custom-kernel) for adapter implementation.

## Quick reference

| What you're doing                                | Layer                                 |
| ------------------------------------------------ | ------------------------------------- |
| Adding a new primitive (`pyramid`, `helixSolid`) | Layer 2 — `topology/`                 |
| Adding an operation (`twistExtrude`)             | Layer 2 — `operations/`               |
| Adding an exporter (e.g. JT format)              | Layer 2 — `io/`                       |
| Adding a measurement                             | Layer 2 — `measurement/`              |
| Wiring a new kernel method                       | Layer 0 — `kernel/types.ts` + adapter |
| Adding a fluent wrapper helper                   | Layer 3 — usually in the wrapper file |
| Adding a new branded type                        | Layer 1 — `core/shapeTypes.ts`        |

## Next steps

- [Writing a Custom Kernel](./custom-kernel) — implementing `KernelInterface` for a new backend
- [Writing Custom Operations](./custom-ops) — adding to Layer 2
- [Pattern Checker Rules](./pattern-checker) — the AST checks that protect the architecture
