# brepjs

Web CAD library with a layered architecture and pluggable kernel abstraction layer.

## Architecture

Layered architecture with enforced boundaries (imports flow downward only):

- **Layer 0** (`kernel/`, `utils/`): Foundation, no internal imports
- **Layer 1** (`core/`): Memory management, geometry, constants, imports kernel/utils only
- **Layer 2** (`topology/`, `operations/`, `2d/`, `query/`, `measurement/`, `io/`, `worker/`): Domain, imports layers 0-1 + each other
- **Layer 3** (`sketching/`, `text/`, `projection/`): High-level API, imports all lower layers

Boundaries enforced by `npm run check:boundaries` (runs in pre-commit and CI).

## Packages

Monorepo packages:

- `brepjs` (root): Core library (published)
- `packages/brepjs-opencascade`: OpenCascade WASM build (published)
- `packages/brepjs-bim`: IFC/BIM parametric building elements + IFC import/export (experimental, published)
- `packages/brepjs-sheetmetal`: Sheet-metal authoring + unfold/flat-pattern + DXF (experimental, published)
- `packages/brepjs-manifold`: Manifold mesh/CSG preview kernel (experimental, unpublished)
- `packages/brepjs-viewer`: Shared React/R3F renderer (consumed by the playground and brepjs-cad; published, manual publish — unmanaged by release-please)
- `packages/brepjs-cad`: Agent skill + verify/preview CLI + WASM viewer (published; skill also ships via the repo Claude-plugin marketplace)

## Commands

- `npm run build`: Vite library build (ES + CJS)
- `npm run typecheck`: TypeScript strict check
- `npm run lint` / `npm run lint:fix`: ESLint
- `npm run format` / `npm run format:check`: Prettier
- `npm run test`: Vitest (changed files only, no coverage)
- `npm run test:full`: Full test suite with coverage
- `npm run check:boundaries`: Layer boundary enforcement
- `npm run knip`: Unused code detection
- `npm run check:patterns`: AST pattern checker (double-casts, async withKernel, missing `using`, long functions, deep nesting)
- `npm run check:patterns:baseline`: Regenerate pattern baseline after fixing violations
- `npm run validate`: typecheck + lint + boundaries + format + changed tests (in order)
- `npx vitest run tests/booleanFns.test.ts`: Run a single test file
- `npm run docs:generate-lookup`: Regenerate `docs/function-lookup.md`

## Git hooks

- **Pre-commit**: lint-staged (ESLint + Prettier + pattern checker) + typecheck + boundary check (parallel), then changed-file tests (no coverage thresholds). Set `FULL_TESTS=1` for full coverage run
- **Pre-push**: `knip` (unused-code detection) only. The full test suite is **not** run on push — CI's sharded `test` job (`test:ci`) is the full gate, and pre-commit already runs changed-file tests
- Bypass: `--no-verify` (not recommended)

## Key patterns

- `getKernel()` from `src/kernel/index.ts` for all kernel operations; `initFromOC(oc)` must be called first
- `registerKernel(id, adapter)` / `withKernel(id, fn)` for custom or dual kernel usage
- `withKernel(id, fn)` is **sync-only**: async callbacks silently use the wrong kernel after the first `await`. Use `getKernel(id)` directly for async code.
- **Layer 2+ code must never call methods on `.wrapped`**: always use `getKernel().method(shape.wrapped)`. ESLint enforces this.
- Branded types (`Edge`, `Wire`, `Face`, `Solid`, etc.) in `src/core/shapeTypes.ts`: lightweight handles, no class hierarchy. Types carry a phantom `D extends Dimension` parameter for 2D/3D safety.
- Validity brands (`ClosedWire`, `OrientedFace`, `ManifoldShell`, `ValidSolid`) in `src/core/shapeTypes.ts`: phantom types encoding topological invariants. Smart constructors (`closedWire()`, `orientedFace()`) prove validity at runtime; type guards (`isClosedWire()`, etc.) narrow in-place.
- **Default kernel: occt-wasm** (`OcctKernel.init()` + `OcctWasmAdapter.fromKernel`, external `occt-wasm` npm package). `init()` and `brepjs/quick` resolve it first, falling back to OpenCascade WASM (`initFromOC`, shipped via `brepjs-opencascade`) then brepkit WASM (`BrepkitAdapter`, external `brepkit-wasm`). The default test gate runs occt-wasm; run the others via `TEST_KERNEL` / `npm run test:occt` / `npm run test:brepkit`.
- **Memory & disposal (occt-wasm is an arena kernel):** shapes are arena slots; a handle's own `.delete()` is a no-op, so a slot is reclaimed only via `getKernel().dispose()`. `createHandle()` (`src/core/disposal.ts`) routes `Symbol.dispose`/finalizer through the kernel, so `using` frees the slot on every kernel. Contract:
  - `using` (or `.delete()`) **every** shape you own. The functional `*Fns` API is immutable and does **not** consume its inputs — the caller disposes them. A missed `using` on an intermediate (e.g. the inner `box` in `translate(box(...), ...)`) leaks a slot.
  - Cast a **fresh** kernel result with `castResultShape()` (not `castShape()`) so its orphaned pre-downcast slot is released; use `disposeResultShape()` on reject/discard branches. `castResultShapeWithKnownType()` for iterated sub-shapes. These are safe on in-place kernels (the guard skips identity downcasts; brepkit's dispose is a no-op).
  - Never `downcast()` as a copy — it aliases the source id on occt-wasm. Use `clone()` / `getKernel().copyShape()` for an independently-disposable duplicate.
  - `getFaces`/`getEdges`/`getWires`/`getVertices` and adjacency handles are **borrowed** from the per-shape topology cache; it's released when the parent shape is disposed. Do **not** retain one past its parent's disposal — `clone()`/`copyShape` it first.
  - `ShapeHandle.onDispose(cb)` ties a dependent resource's lifetime to a shape's disposal (how the topology cache cleans up).
- Functional API in `*Fns.ts` files: pure functions taking/returning branded types; this is the canonical surface for all shape operations. There is no class hierarchy: `Vertex`, `Edge`, `Wire`, `Face`, `Shell`, `Solid`, `CompSolid`, `Compound` are branded `ShapeHandle` types defined in `src/core/shapeTypes.ts`.
- **New functionality goes in `*Fns.ts` files first**, then surfaces through `src/topology/api.ts` (short-named public functions accepting `Shapeable<T>`) and optionally through the fluent `shape()` facade in `src/topology/wrapperFns.ts` (chainable `Wrapped<T>` that throws on `Result.Err`). Don't add operations directly to `wrapperFns.ts` without an `*Fns.ts` implementation behind it.
- `Result<T,E>` in `src/core/result.ts`: prefer over throwing in layers 2-3
- All `.ts` imports must use `.js` extensions for ESM compatibility
- Cross-directory imports use `@/` alias (e.g. `@/kernel/index.js`); same-directory imports stay relative (`./foo.js`)
- File naming: camelCase everywhere (no PascalCase, no kebab-case)
- kernel/ structure: shared abstractions at root (`types.ts`, `interfaces/`), OCCT code in `occt/`, brepkit code in `brepkit/`
- Unused variables must be prefixed with `_`

## Lint rules

- No `any`: use `// eslint-disable-next-line @typescript-eslint/no-explicit-any -- [reason]` for WASM type gaps
- No non-null assertions (`!`)
- Consistent type imports (`import type` enforced)
- No `var`, strict equality, `prefer-const`, `prefer-readonly`
- `no-unsafe-*` rules disabled due to WASM type gaps
- `no-restricted-syntax` bans `.oc` access, `.wrapped.method()` calls in Layer 2+ code, `export let` everywhere, and `enum` (use an `as const` object + literal union)
- `switch-exhaustiveness-check`: switches over a union/enum must handle every case (a `default` clause counts as exhaustive)
- `ban-ts-comment` requires `@ts-expect-error -- reason` format; `@ts-ignore` and `@ts-nocheck` are banned
- `no-console` is an error (only `console.error`/`console.warn` allowed)
- Pattern checker inline disable: `// brepjs-patterns-disable: <rule-id>` (line above or inline)

## Testing

- Tests in `/tests/`, setup in `tests/setup.ts` (WASM init)
- Test naming: `<moduleName>.test.ts` (e.g. `shapeFns.test.ts`), `api*.test.ts` for public API
- Vitest globals enabled, 30s timeout, forks pool, `--max-old-space-size=6144`
- Coverage thresholds enforced; see `vitest.config.ts`

## Commits

Conventional Commits enforced: `type(scope): subject`

## Common tasks

### Writing a test

1. File: extend existing `tests/<moduleName>.test.ts` or create new `tests/<name>.test.ts`
2. Import from `@/index.js` (use `@/` alias for cross-directory imports, always `.js` extension)
3. Add `beforeAll(async () => { await initOC(); }, 30000)` and import `initOC` from `./setup.js`
4. Use `toBeCloseTo(expected, precision)` for geometry; never exact equality for floating point
5. Use `unwrap(result)` in tests; use `isOk()`/`match()` in production code
6. Assert shape types with `isSolid()`, `isFace()`, `isWire()`, etc.
7. Validate geometry with `measureVolume()`, `measureArea()`

For adding a new operation or kernel method, see `.claude/commands/`.

## Gotchas

- OCCT Emscripten returns enum objects with `.value`; extract with: `typeof val === 'number' ? val : Number(val?.value ?? val)`
- `autoHeal` short-circuits valid shapes: `report.alreadyValid=true`, no sew/heal diagnostics run
- Assembly solver composes constraints down a chain: each positioning mate reads the referenced part's _solved_ pose and resolves in topological order (a `fixed` node anchors the chain). Solved mates: `fixed`, `concentric` (axis-axis), `angle` (plane-plane), and `coincident`/`distance` for plane-plane, plane-point, point-point, axis-axis, and axis-point pairs (`TRANSLATIONAL_PAIRS` in `solverAdapter.ts`). Unsupported pairs (e.g. axis-plane) report `ASSEMBLY_NOT_CONVERGED` with the offending `type(a-b)` and DOF count.
- `Uint32Array` WASM interop: always convert to regular `Array` before passing to kernel methods
- `DisposalScope` disposes in LIFO order; register dependencies after their dependees
- Arena-leak tests use occt-wasm's `getShapeCount()` oracle (`tests/wasmArenaDisposal.test.ts`, occt-wasm-gated). It counts the **whole arena**, so an undisposed intermediate in the _test itself_ reads as a false leak in the code under test — `using`-dispose every intermediate in a probe. JS-side `getDisposalStats().liveHandles` is blind to orphaned pre-downcast slots; don't rely on it for arena leaks.
- `noUncheckedIndexedAccess` is enabled: array indexing returns `T | undefined`, add bounds checks or use `!` with eslint-disable
- `exactOptionalPropertyTypes` is enabled: `undefined` and missing are distinct; use `prop?: T | undefined` in optional fields
