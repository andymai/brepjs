# Boolean failure reference

Symbols in `src/topology/booleanFns.ts`, `src/topology/booleanDiagnosticFns.ts`, `src/topology/meshFns.ts`, and `src/kernel/types.ts`.

## Two diagnostic surfaces — keep them separate

### 1. `checkBoolean(base, tool, op)` — pre-flight predictor

`booleanDiagnosticFns.ts` → `CheckBooleanResult { valid, issues: BooleanIssue[] }`. Each issue is `{ operand: 'base'|'tool', issue: 'null-shape'|'not-valid', message }` (`kernel/types.ts`). It only checks operands for null/invalid **before** the op — it never explains a failure after the fact. Exported from `src/index.ts`. Tests: `tests/booleanDiagnostics.test.ts`.

### 2. `BooleanDiagnostics` — post-op signal

`{ hasErrors, hasWarnings, messages }` (`kernel/types.ts`). `fuse`/`cut`/`intersect` with `trackEvolution` (default `true`) call the `*WithHistory` kernel path and attach this.

- **`messages` is always empty** — OCCT's `Standard_OStream` reporting is unreachable in WASM builds (documented on the type). Branch on `hasErrors`/`hasWarnings`, never on message text.
- `hasErrors` + null result → the op retries once **without** evolution tracking (`console.warn`).
- `hasErrors` + non-null result → warns and continues (`booleanFns.ts`).
- When the result cannot cast to 3D, diagnostics ride into `error.metadata.diagnostics` (`booleanFns.ts`).

## Built-in guards and knobs

- Null operands are rejected pre-kernel via `validateShape3D` → `NULL_SHAPE_INPUT` (`booleanFns.ts`, used at `:132-135`).
- The 3D cast failure names the actual type: "Got COMPOUND instead." / "Got FACE instead." (`booleanFns.ts`) — a compound out of a fuse means the operands didn't merge.
- The FUSE error carries a baked-in suggestion: _"Common causes: overlapping coplanar faces, zero-thickness geometry, or non-manifold input. Try autoHeal() on inputs first."_ (`booleanFns.ts`).
- `fuzzyValue` (a `BooleanOptions` field, `booleanFns.ts`) widens tolerance for near-coincident geometry.
- `BOOLEAN_HAS_ERRORS` (`src/core/errors.ts`) — the `brep` CLI hint table reads it as "often coincident faces or near-tangent contact — perturb one operand slightly" (`packages/brepjs-cad/src/verify/report.ts`).

## The #1126 disjoint-fuse corruption class

**Symptom.** `fuseAll(shapes)` (default `strategy: 'native'`, N-way `BRepAlgoAPI_BuilderAlgo`) silently corrupts the topology of certain disjoint inputs — the canonical case is an annular-sector tread fused with a frenet-swept rail. The result passes `isValid`, `validSolid`, `mesh`, `measureArea`, and `getBounds`, and `autoHeal` cannot repair it. It only manifests when the STEP writer runs, as a `WebAssembly.RuntimeError` that **corrupts the Emscripten heap and poisons the kernel for the rest of the session** (`meshFns.ts`).

**Detection nets** (neither is a full guard):

- `probeSerializable` (`meshFns.ts`) runs a pre-export bounding-box probe and catches _some_ degenerates → `STEP_EXPORT_UNSERIALIZABLE` / `STL_EXPORT_UNSERIALIZABLE`, localizing the offending sub-solid. It does **not** catch the canonical #1126 shape.
- `exportError` classifies the writer trap as `*_EXPORT_CRASHED` (`meshFns.ts`) — the only signal for the non-probeable case.

**Fix.** `fuseAll(shapes, { strategy: 'pairwise' })` — recursive divide-and-conquer over `BRepAlgoAPI_Fuse`, a different OCCT algorithm that is unaffected (`booleanFns.ts`). Tracked upstream at andymai/opencascade.js#3.

## Recovery sequence (from `docs/getting-started.md`)

1. Read `error.suggestion`.
2. Check the operands actually overlap.
3. `unwrap(autoHeal(shape))` on the operands.
4. Branch on `error.code` (look it up in `docs/errors.md`).
