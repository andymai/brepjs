# Adapter wiring walkthrough

How one kernel method flows through the declaration, all four adapters, and the safety nets. `makeBox` is used as the tracer because it exists everywhere; a new method follows the identical shape.

## 1. Declaration — one sub-interface, never `types.ts`

`src/kernel/interfaces/primitiveOps.ts`:

```ts
makeBox(width: number, height: number, depth: number): KernelShape;
```

Pick the sub-interface by domain: `booleanOps`, `builderOps`, `core` (mandatory lifecycle surface: `oc`, `kernelId`, `capabilities`, `setQuality?`, `dispose`, `executeBatch`, checkpoint family), `curveOps`, `evolutionOps`, `ioOps`, `measureOps`, `meshOps`, `modifierOps`, `primitiveOps`, `repairOps`, `surfaceOps`, `sweepOps`, `topologyOps`, `transformOps`. `KernelAdapter` is composed as their intersection in `src/kernel/interfaces/index.ts`.

Return plain JS values (numbers, tuples, string unions) or opaque `KernelShape` handles (`src/kernel/types.ts`). Callers above Layer 0 never invoke methods on a handle — that is the `.wrapped` ban.

## 2. occt adapter — free function + co-located factory

Implementation as a free function taking the raw instance first (`src/kernel/occt/constructorOps.ts`):

```ts
export function makeBox(
  oc: KernelInstance,
  width: number,
  height: number,
  depth: number
): KernelShape {
  const maker = new oc.BRepPrimAPI_MakeBox_2(width, height, depth);
  const solid = maker.Solid();
  maker.delete();
  return solid;
}
```

Note the manual `maker.delete()` — every Emscripten intermediate must be freed; only the returned shape survives (memory-and-disposal skill).

The same file exposes a factory returning the adapter slice, closed over `oc`, with a `satisfies Pick<...>` union that must list the new method:

```ts
export function makeConstructorOps(oc: KernelInstance) {
  return {
    // ...
    makeBox: (w, h, d) => makeBox(oc, w, h, d),
    // ...
  } satisfies Pick<KernelAdapter, /* ... | */ 'makeBox' /* | ... */>;
}
```

`DefaultAdapter` (`src/kernel/occt/defaultAdapter.ts`) has **no body-level methods**: the constructor spreads ~20 factories via `Object.assign`, declaration merging (`interface DefaultAdapter extends KernelAdapter`) tells TS the methods exist, and the compile-time guard at the bottom of the file fails with the precise missing-property list if no factory provides the method:

```ts
type _AssertSatisfiesKernelAdapter = (
  ...args: ConstructorParameters<typeof DefaultAdapter>
) => KernelAdapter;
const _check: _AssertSatisfiesKernelAdapter = (oc) => new DefaultAdapter(oc);
void _check;
```

To find any occt method's implementation: `rg 'function makeBox' src/kernel/occt/`.

## 3. brepkit adapter — same shape, id-based handles

`src/kernel/brepkit/constructionOps.ts`:

```ts
export function makeBox(
  bk: BrepkitKernel,
  width: number,
  height: number,
  depth: number
): KernelShape {
  const id = bk.makeBox(width, height, depth);
  return solidHandle(id);
}
```

Same factory + `satisfies Pick` + `Object.assign` + compile-time guard structure as occt (`src/kernel/brepkit/brepkitAdapter.ts`). If the underlying `brepkit-wasm` method may not exist in the pinned version, declare it _optional_ in `src/kernel/brepkit/brepkitWasmTypes.ts` with a `@future` doc tag and feature-detect at the call site (`typeof bk.chamferAsymmetric === 'function'` in `src/kernel/brepkit/modifierOps.ts` is the model, including the `warnOnce` fallback).

## 4. manifold adapter — build the mesh, record the op-graph node

`src/kernel/manifold/primitiveOps.ts`:

```ts
makeBox: (width, height, depth) => {
  const solid = Manifold.cube([width, height, depth] as Vec3, false);
  return wrap(solid, makeNode('makeBox', { width, height, depth }, []));
},
```

Every constructive manifold method records an op-graph node (`src/kernel/manifold/opGraph.ts`) so the shape can later be _replayed_ on an OCCT kernel for exact B-rep export; `dispose` frees both the mesh and any cached replayed B-rep (`src/kernel/manifold/manifoldAdapter.ts`). A manifold implementation without a replay node breaks exact export for anything built from it. Same factory-composition + compile-time-guard wiring as occt/brepkit.

## 5. occt-wasm adapter — the exception: real class methods

`OcctWasmAdapter` (`src/kernel/occtWasm/occtWasmAdapter.ts`) is a conventional `class ... implements KernelAdapter`; add a method body delegating to a module function:

```ts
makeBox(width: number, height: number, depth: number): KernelShape {
  return primOps.makeBox(this.k, width, height, depth);
}
```

`this.k` is the exception-wrapped raw kernel (`wrapKernelExceptions`); handles are u32 arena ids released via `this.k.release(h.id)` in `dispose`.

## 6. Stubbing adapters that cannot support the method

Both existing idioms throw a recognizable, uniform message:

- occt: add to `makeBrepkitOnlyStubs()` in `src/kernel/occt/defaultAdapter.ts` — `throw new Error('<name> is only available with the brepkit kernel')` — and extend its `satisfies Pick<...>` union.
- occt-wasm / manifold: `notImplemented('<name>')` → `'occt-wasm: <name> is not yet implemented'` (`occtWasmAdapter.ts`) or the manifold equivalent.

Never stub by returning a fabricated value; higher layers turn the throw into a `Result.Err` (result-error-handling skill).

## 7. After wiring

- Expose through a `*Fns.ts` function calling `getKernel().makeBox(...)` (adding-operations skill).
- Add tests through the Layer 2 API; register `not-implemented` divergences in `tests/helpers/kernelDivergences.ts` for stubbed kernels, then `npm run conformance:generate`.
- `npm run validate` — the compile-time guards surface any adapter that was missed as a typecheck failure naming the method.

## Writing a whole custom kernel (out of tree)

Follow `docs/kernel-swap.md` (minimal skeleton, shape-handle contract, return-value contract), then `registerKernel('my-kernel', adapter)`. Two corrections to that doc: CI runs only the occt-wasm test project (not "all three kernels"), and the vitest projects are generated from `tests/helpers/kernelRegistry.ts`, not hardcoded. An in-tree kernel additionally needs a `kernelConfigs` entry there plus an init branch in `tests/helpers/kernelInit.ts`.
