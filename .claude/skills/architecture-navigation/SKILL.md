---
name: architecture-navigation
description: This skill should be used when deciding which layer or module a new file, function, or directory belongs in, or when a layer-boundary check fails. It owns the placement decision (which layer/module) and the import-direction rules — not the end-to-end recipe for wiring an operation through the API ladder (that is adding-operations). Trigger phrases include "where should this file/function go", "which layer is X in", "can topology import from sketching", "layer boundary violation", "check:boundaries failed", "VIOLATION: src/... imports from", "Direct .oc access is banned", "method calls on .wrapped are banned", or adding a new src/ directory or module.
---

# Navigating the layered architecture

brepjs enforces a four-layer architecture where imports flow downward or sideways, never upward. The enforcement script is the source of truth for layer membership — `CLAUDE.md` and `docs/architecture.md` summaries lag behind it.

## Layer table (source of truth: `scripts/check-layer-boundaries.sh`)

| Layer | Directories                                                                                                  | May import from                    |
| ----- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| 0     | `kernel/`, `utils/`                                                                                          | nothing internal (same-layer only) |
| 1     | `core/`                                                                                                      | layer 0                            |
| 2     | `topology/`, `2d/`, `operations/`, `query/`, `measurement/`, `io/`, `worker/`, `csg/`, `voxel/`, `implicit/` | layers 0–1 + each other            |
| 3     | `sketching/`, `text/`, `projection/`, `gear/`, `ns/`, `lattice/`                                             | layers 0–2 + each other            |

Rules and caveats:

- The rule is `target_layer <= source_layer` (the `if (( target_layer > src_layer ))` check in `scripts/check-layer-boundaries.sh`). Same-layer imports are always legal — e.g. `src/topology/wrapperFns.ts` imports `@/operations/api.js` and `@/measurement/measureFns.js` (both Layer 2).
- Files at the `src/` root (`index.ts`, `quick.ts`, sub-path entries like `topology.ts`, `core.ts`, `result.ts`) are **exempt** — the script assigns them layer `-1` and skips them. They exist to re-export everything.
- The script resolves both `@/` alias and relative imports, but only greps `from '...'` statements — dynamic `import()` expressions without `from` are not checked. Do not rely on that gap.
- When adding a **new top-level `src/` directory**, add it to the `case` statement in the `get_layer()` function in `scripts/check-layer-boundaries.sh` and to the error-message layer listing at the bottom of the same script, or its imports go entirely unchecked.

## Decision procedure: where does new code belong?

Work through this list in order; stop at the first match.

1. **A raw kernel/OCCT API call** (anything touching `oc.*` or WASM objects) → a `*Ops.ts` file under `src/kernel/occt/` (or `src/kernel/brepkit/`), exposed as a method on `KernelAdapter` in `src/kernel/types.ts`. Follow the `/new-kernel-method` command in `.claude/commands/`. See the kernel-abstraction skill.
2. **A pure helper with no geometry dependency** (string/array/math utilities) → `src/utils/`.
3. **Shared types, `Result`, vectors, memory/disposal, branded shape types** → `src/core/` (e.g. `src/core/result.ts`, `src/core/shapeTypes.ts`, `src/core/disposal.ts`).
4. **A shape operation** (transform, boolean, modifier, query, measurement, I/O) → the matching Layer 2 module's `*Fns.ts` file, then climb the API ladder below. See the adding-operations skill for the full recipe.
5. **High-level sugar composing Layer 2 operations** (sketch DSL, text, projection, gear generators, namespace re-exports) → the matching Layer 3 module.
6. **In doubt between two layers** → put it in the _lower_ layer that has everything it needs. Code can always be re-exported upward; it can never import upward.

### The API ladder (Layer 2 shape operations)

New functionality goes in `*Fns.ts` first, then surfaces upward. The full chain (mermaid diagram in `src/topology/README.md`):

```
shape() fluent facade (wrapperFns.ts)
  → api.ts (functional public API)
    → *Fns.ts implementations
      → cast.ts / getKernel()
```

Checklist when adding an operation:

1. Implement in the module's `*Fns.ts` (e.g. `src/topology/booleanFns.ts`), taking/returning branded types from `src/core/shapeTypes.ts`, returning `Result<T, E>` for fallible operations (see the result-error-handling skill).
2. Add a short-named wrapper in `src/topology/api.ts` that accepts `Shapeable<T>` and delegates via `resolve()` (both from `src/topology/apiTypes.ts`), using an options object for optional parameters. Pattern:

   ```typescript
   export function translate<T extends AnyShape<Dimension>>(shape: Shapeable<T>, v: Vec3): T {
     return transforms.translate(resolve(shape), v);
   }
   ```

3. Optionally add a chainable method on `Wrapped<T>` in `src/topology/wrapperFns.ts` — it must delegate to `api.ts`, never contain its own implementation.
4. Export from `src/index.ts` (organized by layer with `// ── Layer N ──` banners) and the matching sub-path entry at `src/` root (`topology.ts`, `operations.ts`, etc. — table in `docs/codebase-map.md`).
5. Update the module's `README.md` if one exists (pre-commit prints a non-blocking reminder via `scripts/check-readme-reminders.sh`).

## Import and naming rules

| Rule                                                                                                            | Enforced by                                                                |
| --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Imports flow downward/same-layer only                                                                           | `check:boundaries` (pre-commit, CI, `npm run validate`)                    |
| Cross-directory imports use `@/` alias (`@/kernel/index.js`); same-directory imports stay relative (`./foo.js`) | convention only                                                            |
| All `.ts` imports use `.js` extensions (ESM; Vite transforms at build time)                                     | convention only — typecheck passes without it, so review for it explicitly |
| camelCase filenames (no PascalCase, no kebab-case)                                                              | convention only                                                            |
| `import type` for type-only imports                                                                             | ESLint `consistent-type-imports`                                           |

The `@/` alias maps to `./src/*` via `tsconfig.json` `paths` and `vite.config.ts` `resolve.alias`.

## The kernel-abstraction rule

Layer 2+ code treats shapes as opaque handles. Read `shape.wrapped` only to pass it into a kernel method — never call methods on it, and never touch `.oc`:

```typescript
// Correct: .wrapped passed as an argument
const volume = getKernel().volume(shape.wrapped);

// Banned: method called ON .wrapped
const hash = shape.wrapped.HashCode(1000);
```

ESLint enforces both bans via the `no-restricted-syntax` rule in the "Kernel abstraction boundary" config block in `eslint.config.js`, but only for ten enumerated directories: `topology/`, `operations/`, `measurement/`, `query/`, `io/`, `2d/`, `sketching/`, `projection/`, `text/`, `worker/`. The rule applies just as much in `csg/`, `voxel/`, `implicit/`, `gear/`, `ns/`, and `lattice/` — lint simply does not cover them yet, so apply it by discipline there (and add new directories to the ESLint file list when creating them).

If an operation needs a kernel capability that `KernelAdapter` lacks, the fix is never to reach through `.wrapped` — add the method to the adapter first (kernel-abstraction skill, `/new-kernel-method` command).

## Fixing violations

| Symptom                                                                                                                                  | Cause                                                                                                                                      | Fix                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VIOLATION: src/operations/foo.ts (layer 2: operations) imports from '@/sketching/draw.js' (layer 3: sketching)` from `check:boundaries` | Lower layer imports a higher one                                                                                                           | One of: (a) move the importing code up to the higher layer, (b) extract the shared logic down into a layer both can import (usually `core/` or a Layer 2 sibling), (c) invert the dependency — have the higher layer pass data/callbacks down |
| `Direct .oc access is banned in Layer 2+ code` (ESLint)                                                                                  | Raw OCCT call outside `kernel/`                                                                                                            | Move the call into a kernel `*Ops.ts` file behind a `KernelAdapter` method, then call `getKernel().method(...)`                                                                                                                               |
| `Direct method calls on .wrapped are banned in Layer 2+ code` (ESLint)                                                                   | Treating a shape handle as an object with behavior                                                                                         | Find (or add) the equivalent `KernelAdapter` method in `src/kernel/types.ts` and call it via `getKernel()`                                                                                                                                    |
| Boundary check passes locally but fails in CI                                                                                            | Pre-commit runs only the **staged** variant (`check:boundaries:staged`, `.husky/pre-commit` Tier 1); CI's `quality` job runs the full tree | Run `npm run check:boundaries` (full) before pushing                                                                                                                                                                                          |
| New directory's imports never flagged                                                                                                    | Directory missing from the script's `case` statement (layer `-1` is skipped)                                                               | Register it in `scripts/check-layer-boundaries.sh`                                                                                                                                                                                            |

Reproduce locally:

```bash
npm run check:boundaries          # full tree
npm run check:boundaries:staged   # staged files only (what pre-commit runs)
npx eslint src/ --quiet           # .oc / .wrapped bans
npm run validate                  # typecheck + lint + boundaries + format + changed tests
```

Where each gate runs: pre-commit Tier 1 (staged boundaries, parallel with lint-staged and typecheck), CI `quality` job in `.github/workflows/ci.yml` (full boundaries + `check:patterns` + `knip`), and `scripts/validate-change.sh` via `npm run validate`. See the quality-gates skill for the full gate matrix.

## Additional resources

- `docs/architecture.md` — layer diagrams, data flow, key patterns with correct/banned `.wrapped` examples (layer lists predate `csg/voxel/implicit/gear/ns/lattice`; trust the script).
- `docs/codebase-map.md` — sub-path entry-point table and module→key-file maps.
- `docs/which-api.md` — choosing between the fluent wrapper, Sketcher, functional API, and Drawing as a _consumer_.
- `CONTRIBUTING.md` — "Layer Boundaries" and "ESM Imports" sections, including the boundary-error walkthrough.
- Module READMEs exist for `2d`, `core`, `io`, `kernel`, `kernel/manifold`, `measurement`, `operations`, `projection`, `query`, `sketching`, `text`, `topology`, `utils` — read the target module's README before adding code there. (`worker`, `csg`, `voxel`, `implicit`, `gear`, `ns`, `lattice` have none yet.)
- ADRs for the "why": `docs/decisions/0001-layered-architecture.md`, `0002-kernel-abstraction.md`, `0006-domain-boundaries.md`, `0007-kernel-interface-segregation.md`.
- Sibling skills: `adding-operations` (end-to-end operation recipe), `kernel-abstraction` (adapter methods, `getKernel`/`withKernel`), `result-error-handling` (`Result<T,E>` conventions), `quality-gates` (all local/CI checks).
