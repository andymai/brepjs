---
name: kernel-abstraction
description: This skill should be used when working on the brepjs kernel abstraction layer or across multiple kernels — adding a kernel method, wiring or writing an adapter, switching or registering kernels, or reasoning about kernel capability differences. Trigger phrases include "add a kernel method", "new kernel method", "withKernel", "brepjs kernel not initialized", "kernel 'X' is not registered", "is only available with the brepkit kernel", "occt-wasm: ... is not yet implemented", "run this under manifold/brepkit/occt", "which kernel supports X", "kernel capabilities", "quality tier", "regenerate the conformance matrix", or working on adapter/interface/registry/capability design under src/kernel/. Raw Emscripten/heap mechanics belong to the wasm-interop skill.
---

# Kernel abstraction layer and multi-kernel work

## Mental model

`src/kernel/` is Layer 0 — it imports nothing else in the tree (see the architecture-navigation skill for layer rules and the `.wrapped`/`.oc` bans). Everything above it calls geometry through `getKernel().method(...)` against the `KernelAdapter` interface.

Four in-tree adapters:

| id                    | Class             | File                                     | Backing package                                       | Nature                                                                           |
| --------------------- | ----------------- | ---------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| `occt-wasm` (default) | `OcctWasmAdapter` | `src/kernel/occtWasm/occtWasmAdapter.ts` | `occt-wasm`                                           | exact B-rep, arena/u32 handles                                                   |
| `occt`                | `DefaultAdapter`  | `src/kernel/occt/defaultAdapter.ts`      | `brepjs-opencascade`                                  | exact B-rep, Emscripten objects                                                  |
| `brepkit`             | `BrepkitAdapter`  | `src/kernel/brepkit/brepkitAdapter.ts`   | `brepkit-wasm`                                        | exact B-rep                                                                      |
| `manifold`            | `ManifoldAdapter` | `src/kernel/manifold/manifoldAdapter.ts` | `manifold-3d` (loaded via `packages/brepjs-manifold`) | mesh CSG, approximate; caches an OCCT "replay" B-rep per handle for exact export |

Registry (`src/kernel/index.ts`):

- `registerKernel(id, adapter)` — the first registered kernel becomes the default.
- `getKernel(id?)` — throws `brepjs kernel not initialized` if nothing is registered.
- `getKernel2D(id?)` — narrows to `Kernel2DCapability` via the `supportsKernel2D` guard; throws otherwise.
- `getActiveKernelId()` — stable string for cache keys (used by `src/csg/evaluate.ts`), `null` before init.
- `init()` — auto-detect chain: `occt-wasm` (`OcctKernel.init()` + `OcctWasmAdapter.fromKernel`) → `brepjs-opencascade` (`initFromOC`, id `'occt'`) → `brepkit-wasm`. Idempotent; throws with install instructions if none resolve. Returns the winning id.
- `initFromOC(oc)` — registers the OpenCascade WASM backend and forces the default to `'occt'` (the feature-detection cache-reset mechanics live in the wasm-interop skill).
- `initFromManifold(module)` — registers `'manifold'`.
- `prewarm()` — builds and disposes a trivial box to move OCCT's ~400-900ms first-call JIT cost off the critical path.

Optional backends load through `importOptionalBackend(specifier)` (`src/kernel/optionalBackend.ts`) using a variable specifier so bundlers cannot statically analyze the `import()` (mechanics in the wasm-interop skill).

## Switching kernels safely

- `withKernel(id, fn)` is **synchronous only**. It has a runtime guard: if `fn` returns a Promise it throws (`withKernel() callback returned a Promise...`), because the default is restored in `finally` and any `getKernel()` after the first `await` would see the wrong kernel. For async code, capture the adapter once with `getKernel(id)` and use it directly.
- `withQuality(level, fn)` (same sync-only guard) sets a process-global quality level — `'draft' | 'standard' | 'fine'`, deflection table in `src/kernel/quality.ts` (`'standard'` matches the historical `mesh()` defaults 1e-3/0.1) — and calls the kernel's optional `setQuality?()`.
- `registerKernelTier(name, { kernel, quality })` + `withTier(name, fn)` compose both, so call sites can say `withTier('preview', ...)` instead of hard-coding a kernel id and a quality knob. Tested in `tests/kernelTiers.test.ts`.
- Quality means different things per kernel (`tessellationModel` in `src/kernel/capabilities.ts`): Manifold is **build-time** — the mesh is fixed when a solid is built, so quality must be applied _before_ building (`ManifoldAdapter.setQuality` maps level → min circular angle). OCCT-family kernels are **extract-time** — shapes are exact and the level only sets the default deflection at `mesh()`/export.

## Adding a kernel method

Full walkthrough with a real cross-adapter example: `references/adapter-wiring.md`. The checklist:

1. **Declare** the method in the matching sub-interface under `src/kernel/interfaces/` (booleanOps, primitiveOps, modifierOps, ioOps, ...; `core.ts` is the mandatory surface). `KernelAdapter` is the intersection of these 15 files plus `Kernel2DCapability` (`src/kernel/interfaces/index.ts`); `src/kernel/types.ts` merely re-exports it. Do **not** add methods to `types.ts`. Note: the `/new-kernel-method` command (`.claude/commands/new-kernel-method.md`) predates this split — where it says "add to `src/kernel/types.ts`" and names an `OcShape` type, read "add to `src/kernel/interfaces/<domain>Ops.ts>`" and `KernelShape`/`KernelType` (`src/kernel/types.ts`).
2. **Implement** per adapter as a free function in `src/kernel/<adapter>/*Ops.ts`, receiving the raw instance (`oc`, `bk`, ...) as the first parameter — never via `getKernel()` inside kernel code. All kernel methods are synchronous and return plain JS values or opaque `KernelShape` handles (`docs/kernel-swap.md`, "What Must Each Method Return?"). Delete Emscripten intermediates manually (`maker.delete()`); see the memory-and-disposal and wasm-interop skills for handle lifetime and the enum-extraction gotcha.
3. **Wire** into the adapters. occt, brepkit, and manifold adapters have no body-level methods — add the method to the relevant `make*Ops()` factory's returned object (and its `satisfies Pick<KernelAdapter, ...>` union). A compile-time guard at the bottom of each adapter file errors with the exact missing-method list if any factory forgets one. `OcctWasmAdapter` is the exception: a conventional class — add a real method body.
4. **Stub** adapters that cannot support it. Two accepted idioms: the occt adapter's `makeBrepkitOnlyStubs()` (`src/kernel/occt/defaultAdapter.ts`, uniform `'<name> is only available with the brepkit kernel'` throw) and occt-wasm's `notImplemented(method)` (`'occt-wasm: <method> is not yet implemented'`). A throwing stub is correct; silently returning a wrong answer is not.
5. **Surface** through a `*Fns.ts` function that calls `getKernel().method(...)` — see the adding-operations skill for the Fns → `api.ts` → facade pipeline.
6. **Test** through the Layer 2 functional API, not the adapter directly. Register divergence entries for kernels that skip (writing-tests skill), then run `npm run conformance:generate`.

## Capability and feature detection — three distinct systems

| Need                                                                          | Use                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route by what a kernel _is_ (exact vs mesh, B-rep export, tessellation model) | `getKernelCapabilities(id?)` → `KernelCapabilities` (`src/kernel/capabilities.ts`; `EXACT_BREP_CAPABILITIES` for the B-rep kernels, all-false + `'build-time'` on manifold). Routing is caller-side today — only the quality layer branches on `tessellationModel` internally |
| Optional method _groups_ on an adapter                                        | Type guards: `supportsProjection` / `supportsConstraintSketch` (`src/kernel/types.ts`), `supportsKernel2D` (`src/kernel/kernel2dTypes.ts`, used by `getKernel2D`)                                                                                                             |
| Test matrix + generated conformance doc                                       | `kernelConfigs[].capabilities` in `tests/helpers/kernelRegistry.ts` — pure data, no src imports (consumed by `vitest.config.ts` at config-load time)                                                                                                                          |

Do not conflate them: the runtime flags describe kernel _nature_, the guards describe _interface presence_, the registry booleans describe _test expectations_.

Inside adapters, detect optional native features rather than version-checking:

- **WASM-build detection with a resettable cache**: `hasCppMeasurement ??= typeof oc.MeasurementExtractor?.extract === 'function'` in `src/kernel/occt/measureOps.ts`, paired with a `resetMeasureDetectionCache()` that `initFromOC` calls. Any new detection cache must get a reset function registered in `initFromOC` or it leaks state across WASM instances.
- **Optional-method detection**: `typeof bk.chamferAsymmetric === 'function'` (`src/kernel/brepkit/modifierOps.ts`), with the method declared _optional_ in `src/kernel/brepkit/brepkitWasmTypes.ts` under a `@future Not in brepkit-wasm 2.116.1` doc tag. Fall back with a `warnOnce(...)` so degraded behavior is visible exactly once.

## Multi-kernel testing and conformance

- `tests/helpers/kernelRegistry.ts` is the single source of truth: it drives the four vitest projects (each sets `TEST_KERNEL`), per-kernel coverage excludes (every project excludes the _other_ kernels' `adapterDir`s), per-kernel `excludeTests`, and the conformance doc. **Adding a kernel = a `kernelConfigs` entry plus an init branch in `tests/helpers/kernelInit.ts` `initKernel()`.**
- CI runs only the occt-wasm project (`test:ci`, sharded 4-way). The others are on-demand: `npm run test:occt`, `npm run test:brepkit`, `npx vitest run --project manifold` (no npm script). `docs/kernel-swap.md`'s claim that CI runs all kernels is stale.
- Per-kernel skips and tolerances live in `tests/helpers/kernelDivergences.ts` (`skipIfDiverges`, `expectKernelsAgree`); test-authoring detail is in the writing-tests skill. Cross-kernel numeric parity: `tests/kernel-agreement.test.ts` (soft-skips when a kernel is unavailable).
- After changing a divergence or a registry capability flag: `npm run conformance:generate` rewrites `docs/kernel-conformance.md`. Never hand-edit that file.

## Symptom → cause → fix

| Symptom                                                                               | Cause                                                                                                                                                                 | Fix                                                                                                        |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `BindingError: Cannot pass deleted object` from occt-wasm                             | Adapter built from `new OcctWasmAdapter(kernel.getRawModule(), kernel.getRawKernel())` — the `OcctKernel` wrapper's `FinalizationRegistry` freed the raw kernel on GC | Build with `OcctWasmAdapter.fromKernel(kernel)`, which retains the wrapper (`retainedKernelOwner`)         |
| `brepjs kernel not initialized`                                                       | `getKernel()` before any registration                                                                                                                                 | `await init()` (or `registerKernel`/`initFromOC`) first; in tests use `initKernel()` from `tests/setup.ts` |
| `brepjs: kernel 'X' is not registered`                                                | `withKernel`/`getKernel(id)` with an id that was never registered this session                                                                                        | Register it (e.g. `initFromManifold`) before switching                                                     |
| `withKernel() callback returned a Promise`                                            | Async callback passed to `withKernel`/`withQuality`/`withTier`                                                                                                        | Use `getKernel(id)` directly in async code                                                                 |
| `X is only available with the brepkit kernel` / `occt-wasm: X is not yet implemented` | Intentional throwing stub on this adapter                                                                                                                             | Switch kernels for that call, or implement the method (recipe above)                                       |
| Wrong kernel's divergences applied when running vitest without a project              | `currentKernelId` in `kernelDivergences.ts` defaults to `'occt'`, while `kernelInit.ts` defaults to `'occt-wasm'`                                                     | Always run via a `--project` flag or set `TEST_KERNEL` explicitly                                          |
| Build fails resolving `occt-wasm`/`brepkit-wasm` in a consumer bundle                 | `importOptionalBackend` was replaced with a literal `import()`                                                                                                        | Restore the variable-specifier indirection in `src/kernel/optionalBackend.ts`                              |
| 2D ops work on occt-wasm despite the raw kernel having no 2D API                      | 2D is fulfilled by the shared pure-TS engine `src/kernel/geometry2d.ts` (also used by brepkit)                                                                        | Nothing to fix — implement 2D features there, not per-kernel                                               |

Known-stale docs (trust code over these spots): `docs/kernel-swap.md` "tests run against all three kernels in CI" + its hardcoded 3-project vitest snippet; `.claude/commands/new-kernel-method.md` (`types.ts`, two adapters, `OcShape`); `src/kernel/README.md` "three adapters" (manifold missing).

## Additional resources

- `references/adapter-wiring.md` — per-adapter wiring walkthrough with a real method (`makeBox`) traced through all four adapters, plus stub and factory-guard patterns.
- `docs/kernel-swap.md` — authoring a custom out-of-tree `KernelAdapter` (minimal skeleton, handle contract, return-value contract).
- `docs/decisions/0002-kernel-abstraction.md`, `docs/decisions/0007-kernel-interface-segregation.md` — why the abstraction exists and why the interface is split 15 ways.
- `src/kernel/README.md` — per-adapter ops-module map and OCCT gotchas (enum extraction, `Uint32Array` conversion).
- Sibling skills: `architecture-navigation` (layer rules), `adding-operations` (surfacing kernel methods as public API), `writing-tests` (multi-kernel runs, divergence skips), `wasm-interop` (Emscripten interop, raw init/heap mechanics), `memory-and-disposal` (handle lifetime), `debugging-geometry` (invalid-shape triage).
