---
title: brepjs vs Replicad
description: 'An honest comparison of brepjs and Replicad — two OpenCascade-based JavaScript CAD libraries. Where each fits, with side-by-side code and exact geometry.'
---

# brepjs vs Replicad

brepjs and [Replicad](https://replicad.xyz/) are siblings. Both are **JavaScript CAD libraries** that wrap the OpenCascade B-Rep kernel and run in the browser, and both produce exact solids you can export to STEP. Replicad came first and proved the approach works. brepjs is a TypeScript-first take on the same idea, built around type safety, structured errors, and a verification loop for AI-authored parts.

This is an honest comparison: where each library fits, and where Replicad is still the better choice.

## In short

- **Reach for brepjs** if you want a TypeScript-first API where invalid geometry is caught at compile time, fallible operations return a `Result` instead of throwing, and — increasingly — if you're authoring parts with an AI agent that needs to check its own output.
- **Reach for Replicad** if you want a mature, proven library with an established community, a polished in-browser workbench, and the shortest path to your first model. It pioneered code-first CAD in the browser and is an excellent choice.

Both are exact B-Rep, both export STEP, both are open source. Neither is a toy.

## Side by side

|                     | brepjs                                                                   | Replicad                                       |
| ------------------- | ------------------------------------------------------------------------ | ---------------------------------------------- |
| Geometry            | Exact B-Rep (OpenCascade)                                                | Exact B-Rep (OpenCascade)                      |
| Language            | TypeScript-first                                                         | TypeScript / JavaScript                        |
| Type safety         | Branded types; invalid geometry fails to compile                         | Standard TypeScript types                      |
| Errors              | `Result<T, BrepError>` with codes + suggestions                          | Throws exceptions                              |
| Runtime             | Browser and Node                                                         | Browser                                        |
| Kernel              | OpenCascade WASM; pluggable (Rust `brepkit` in development)              | OpenCascade WASM                               |
| Export              | STEP, STL, IGES, glTF, DXF, 3MF, OBJ                                     | STEP, STL, glTF                                |
| AI authoring        | `brepjs-verify` — deterministic validity, measurement, and snapshot loop | —                                              |
| Maturity            | **Newer, smaller surface**                                               | **Mature and battle-tested**                   |
| Community & docs    | **Growing**                                                              | **Larger, with a community manual**            |
| Time to first model | Comparable                                                               | **A little shorter — fewer concepts up front** |

The bold rows are the honest summary: brepjs leads on type safety, structured errors, kernel choice, and AI authoring; Replicad leads on maturity, community, and getting started quickly.

## Where brepjs is different

### Invalid geometry is a compile error

brepjs distinguishes `Edge`, `Wire`, and `Face` at the type level, and stamps `ClosedWire`, `OrientedFace`, and `ValidSolid` onto shapes proven to satisfy those invariants. An operation like `extrude` requires an `OrientedFace`, so a wire you forgot to close won't type-check. Replicad treats most shapes as a single `Shape` type, so the same mistake reaches runtime.

### Errors are values, not exceptions

Fallible operations — booleans, fillets, imports, exports — return `Result<T, BrepError>` rather than throwing. You handle the failure where it happens, with an error code and a suggestion attached.

<!-- @no-test -->

```typescript
// Replicad — throws
const part = makeBox(20, 20, 20).cut(makeCylinder(5, 25));

// brepjs — returns a Result you check
const result = cut(box(20, 20, 20), cylinder(5, 25));
if (isOk(result)) {
  /* use result.value */
} else {
  console.error(result.error.code, result.error.suggestion);
}
```

A chainable `shape()` wrapper is available if you prefer Replicad's throwing, fluent style — it just throws a typed `BrepWrapperError` instead.

### Built for AI authoring

This is the clearest gap. `brepjs-verify` runs a part on a real kernel and returns a deterministic report — solid validity, measured dimensions, multi-view snapshots, and a STEP export — so an agent can check its output against intent instead of guessing. It ships as a CLI and a Claude Code skill. Replicad has no equivalent.

### One API, swappable kernels

brepjs runs on OpenCascade WASM today and is built so the kernel is pluggable; a Rust kernel (`brepkit`) is in development as a drop-in alternative aimed at a smaller bundle. Replicad is OpenCascade-only.

## When Replicad is the better choice

A fair comparison has to say this plainly:

- **It's mature and proven.** Replicad has been used in production longer, across more models, so you'll hit fewer rough edges.
- **The community is larger.** More examples, more answered questions, and a thorough [community manual](https://github.com/raydeleu/ReplicadManual).
- **It's quicker to start.** Fewer concepts up front. If you just want a model on screen today, Replicad gets you there with less to learn.
- **You're already invested and it's working.** If your Replicad code isn't hitting silent failures or runtime topology errors, there's no urgent reason to switch.

brepjs's pitch is narrower and honest: the type system catches a class of bugs that otherwise surface at runtime, and the verify loop makes AI-authored parts checkable. If those matter to you, the trade is worth it. If they don't, Replicad is a great tool.

## Already using Replicad?

The two libraries are close enough that switching is mostly a search-and-replace plus a couple of pattern shifts. The [Coming from Replicad](../migration/replicad) guide has a function-by-function map and the two patterns to internalize (`Result` instead of `try/catch`, and type guards on imported shapes).

## How it compares to the rest of the field

If you're choosing a **JavaScript CAD library** more broadly, here's where brepjs sits:

- **vs OpenSCAD** — OpenSCAD uses its own language and a mesh-based engine, so it has no true fillets and no STEP export. brepjs is exact B-Rep, written in TypeScript, with STEP out of the box.
- **vs JSCAD** — JSCAD is JavaScript but polygon/mesh-based, so it can't produce exact solids or true STEP. brepjs is a B-Rep kernel.
- **vs CadQuery / build123d** — excellent, but Python and server-side. brepjs runs in the browser, in TypeScript.
- **vs opencascade.js** — a raw OpenCascade WASM binding. Replicad builds on its own custom version (`replicad-opencascadejs`); brepjs builds on its own (`occt-wasm`) and wraps it in a high-level, typed API, so you don't work with the kernel directly.

## FAQ

**Is brepjs production-ready?** It's newer than Replicad, with a smaller API surface and fewer examples, but it's well tested and grew out of a tool people use daily (the Gridfinity Layout Tool). For exact, parametric, manufacturable parts it's solid; for organic sculpting or dense lattices, it isn't the right tool — and neither is Replicad.

**Can I migrate my Replicad models?** Yes — see [Coming from Replicad](../migration/replicad). Most code is a search-and-replace away.

**Does it work in Node, not just the browser?** Yes. The same API runs in both; the verify CLI runs on Node.

**What's the `brepkit` kernel?** A Rust-based B-Rep kernel in development, intended as a drop-in alternative to OpenCascade WASM behind the same API.

**Is it free?** Yes. brepjs is open source under Apache-2.0, and Replicad under MIT — both are free to use.

## Try it

The fastest way to judge a CAD library is to build something in it.

- <a href="/playground" target="_blank" rel="noopener">Open the Playground</a> — write TypeScript, see the solid, export STEP. No install.
- [Get started](../getting-started/install) — install and initialize in your own project.
- `npm i brepjs occt-wasm` — or read [Why brepjs](../introduction/why-brepjs) first.
