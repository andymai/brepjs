# brepjs

Web CAD library built on OpenCascade with a layered architecture and kernel abstraction layer.

## Architecture

Layered architecture with enforced boundaries (imports flow downward only):

- **Layer 0** (`kernel/`, `utils/`): Foundation — no internal imports
- **Layer 1** (`core/`): Memory management, geometry, constants — imports kernel/utils only
- **Layer 2** (`topology/`, `operations/`, `2d/`, `query/`, `measurement/`, `io/`, `worker/`): Domain — imports layers 0-1 + each other
- **Layer 3** (`sketching/`, `text/`, `projection/`): High-level API — imports all lower layers

Boundaries enforced by `npm run check:boundaries` (runs in pre-commit and CI).

## Commands

- `npm run build` — Vite library build (ES + CJS)
- `npm run typecheck` — TypeScript strict check
- `npm run lint` / `npm run lint:fix` — ESLint
- `npm run format` / `npm run format:check` — Prettier
- `npm run test` — Vitest
- `npm run test:affected` — Tests for changed files only
- `npm run check:boundaries` — Layer boundary enforcement
- `npm run knip` — Unused code detection

## Key patterns

- `getKernel()` from `src/kernel/index.ts` for OCCT operations; `initFromOC(oc)` must be called first
- Branded types (`Edge`, `Wire`, `Face`, `Solid`, etc.) in `src/core/shapeTypes.ts` — lightweight handles, no class hierarchy
- `createHandle()` / `createOcHandle()` from `src/core/disposal.ts` — use `using` keyword for OCCT resource cleanup
- Functional API in `*Fns.ts` files — pure functions taking/returning branded types; prefer over OO API for new code
- `Result<T,E>` in `src/core/result.ts` — prefer over throwing in layers 2-3
- All `.ts` imports must use `.js` extensions for ESM compatibility
- Unused variables must be prefixed with `_`

## Lint rules

- No `any` — use `// eslint-disable-next-line @typescript-eslint/no-explicit-any -- [reason]` for OCCT type gaps
- No non-null assertions (`!`)
- Consistent type imports (`import type` enforced)
- No `var`, strict equality, `prefer-const`, `prefer-readonly`
- `no-unsafe-*` rules disabled due to WASM type gaps

## Testing

- Tests in `/tests/`, setup in `tests/setup.ts` (WASM init)
- Test naming: `fn-*.test.ts` for functional API, `api*.test.ts` for public API
- Vitest globals enabled, 30s timeout, forked pool

## Commits

Conventional Commits enforced: `type(scope): subject`
