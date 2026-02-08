# brepjs

Web CAD library built on OpenCascade with a layered architecture and kernel abstraction layer.

## Architecture

Layered architecture with enforced boundaries (Layer 0 → 3, imports flow downward only):

- **Layer 0** (`kernel/`, `utils/`): Foundation — no internal imports
- **Layer 1** (`core/`): Memory management, geometry, constants — imports kernel/utils only
- **Layer 2** (`topology/`, `operations/`, `2d/`, `query/`, `measurement/`, `io/`, `worker/`): Domain — imports layers 0-1 + each other
- **Layer 3** (`sketching/`, `text/`, `projection/`): High-level API — imports all lower layers

Layer boundaries are enforced by `scripts/check-layer-boundaries.sh`, run in pre-commit hooks and CI.

## Commands

- `npm run build` — Vite library build (ES + CJS) + quick entry
- `npm run typecheck` — TypeScript strict check (`tsc --noEmit`)
- `npm run lint` / `npm run lint:fix` — ESLint (src/ only)
- `npm run format` / `npm run format:check` — Prettier (src/ + tests/)
- `npm run test` — Vitest (forked pool, 30s timeout)
- `npm run test:coverage` — Vitest with v8 coverage
- `npm run test:affected` — Run only tests affected by changes
- `npm run check:boundaries` — Layer boundary enforcement
- `npm run knip` — Unused code detection
- `npm run bench` — Benchmarks (separate vitest config)
- `npm run docs:api` — TypeDoc API documentation

## Source structure

```
src/
├── kernel/          Layer 0: WASM adapter (getKernel, initFromOC, *Ops.ts files)
├── utils/           Layer 0: Pure utilities (bug, uuid, rounding, range, zip)
├── core/            Layer 1: Types (Vec3, Vec2), branded shapes, disposal, Result<T,E>, errors
├── topology/        Layer 2: Shape manipulation, booleans, meshing, casting, adjacency
├── operations/      Layer 2: Extrude, loft, sweep, patterns, assembly, history
├── 2d/              Layer 2: 2D curves (lib/), blueprints (blueprints/), 2D booleans
├── query/           Layer 2: Shape finders (edge, face, corner)
├── measurement/     Layer 2: Volume, area, length, distance, interference
├── io/              Layer 2: STEP, STL, IGES, SVG, glTF, DXF, 3MF, OBJ import/export
├── worker/          Layer 2: Off-main-thread protocol and task queue
├── sketching/       Layer 3: Sketcher, Drawing/DrawingPen, fluent API
├── text/            Layer 3: Font loading, text-to-blueprint
├── projection/      Layer 3: Camera creation, edge projection (HLRBRep)
├── index.ts         Main entry (re-exports everything)
├── core.ts          Core types entry
├── topology.ts      Topology entry
├── operations.ts    Operations entry
├── 2d.ts            2D entry
├── sketching.ts     Sketching entry
├── query.ts         Query entry
├── measurement.ts   Measurement entry
├── io.ts            I/O entry
├── worker.ts        Worker entry
├── result.ts        Result type entry
├── vectors.ts       Vector types entry
└── quick.ts         Auto-initializing entry (no manual WASM init)
```

## Key patterns

- **Kernel access**: `getKernel()` from `src/kernel/index.ts` for all OCCT operations. Must call `initFromOC(oc)` before first use.
- **Branded types**: `Edge`, `Wire`, `Face`, `Solid`, etc. in `src/core/shapeTypes.ts` — lightweight handles with phantom type brands, no class hierarchy. Compiler prevents passing wrong shape types.
- **Handle management**: `createHandle()` / `createOcHandle()` from `src/core/disposal.ts` for OCCT resource management. Uses `Symbol.dispose` with `using` keyword + `FinalizationRegistry` safety net.
- **Functional API**: `*Fns.ts` files (e.g. `shapeFns.ts`, `booleanFns.ts`, `meshFns.ts`) — pure functions that take/return branded types. Always immutable, returns new shapes.
- **Result type**: `Result<T,E>` monad in `src/core/result.ts` with `Ok`/`Err` constructors and combinators. Prefer over throwing in layers 2-3.
- **Dual API**: OO classes (Sketcher, Drawing) coexist with functional `*Fns.ts`. Prefer functional API for new code.
- **ESM imports**: All `.ts` imports use `.js` extensions for ESM compatibility (e.g. `import { draw } from '../sketching/draw.js'`).
- **WASM dependency**: `brepjs-opencascade` (external, not bundled). Peer dependency supporting ^0.5.1, ^0.6.0, ^0.7.0.

## Lint rules

- No `any` — use `// eslint-disable-next-line @typescript-eslint/no-explicit-any -- [reason]` for OCCT type gaps
- No non-null assertions (`!`)
- Consistent type imports (`import type` enforced)
- No `var`, strict equality (`eqeqeq`)
- `prefer-const` enforced
- `prefer-readonly` enforced
- `no-console` (warn/error allowed)
- Unused vars must be prefixed with `_`
- `no-unnecessary-condition` enabled
- Unsafe OCCT access rules (`no-unsafe-*`) disabled due to WASM type gaps

## TypeScript config

- Target: ES2022, Module: ESNext, strict mode
- `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` enabled
- `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride` enabled
- `noFallthroughCasesInSwitch`, `noPropertyAccessFromIndexSignature` enabled
- Module resolution: bundler

## Formatting

- Prettier: 100-char printWidth, semicolons, single quotes, trailing commas (es5), 2-space tabs, LF line endings

## Testing

- Framework: Vitest with `globals: true`
- Setup: `tests/setup.ts` initializes WASM via `initOC()`
- Pool: `forks` with 6GB heap (`--max-old-space-size=6144`)
- Timeout: 30 seconds per test
- Coverage thresholds: functions 83%, statements 73%, lines 73%, branches 64%
- Test naming: `fn-*.test.ts` for functional API tests, `api*.test.ts` for public API tests
- Tests live in `/tests/` directory (excluded from main tsconfig, separate `tsconfig.tests.json`)

## Commit conventions

- Conventional Commits enforced by commitlint (`@commitlint/config-conventional`)
- Format: `type(scope): subject` (e.g. `feat(topology): add edge adjacency query`)
- Pre-commit hook runs in tiers: (1) lint-staged + typecheck + boundaries in parallel, (2) test coverage on changed files

## Subpath exports

The package exposes 13 subpath exports for focused imports:
`brepjs`, `brepjs/core`, `brepjs/result`, `brepjs/vectors`, `brepjs/topology`, `brepjs/operations`, `brepjs/2d`, `brepjs/sketching`, `brepjs/query`, `brepjs/measurement`, `brepjs/io`, `brepjs/worker`, `brepjs/quick`

## CI pipeline

GitHub Actions (`ci.yml`): typecheck → lint → format:check → boundaries → knip → build → docs → test:coverage. All checks must pass for merge.
