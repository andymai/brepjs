---
name: adding-operations
description: This skill should be used when adding or extending a geometric shape operation in brepjs — the end-to-end recipe once the target module is chosen (which is decided by architecture-navigation) — when a task says "add a new operation", "add a fillet/draft/shell variant", "expose this Fns function in the public API", "add a method to the shape() fluent wrapper", "new function is missing from function-lookup.md", "knip flags my new export", or "where do I export this from". Covers the *Fns.ts implementation template, the six export surfaces, the function-lookup CI gate, and what to test.
---

# Adding a geometric operation

End-to-end playbook for adding a shape operation: implement in a `*Fns.ts` file, surface through up to six export layers, test, and pass the docs gate. Supersedes the outline in `.claude/commands/new-operation.md` (whose step 7 test naming, `tests/fn-<name>.test.ts`, is stale — no such files exist; use `tests/<moduleName>.test.ts`). `docs/codebase-map.md` repeats the same stale `fn-*` names — do not copy from it.

## Step 0 — Scope and home

- **Needs a new kernel capability?** If OCCT must do something the `KernelAdapter` interface cannot express yet, add the kernel method first: follow `.claude/commands/new-kernel-method.md` (interface in `src/kernel/types.ts` / `src/kernel/interfaces/*.ts`, implementation in `src/kernel/occt/*Ops.ts`, wire `src/kernel/occt/defaultAdapter.ts` plus the occtWasm and brepkit adapters). See the kernel-abstraction skill. Test the new capability only through the Layer-2 API, never `*Ops` directly.
- **Pick the module**: `src/topology/` for shape-transforming ops (booleans, modifiers, healing), `src/operations/` for construction ops (extrude, revolve, loft), other Layer-2 dirs per the architecture-navigation skill. Read that module's `README.md` first — `src/topology/README.md` documents the two API styles, validity brands, and six gotchas.
- **Extend before creating**: prefer adding to an existing `*Fns.ts` (e.g. `modifierFns.ts` for a new modifier) over a new file.

## Step 1 — Implement in `*Fns.ts`

New functionality goes in `*Fns.ts` files first (`src/topology/README.md`, gotcha 6). Canonical templates: `src/topology/booleanFns.ts` (fuse/cut with evolution tracking) and `src/topology/modifierFns.ts` (the `draft` function, with rich validation via `validateDraftInputs`). The five-part shape of a Fns function:

**(a) Branded signature, validity-brand overloads.** Take and return branded types from `src/core/shapeTypes.ts`. Ops that require topological validity take brands (`ValidSolid`, `ClosedWire`, ...) and offer an `unsafe: true` overload for trusted callers — the pattern in `booleanFns.ts`:

```ts
export function fuse(a: ValidSolid, b: ValidSolid, options?: BooleanOptions): Result<ValidSolid>;
export function fuse(
  a: Shape3D,
  b: Shape3D,
  options: BooleanOptions & { unsafe: true }
): Result<Shape3D>;
```

**(b) Validate inputs → `err(validationError(...))`.** Check null shapes, parameter bounds, empty selections. Add new codes to the `BrepErrorCode` `as const` object in `src/core/errors.ts` (`enum` is lint-banned). Constructor signature: `validationError(code, message, cause?, metadata?, suggestion?)` — always fill `suggestion` with an actionable hint. Model: `validateDraftInputs` in `modifierFns.ts` (zero-angle, out-of-range, empty face list, each with a suggestion). See the result-error-handling skill for code taxonomy.

**(c) Call the kernel via `getKernel()`.** `getKernel().method(shape.wrapped, ...)` — reading `.wrapped` as an argument is fine, but calling methods on it (or touching `.oc`) is ESLint-banned in Layer 2+; the `architecture-navigation` skill owns that rule. For shape-mutating ops, follow the evolution pattern from `fuse`: default `trackEvolution = true`, `collectInputFaceHashes(inputs)` + `HASH_CODE_MAX`, call the `*WithHistory` kernel variant, then `propagateAllMetadata(evolution, inputs, result)` on success (helpers in `src/topology/metadata/metadataPropagation.ts`). On history-path diagnostics errors with a null result, `fuse` disposes it, `console.warn`s, and retries the plain kernel call — only `console.warn`/`console.error` pass lint.

**(d) Cast and verify the result.** `castShape(raw)` (`src/core/shapeTypes.ts`, defaults to 3D) then a type guard (`isShape3D`, `isSolid`, ...). On guard failure, **dispose the wrapped shape before returning the error** — copy `castToShape3D` in `booleanFns.ts`, which calls `wrapped[Symbol.dispose]()` and returns `err(typeCastError(...))` naming the actual TopAbs type. Modifiers share `finalizeShape3D` in `modifierFns.ts` (cast + metadata propagation in one call).

**(e) Never throw — wrap kernel calls in try/catch.** Convert exceptions to `err(kernelError(code, msg, cause, metadata))` with operation metadata (`{ operation, faceCount, angle }` in `draft`). One deliberate exception: abort signals rethrow (`if (signal?.aborted) throw signal.reason;` at the top of `fuse`).

Keep functions short — `npm run check:patterns` fails lint-staged on long functions and double-casts; extract helpers rather than adding a baseline entry (quality-gates skill).

## Step 2 — Surface it (export checklist)

There are two barrels per module and they are **not** chained: `src/topology/index.ts` is a small internal Layer-2 barrel, while `src/topology.ts` is the published `brepjs/topology` sub-path entry. `src/index.ts` (root entry) re-exports **most** Fns/api symbols directly from their source files (the `booleanFns` and `api.js` blocks); a smaller set of topology helpers (`cast`, `downcast`, `applyGlue`, `isNumber`, ...) is still re-exported via the `./topology/index.js` barrel. New operations belong in the direct `api.js`/`booleanFns` blocks. Work through this table top to bottom:

| #   | Surface                | File                                                                                                         | When                                                                                                 |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| 1   | Implementation         | `src/<module>/<x>Fns.ts`                                                                                     | Always                                                                                               |
| 2   | Short-named public api | `src/topology/api.ts` (or `src/operations/api.ts`)                                                           | If it deserves a clean short name                                                                    |
| 3   | Root `brepjs` entry    | `src/index.ts` — add to the matching export block (the `./topology/api.js` block, or the `booleanFns` block) | Always                                                                                               |
| 4   | Sub-path entry         | `src/topology.ts` / `src/operations.ts` / etc.                                                               | If it should be importable from `brepjs/topology` — **this is what feeds `docs/function-lookup.md`** |
| 5   | Namespace API          | `src/ns/<group>.ts` (e.g. `src/ns/booleans.ts` re-exports from `@/topology/api.js`)                          | If a matching namespace group exists                                                                 |
| 6   | Fluent facade          | `src/topology/wrapperFns.ts`                                                                                 | If chaining reads naturally                                                                          |

Notes per surface:

- **api.ts (2)**: accept `Shapeable<T>` and call `resolve()` (both from `src/topology/apiTypes.ts`); take an options object, not positional params (`DraftOptions` in `apiTypes.ts`; `RotateOptions` in `api.ts`); delegate to the Fns function passing `unsafe: true` when bridging a validity-brand requirement (see `fuse` in `api.ts`). Finder-style selection params type as `Face[] | FinderFn<Face> | ShapeFinder<Face>` resolved via `resolveFaces`.
- **Sub-path (4)**: `scripts/generate-function-lookup.ts` scans only the `SUBPATHS` map (`src/core.ts`, `src/topology.ts`, `src/operations.ts`, `src/2d.ts`, `src/sketching.ts`, `src/query.ts`, `src/measurement.ts`, `src/io.ts`, `src/worker.ts`, `src/shapeRef.ts`) — never `src/index.ts`. A root-only export silently never appears in `docs/function-lookup.md` and the gate stays green: the short api.ts names (`fuse`, `cut`, `draft`, `fillet`...) are root-only today, so none of them are in the lookup. Decide deliberately which side of that line the new op sits on.
- **`brepjs/quick`** needs no step — `src/quick.ts` does `export * from './index.js'`.
- **wrapperFns (6)**: two edits — add the method to the right `Wrapped`/`Wrapped3D` interface, and to the matching factory (`create3DBooleans`, `create3DModifiers`, `create3DCompoundOps`, ...). Methods call the api.ts function, `unwrapOrThrow` (throws `BrepWrapperError`), and bridge validity brands via the centralized trust-casts `asValidSolid` / `trustAsT` (already carrying `brepjs-patterns-disable: no-double-cast`). Pattern: `draft: (faces, opts) => wrap3D(trustAsT<T>(unwrapOrThrow(draftFn(asValidSolid(val), faces, opts))))`. Never add a wrapper method without a Fns implementation behind it.

## Step 3 — Regenerate the function lookup

If step 4 changed a sub-path entry:

```bash
npm run docs:generate-lookup
```

CI's `build` job (`.github/workflows/ci.yml`) regenerates, runs `npx prettier --write docs/function-lookup.md`, then `git diff --exit-code` — a stale file **or** a committed raw-generator (compact, un-prettified) file both fail it. lint-staged prettifies the file on commit, so regenerate-then-commit normally suffices; otherwise run prettier on it manually. Pre-commit also runs `scripts/check-function-lookup.sh`, a non-blocking reminder when `*Fns.ts` or index files are staged without the lookup.

## Step 4 — Tests

Full skeleton, assertions, kernel projects, and coverage rules live in the writing-tests skill. Operation-specific minimum:

- File: `tests/<moduleName>.test.ts` (e.g. `draftFns.test.ts`) — extend the module's existing file.
- Happy path: `isOk` + `unwrap`, shape-kind guard, and a real measurement (`unwrap(measureVolume(shape))` with `toBeCloseTo`).
- Every validation branch: `isErr` + `expect(unwrapErr(result).code).toBe('DRAFT_INVALID_ANGLE')`-style code assertions.
- Null-shape input error path (`NULL_SHAPE_INPUT`).
- If behavior differs across kernels, gate via the divergence registry (`skipIfDiverges` / `shouldSkipSuite` from `tests/helpers/kernelDivergences.js`), never inline kernel checks.
- Coverage functions floor is 91% — an untested exported function will fail `npm run test:full`.

## Step 5 — Gates before commit

```bash
npm run validate   # typecheck → lint → check:boundaries → format:check → changed tests
```

Pre-push runs **knip only**. A new export nothing imports yet trips it; if the export is exercised only from `tests/`, tag it `@testOnly` in JSDoc (`knip.config.ts` treats the tag as used). Full gate anatomy: quality-gates skill.

Consider a playground example for user-visible ops (playground-examples skill).

## Worked example — `draft` across every surface

| Surface            | Location                                                                                                                                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kernel interface   | `src/kernel/interfaces/modifierOps.ts` (`draft`), `src/kernel/interfaces/evolutionOps.ts` (`draftWithHistory`)                                                                                                                                                                        |
| Fns implementation | `src/topology/modifierFns.ts`, the `draft` function: `draft(shape: ValidSolid, faces, pullDirection, neutralPlane, angle): Result<ValidSolid>`; `validateDraftInputs`; `getKernel().draftWithHistory(...)`; `finalizeShape3D`; catch → `kernelError(BrepErrorCode.DRAFT_FAILED, ...)` |
| Param types        | `src/topology/apiTypes.ts` (`DraftOptions`, `DraftAngle`)                                                                                                                                                                                                                             |
| Public api         | `src/topology/api.ts`, the `draft` function: `draft<T extends ValidSolid>(shape: Shapeable<T>, faces, options: DraftOptions)` with `resolveFaces`                                                                                                                                     |
| Fluent             | `src/topology/wrapperFns.ts`: `Wrapped3D` interface entry + `create3DModifiers`                                                                                                                                                                                                       |
| Root export        | `src/index.ts` (inside the `./topology/api.js` block)                                                                                                                                                                                                                                 |
| Sub-path           | **absent** from `src/topology.ts` — hence `draft` does not appear in `docs/function-lookup.md` (the root-only-export gap, live)                                                                                                                                                       |
| Tests              | `tests/draftFns.test.ts` (`initKernel`, error-code assertions, `shouldSkipSuite`)                                                                                                                                                                                                     |

## Symptom → cause → fix

| Symptom                                                                       | Cause                                                                   | Fix                                                                                                       |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `Direct method calls on .wrapped are banned` (ESLint)                         | Called `shape.wrapped.Method()` in Layer 2+                             | Route through `getKernel().method(shape.wrapped)`; missing kernel capability → new-kernel-method playbook |
| CI build job fails on `git diff --exit-code docs/function-lookup.md`          | Forgot `npm run docs:generate-lookup`, or committed unprettified output | Regenerate, `npx prettier --write docs/function-lookup.md`, commit                                        |
| New function missing from function-lookup.md, gate green                      | Exported from `src/index.ts` only                                       | Export from the sub-path entry (`src/topology.ts` etc.) if it belongs in the table                        |
| knip fails on pre-push for the new export                                     | Nothing outside the file imports it yet                                 | Wire the remaining surfaces, or tag `@testOnly` if test-only                                              |
| `check:patterns` max-function-lines on the new Fns function                   | Validation + kernel call + finalize inlined                             | Extract a `validate<Op>Inputs` helper and reuse `finalizeShape3D`/`castToShape3D`                         |
| Type error: `Shape3D` not assignable to `ValidSolid` at the api/wrapper layer | Validity-brand overload not bridged                                     | api.ts passes `unsafe: true`; wrapperFns uses `asValidSolid`/`trustAsT`                                   |
| Coverage functions threshold fails after adding the op                        | Exported function or error branch untested                              | Cover each validation branch and the happy path (writing-tests skill)                                     |

## Additional resources

- `src/topology/README.md` — module map, API styles, validity brands, gotchas.
- `.claude/commands/new-kernel-method.md` — kernel-layer prerequisite steps.
- `docs/which-api.md` — fluent vs functional vs sketcher guidance for placement decisions.
- Sibling skills: `architecture-navigation` (which layer/module), `kernel-abstraction` (adapters and `getKernel`), `result-error-handling` (Result/BrepError conventions), `writing-tests` (test skeleton and multi-kernel gating), `quality-gates` (validate/hooks/knip/patterns), `memory-and-disposal` (`using`/dispose-on-failure rationale), `debugging-geometry` (when the op returns invalid geometry), `playground-examples` (showcasing the op).
