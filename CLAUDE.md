# brepjs

Web CAD library built on OpenCascade with a layered architecture and kernel abstraction layer.

## Architecture

Layered architecture with enforced boundaries (Layer 0 → 3, imports flow downward only):

- **Layer 0** (`kernel/`, `utils/`): Foundation — no internal imports
- **Layer 1** (`core/`): Memory management, geometry, constants — imports kernel/utils only
- **Layer 2** (`topology/`, `operations/`, `2d/`, `query/`, `measurement/`, `io/`): Domain — imports layers 0-1 + each other
- **Layer 3** (`sketching/`, `text/`, `projection/`): High-level API — imports all lower layers

## Commands

- `npm run build` — Vite library build (ES + CJS)
- `npm run typecheck` — TypeScript strict check
- `npm run lint` / `npm run lint:fix` — ESLint
- `npm run format` / `npm run format:check` — Prettier
- `npm run test` — Vitest
- `npm run check:boundaries` — Layer boundary enforcement
- `npm run knip` — Unused code detection

## Key patterns

- `getKernel()` from `src/kernel/index.ts` for OCCT operations
- Branded types (`Edge`, `Wire`, `Face`, `Solid`, etc.) in `src/core/shapeTypes.ts` — lightweight handles, no class hierarchy
- `createHandle()` / `createOcHandle()` from `src/core/disposal.ts` for OCCT resource management with `using` support
- Functional API: `*Fns.ts` files (e.g. `shapeFns.ts`, `booleanFns.ts`, `meshFns.ts`) — pure functions that take/return branded types
- All `.ts` imports use `.js` extensions for ESM compatibility
- WASM dependency: `brepjs-opencascade` (external, not bundled)

## Lint rules

- No `any` — use `// eslint-disable-next-line @typescript-eslint/no-explicit-any -- [reason]` for OCCT type gaps
- No non-null assertions
- Consistent type imports (`import type`)
- No `var`, strict equality
