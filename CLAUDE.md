# brepjs

Web CAD library with a layered architecture and pluggable kernel abstraction layer.

## Architecture

Layered architecture with enforced boundaries (imports flow downward only):

- **Layer 0** (`kernel/`, `utils/`): Foundation — no internal imports
- **Layer 1** (`core/`): Memory management, geometry, constants — imports kernel/utils only
- **Layer 2** (`topology/`, `operations/`, `2d/`, `query/`, `measurement/`, `io/`, `worker/`): Domain — imports layers 0-1 + each other
- **Layer 3** (`sketching/`, `text/`, `projection/`): High-level API — imports all lower layers

Boundaries enforced by `npm run check:boundaries` (runs in pre-commit and CI).

## Packages

Monorepo with two publishable packages:

- `brepjs` (root) — Core library
- `packages/brepjs-opencascade` — OpenCascade WASM build

## Commands

- `npm run build` — Vite library build (ES + CJS)
- `npm run typecheck` — TypeScript strict check
- `npm run lint` / `npm run lint:fix` — ESLint
- `npm run format` / `npm run format:check` — Prettier
- `npm run test` — Vitest (all tests)
- `npm run test:affected` — Tests for changed files only
- `npm run test:coverage` — Full test suite with coverage
- `npm run check:boundaries` — Layer boundary enforcement
- `npm run knip` — Unused code detection
- `npm run validate` — typecheck + lint + boundaries + format + affected tests (in order)
- `npx vitest run tests/fn-booleanFns.test.ts` — Run a single test file
- `npm run docs:generate-lookup` — Regenerate `docs/function-lookup.md`

## Git hooks

- **Pre-commit**: lint-staged + typecheck + boundary check (parallel), then `test:coverage:changed`. Set `FULL_TESTS=1` for full coverage run
- **Pre-push**: Full `test:coverage` + `knip` (~30s)
- Bypass: `--no-verify` (not recommended)

## Key patterns

- `getKernel()` from `src/kernel/index.ts` for all kernel operations; `initFromOC(oc)` must be called first
- `registerKernel(id, adapter)` / `withKernel(id, fn)` for custom or dual kernel usage
- `withKernel(id, fn)` is **sync-only** — async callbacks silently use the wrong kernel after the first `await`. Use `getKernel(id)` directly for async code.
- **Layer 2+ code must never call methods on `.wrapped`** — always use `getKernel().method(shape.wrapped)`. ESLint enforces this.
- Branded types (`Edge`, `Wire`, `Face`, `Solid`, etc.) in `src/core/shapeTypes.ts` — lightweight handles, no class hierarchy. Types carry a phantom `D extends Dimension` parameter for 2D/3D safety.
- Validity brands (`ClosedWire`, `OrientedFace`, `ManifoldShell`, `ValidSolid`) in `src/core/shapeTypes.ts` — phantom types encoding topological invariants. Smart constructors (`closedWire()`, `orientedFace()`) prove validity at runtime; type guards (`isClosedWire()`, etc.) narrow in-place.
- Two supported kernels: OpenCascade WASM (`initFromOC`, shipped via `brepjs-opencascade`) and brepkit WASM (`BrepkitAdapter`, external `brepkit-wasm` npm package). Tests run against both via `TEST_KERNEL` env var.
- `createHandle()` / `createKernelHandle()` from `src/core/disposal.ts` — use `using` keyword for resource cleanup
- Functional API in `*Fns.ts` files — pure functions taking/returning branded types; prefer over OO API for new code
- **Never add new methods to class-based wrappers** (e.g. `Shape`, `Solid`, `Edge` classes in `src/topology/`). These are legacy OO wrappers. All new functionality goes in `*Fns.ts` files.
- `Result<T,E>` in `src/core/result.ts` — prefer over throwing in layers 2-3
- All `.ts` imports must use `.js` extensions for ESM compatibility
- Unused variables must be prefixed with `_`

## Lint rules

- No `any` — use `// eslint-disable-next-line @typescript-eslint/no-explicit-any -- [reason]` for WASM type gaps
- No non-null assertions (`!`)
- Consistent type imports (`import type` enforced)
- No `var`, strict equality, `prefer-const`, `prefer-readonly`
- `no-unsafe-*` rules disabled due to WASM type gaps
- `no-restricted-syntax` bans `.oc` access and `.wrapped.method()` calls in Layer 2+ code

## Testing

- Tests in `/tests/`, setup in `tests/setup.ts` (WASM init)
- Test naming: `fn-*.test.ts` for functional API, `api*.test.ts` for public API
- Vitest globals enabled, 30s timeout, forks pool, `--max-old-space-size=6144`
- Coverage thresholds enforced — see `vitest.config.ts`

## Commits

Conventional Commits enforced: `type(scope): subject`

## Common tasks

### Writing a test

1. File: extend existing `tests/fn-<module>.test.ts` or create new `tests/fn-<name>.test.ts`
2. Import from `../src/index.js` (always `.js` extension)
3. Add `beforeAll(async () => { await initOC(); }, 30000)` and import `initOC` from `./setup.js`
4. Use `toBeCloseTo(expected, precision)` for geometry — never exact equality for floating point
5. Use `unwrap(result)` in tests; use `isOk()`/`match()` in production code
6. Assert shape types with `isSolid()`, `isFace()`, `isWire()`, etc.
7. Validate geometry with `measureVolume()`, `measureArea()`

For adding a new operation or kernel method, see `.claude/commands/`.

## Gotchas

- OCCT Emscripten returns enum objects with `.value` — extract with: `typeof val === 'number' ? val : Number(val?.value ?? val)`
- `autoHeal` short-circuits valid shapes: `report.alreadyValid=true`, no sew/heal diagnostics run
- Assembly solver uses original face coordinates — distance constraints don't compose across multiple mates
- `Uint32Array` WASM interop: always convert to regular `Array` before passing to kernel methods
- `DisposalScope` disposes in LIFO order — register dependencies after their dependees
- `noUncheckedIndexedAccess` is enabled — array indexing returns `T | undefined`, add bounds checks or use `!` with eslint-disable
- `exactOptionalPropertyTypes` is enabled — `undefined` and missing are distinct; use `prop?: T | undefined` in optional fields
