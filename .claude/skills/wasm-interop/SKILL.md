---
name: wasm-interop
description: This skill should be used when working across the JS/WASM boundary in brepjs — writing or debugging code in src/kernel/occt, src/kernel/occtWasm, or src/kernel/brepkit, or diagnosing symptoms like "enum comparison is always false", "GetType returned an object not a number", "mesh vertices are garbage or zeros", "detached ArrayBuffer", ".map on a Uint32Array produces wrong values", "brepjs kernel not initialized", "brepjs_single.js is missing", "init() falls back to the wrong kernel", "dynamic import of occt-wasm breaks the Vite build", "SetRunParallel has no effect", or deciding whether a kernel bug needs a Docker WASM rebuild. This skill owns the raw JS↔WASM mechanics (Emscripten enums, heap/typed-array reads, threading); adapter, registry, and capability *design* belong to the kernel-abstraction skill.
---

# WASM and OCCT interop gotchas

Cover the mechanics of the JS↔WASM boundary in the kernel adapters: how Emscripten enums cross, how to read the WASM heap without corrupting it, how initialization and the bundler-safe fallback chain work, and why every shipped build is single-threaded. Adapter/registry/capability _design_ lives in the `kernel-abstraction` skill — this skill stays on the raw Emscripten mechanics.

## When to use

- Editing or debugging any file under `src/kernel/occt/` (brepjs-opencascade facade), `src/kernel/occtWasm/` (occt-wasm, the default kernel), or `src/kernel/brepkit/`.
- A value works in one kernel but is garbage in another, or an enum comparison is silently always false.
- Mesh/curve extraction returns zeros, wrong numbers, or a detached-buffer error.
- Init fails, falls back to the wrong kernel, or a dynamic import breaks a consumer's build.

## Enums across the boundary

OCCT is bound with embind, which surfaces C++ enums as **objects**, not numbers.

**Values coming OUT** — never compare a raw enum result to an integer. Extract with the canonical idiom (`src/kernel/occt/geometryQueryOps.ts`):

```ts
const typeVal = adaptor.GetType();
// OCCT Emscripten returns enum objects with a .value property
const idx = typeof typeVal === 'number' ? typeVal : Number(typeVal?.value ?? typeVal);
```

Then map the number through a `Record<number, string>` (`geometryQueryOps.ts`). The same pattern recurs in `nurbsQueryOps.ts` and `manifold/repairOps.ts`.

**Values going IN** — pass the enum **object** straight from the `oc` instance, not an integer. Constructors and comparisons both accept the object form (`src/kernel/occt/topologyOps.ts`):

```ts
const ta = oc.TopAbs_ShapeEnum;
new oc.TopExp_Explorer_2(shape, ta.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
```

**Identity comparison against the object works** and is preferred over `.value` on the IN side (`geometryQueryOps.ts`):

```ts
const orient = shape.Orientation_1();
if (orient === oc.TopAbs_Orientation.TopAbs_FORWARD) return 'forward';
```

Enum-object maps are cached per `oc` instance in a `WeakMap` (`topologyOps.ts`) — build once, reuse; do not rebuild them per call.

**Overloaded constructors get numeric suffixes.** Embind renames overloads `_1`, `_2`, … — `TopExp_Explorer_2`, `BRepAdaptor_Curve_2`, `Orientation_1`. A "not a constructor" or wrong-arity error usually means the wrong suffix; grep a working call site (`geometryQueryOps.ts`) for the right one.

| Symptom                        | Cause                        | Fix                                                       |
| ------------------------------ | ---------------------------- | --------------------------------------------------------- |
| Enum comparison always false   | Compared object to an int    | Extract `.value`, or compare against `oc.<Enum>.<MEMBER>` |
| `GetType()` returns `[object]` | Embind enum object           | Use the `.value` extraction idiom                         |
| `X_2 is not a constructor`     | Wrong embind overload suffix | Match the `_N` at a known-good call site                  |

## Typed arrays and the heap

**Read heap pointers, slice before the next WASM call.** The brepjs-opencascade facade returns raw pointers + sizes; copy into an owned TypedArray _before any other WASM call could grow or relocate the heap_ — the build sets `ALLOW_MEMORY_GROWTH=1`, so a stale heap view becomes a detached/garbage buffer (`src/kernel/occt/meshOps.ts`). Divide byte pointers by 4 for the 32-bit heap index, slice, then free the C++ side with `raw.delete()` (`meshOps.ts`):

```ts
const offset = ptr / 4; // byte ptr → HEAPF32 index
return heap.slice(offset, offset + size); // copy now, before any other WASM call
```

The occt-wasm adapter reads element-by-element with a `?? 0` fallback because `noUncheckedIndexedAccess` is on (`src/kernel/occtWasm/meshOps.ts`); it uses `>> 2` for the same byte→index divide. For a structurally-guaranteed index (WASM ABI fixed arrays, post-bounds-check loops) use the sanctioned escape hatch `wasmIndex<T>(arr, i)` in `src/utils/vec3.ts` instead of a bare `!`.

**Convert `Uint32Array` to `number[]` only for JS array methods.** `.map`/`.filter`/`.flatMap` on a `Uint32Array` coerce results back to u32 (and cannot produce objects), so convert first with `toArray(ids)` = `Array.from(ids)` (`src/kernel/brepkit/helpers.ts`). This is _not_ a rule about passing arrays into the kernel — brepkit methods accept `Uint32Array | number[]`, and `booleanOps.ts` passes `new Uint32Array(...)` straight into `bk.compoundFuse(...)`. (CLAUDE.md's blanket "always convert before passing to kernel methods" overstates it; the real reason is the map/filter coercion.)

**No zero-copy between separate WASM linear memories** — each kernel instance owns its own heap, so copy bytes across with `copyWasmBytes(bytes)` (`helpers.ts`) or re-serialize via a BREP string. See `docs/decisions/0013-voxel-domain.md`.

| Symptom                                            | Cause                                    | Fix                                         |
| -------------------------------------------------- | ---------------------------------------- | ------------------------------------------- |
| Mesh vertices are garbage / zeros after a later op | Heap view read after a WASM call grew it | Slice into an owned array _immediately_     |
| Detached ArrayBuffer error                         | Held a HEAP view across an allocation    | Copy first; never store a raw heap subarray |
| `.map` on IDs yields wrong values                  | u32 coercion of typed-array map          | `Array.from(ids)` / `toArray` first         |
| Off-by-4 / nonsense offsets                        | Used byte pointer as element index       | Divide by 4 (`ptr / 4` or `>> 2`)           |

Handle `.delete()` on occt-wasm and brepkit handles is a **no-op** — those adapters use an arena/id model, not per-handle embind objects (`occtWasm/occtWasmTypes.ts`, `brepkit/helpers.ts`). Free with the adapter's `dispose`/`release`, not by chasing `.delete()`. Disposal semantics belong to the `memory-and-disposal` skill.

## Initialization

`init()` (`src/kernel/index.ts`) is idempotent (returns the current kernel id immediately) and tries, in order: **occt-wasm** → **brepjs-opencascade** (`initFromOC`, returns `'occt'`) → **brepkit-wasm**, throwing with install instructions if none load. `brepjs/quick` (`src/quick.ts`) does the same as a top-level `await` but with the brepjs-opencascade fallback only (no brepkit). All three kernel packages are optional peerDependencies (`package.json`).

**Every optional backend loads through `importOptionalBackend(specifier)`** (`src/kernel/optionalBackend.ts`). The specifier is a **variable** so no bundler (esbuild, Rollup, Vite import-analysis) can statically resolve it — an uninstalled peer stays a runtime import instead of hard-failing the build. A string literal with only a `@vite-ignore` comment regressed when Vite reflowed the comment (#1726). When adding a new optional backend, route it through this function; never write a literal `import('occt-wasm')`.

`initFromOC(oc)` (`index.ts`) resets seven feature-detection caches (measure, transform, boolean/loft/extrude/shell/fillet batch), registers `DefaultAdapter` as `'occt'`, and forces it default. Call it when hand-wiring the brepjs-opencascade instance; skipping the cache reset leaves stale capability flags.

`prewarm()` (`index.ts`) builds and disposes a 1×1×1 box to pay OCCT's ~400-900 ms first-call JIT cost off the critical path. Fire-and-forget after `init()` resolves.

`getKernel()` throws `brepjs kernel not initialized. Call initFromOC() or registerKernel()` when nothing is registered — that message means init was skipped, not that WASM is broken.

**Missing WASM artifacts.** `packages/brepjs-opencascade/src/*.js` and `*.wasm` are **gitignored** (`.gitignore:31-36`); only `.d.ts` files are tracked. A `brepjs_single.js is missing` error means restore them from the published tarball with `bash scripts/ensure-wasm.sh` (version-stamped via `src/.wasm-version`; CI runs it) — **not** a Docker build.

**Tests.** `tests/setup.ts` re-exports `initOC` (alias of `initOCCT`) from `tests/setup-kernel.ts`; `TEST_KERNEL` selects `occt` | `brepkit` | `occt-wasm` | `manifold`, defaulting to `occt-wasm`. Under vitest, `brepkit-wasm` is aliased to its Node CJS entry because the ESM entry uses the unsupported WASM-ESM-integration proposal (`vitest.config.ts`). See the `writing-tests` skill for the multi-kernel test setup.

## Threading reality

**Every shipped kernel build is single-threaded.** The brepjs-opencascade build compiles without `-pthread` (`packages/brepjs-opencascade/build-config/brepjs.yml`), and occt-wasm's README states "Single WASM thread — each kernel instance is single-threaded." Consequences:

- `op.SetRunParallel(true)` (`src/kernel/occt/booleanOps.ts`) and the facade's `SetRunParallel(Standard_True)` degrade to sequential in a threadless build — effectively no-ops. Do not expect a speedup from them; the meshing path passes `isInParallel = Standard_False` deliberately.
- Off-main-thread work uses **message passing, not shared handles**: brepjs's own `src/worker/` exchanges **BREP strings** across the boundary (`workerHandler.ts` calls `initFn(msg.wasmUrl)` on init), and occt-wasm ships an `occt-wasm/worker` export (`OcctWorker.spawn`, Comlink) whose handles are **worker-local**. A handle from one instance is meaningless in another.

Vitest test-runner config (pool, workers, memory cap, timeout) is owned by the `writing-tests` skill; the WASM-specific reason those knobs stay conservative is that OCCT WASM linear memory grows monotonically across a fork's files, so over-committing workers trips timeouts (#1102).

## Kernel-issue debugging discipline

Reproduce a suspected kernel bug **in JS/TS against the installed WASM first**. A Docker rebuild of the OpenCascade WASM (`ghcr.io/andymai/opencascade.js:v8`, via the brepjs-opencascade `buildWasm`/`buildSingle` scripts, then `wasm-opt`) takes on the order of hours — treat it as the last resort. Complete _all_ C++ facade edits before starting a build. The C++ binding surface (facade classes like `MeshExtractor`, `BooleanBatch`, `BooleanPipeline`, `EvolutionExtractor`, `TopoDS_Cast`, manual `Bnd_Box` bindings) and the emcc flags live in `build-config/brepjs.yml`; see `references/opencascade-build.md` for the inventory and flag list. Note `docs/compatibility.md` still says "WASM SIMD ❌ Not used" — that line is **stale**; the build passes `-msimd128 -mrelaxed-simd`. Trust the yml.

## Additional resources

- `references/opencascade-build.md` — brepjs.yml C++ facade-class inventory + emcc flags.
- `docs/kernel-swap.md` — full init/registration guide for all three kernels.
- `docs/compatibility.md` — bundler externalization, WASM variants/sizes, threading (SIMD line is stale).
- `docs/memory-management.md` — `using`/`Symbol.dispose`, `DisposalScope`, manual `delete()`.
- `kernel-abstraction` skill — `KernelAdapter`, capabilities, `withKernel`/quality-tier semantics.
- `memory-and-disposal` skill — handle lifecycle and disposal ordering.
- `writing-tests` skill — vitest runner config and multi-kernel test setup.
