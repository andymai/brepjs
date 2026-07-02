---
name: shaperef-lineage
description: This skill should be used when debugging or extending stable references (topological naming) and history replay in brepjs — when a task says "ShapeRef resolves to the wrong face/edge", "ref won't resolve / returns not-found / BrokenRef", "resolveRef returns ambiguous", "add a new reference kind / ref type", "fillet face has no stable hash", "generated evolution is empty on occt-wasm", "selection lost after editing an upstream parameter", "history replay re-targets the wrong entity", "role table / assignRoles / updateRoles", "lineage ref", "topological naming", "resolveRefParams", "edit-after-reference", or when editing files under src/topology/shapeRef/ or src/operations/historyFns.ts.
---

# Stable references (topological naming) and history replay

Stable references name a face, edge, or vertex by its stable adjacent-neighbour roles instead of a kernel hash, so a selection survives the edits that re-hash the model. The full concept — name-by-neighbours, the four ref kinds, `exact` vs `geometric-fallback` confidence, the failure taxonomy, and per-kernel support — is owned by `apps/docs/concepts/stable-references.md`. Read that page first for the "why"; this skill owns only extension (adding a ref kind) and debugging (a ref that resolves wrong, to nothing, or to the wrong entity after a replay).

The public surface is the `brepjs/shapeRef` subpath (`package.json` `exports`), re-exported from `src/shapeRef.ts`, `src/topology/shapeRef/index.ts`, and `src/index.ts`. Implementation lives under `src/topology/shapeRef/`.

## Mental model in six lines

- The **role table** (`RoleTable = ReadonlyMap<origin, ReadonlyMap<role, readonly number[]>>` in `shapeRefTypes.ts`) is the spine: `origin → role → face hash codes`.
- `assignRoles(shape, origin)` names faces; `updateRoles(roles, origin, evolution)` advances those hashes through one operation's `ShapeEvolution`.
- **Face refs** ride hashes through evolution — they can resolve `exact`.
- **Edge / vertex / derived refs** ride their _neighbouring face roles_, never their own hash — so they sidestep generated hashes entirely.
- `exact` = resolved via a tracked hash in the role table; `geometric-fallback` = resolved via the captured geometric hint (normal, centroid, area).
- **Derived (fillet/chamfer) faces are always geometric** — confidence is hardcoded `geometric-fallback`, they can never be `exact`.

## The occt-wasm generated / fillet gotcha (read this first)

This is the single most important fact in the area, and the cause of most "why won't my fillet face resolve" confusion.

On the OCCT kernels, `evolution.generated` hashes are **never live** — they refer to an intermediate shape, not the final result — and **fillet/chamfer evolution is empty**. Consequences, all deliberate:

- `updateRoles` **intentionally does not consume `evolution.generated`** (see the comment at the `updateRoles` docblock in `shapeRefFns.ts`: "verified: 0 live generated hashes across cut/fuse on occt-wasm"). Naming a generated face via the role table produces a role that never resolves.
- Derived faces are re-found **geometrically**, never by hash — see the file header of `derivedFaceRefFns.ts`.
- `ResolvedDerivedFaceRef.confidence` is hardcoded `'geometric-fallback'` in `shapeRefTypes.ts`.
- Derived-face replay tests are gated to **occt-wasm only** (not the whole OCCT family) — on OpenCascade.js filleting one edge splits the +Z face into a divergent topology (`tests/shapeRefDerivedReplay.test.ts` header comment).

How the geometric workaround actually resolves a derived face (`resolveDerivedFaceRef` in `derivedFaceRefFns.ts`):

1. Re-derive each of the two bridged faces via the role table, else via `facesByNormal` (faces whose normal dotted with the captured normal exceeds `NORMAL_MATCH = 0.99`).
2. `betweenFaces` = faces adjacent to **both** bridged faces (via cached edge→face adjacency).
3. Keep only faces whose normal has a positive component (`> BLEND_THRESHOLD = 0.1`) along **both** bridged normals — this rejects the orthogonal flanking faces that are also adjacent to both.
4. One survivor → resolved; several → nearest to the captured `edgeMidpoint` (`HINT_MARGIN = 1e-6` tie → ambiguous); none → broken.

## Symptom → cause → fix

| Symptom                                                                                   | Likely cause                                                                                                           | Fix                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Edge/vertex ref returns `not-found`                                                       | Role table stale — `facesForRole` returned `[]` because the tracked hash no longer matches any live face               | `updateRoles` was skipped across an intervening edit; propagate the role table through **every** operation's `ShapeEvolution`. Confirm `ref.origin` matches the string passed to `assignRoles`. This is the #1 cause. |
| Face ref resolves to the **wrong** face on geometric fallback                             | A scorer reject or a weak hint                                                                                         | Check `defaultScorer` rejects (below); the true face may be scoring `-Infinity`. Supply a custom `FaceScorer` if the geometry is unusual.                                                                             |
| `resolveRef` returns `ambiguous`                                                          | Two candidates tie within a margin, or a duplicated/symmetric feature                                                  | Inspect `broken.candidates`. Thresholds: `AMBIGUITY_THRESHOLD = 0.1` (face scoring), `HINT_MARGIN = 1e-6` (edge/vertex/derived hint tiebreak).                                                                        |
| Face ref returns `deleted`; edge/vertex returns `not-found` for the same vanished feature | Different taxonomies by kind (below)                                                                                   | `deleted` is expected-skip for a replay engine; edge/vertex/derived can never report `deleted` (they don't track their own hash) so a vanished entity surfaces as `not-found`.                                        |
| Non-primitive origin loses stability on rebuild                                           | Only `box`/`cylinder`/`cone`/`sphere` get **semantic** roles; everything else falls back to positional `opType:face_N` | Positional names are stable only if `getFaces` iteration order is stable across the rebuild. Prefer a primitive origin, or maintain a role table across edits instead of relying on `resolveRefIn`.                   |
| Fillet/chamfer face never resolves via the role table                                     | The generated-hash reality above                                                                                       | Use a `DerivedFaceRef` (geometric), not a face ref. It's inherently `geometric-fallback`.                                                                                                                             |
| Replay re-targets the wrong entity                                                        | The step has multiple inputs, or a ref points at a non-3D input                                                        | `resolveStepParams` only auto-resolves **single-input 3D** steps; multi-input refs stay raw. See history section below.                                                                                               |

### `defaultScorer` reject thresholds (`scoring.ts`)

A debugger hitting a wrong/absent match usually tripped one of these hard rejects:

- Surface-type set but mismatched → `-Infinity` (hard reject).
- Normal set and `dot < 0.707` → `-Infinity`.
- Centroid set and `distSq > 100` (more than 10 units away) → `-Infinity`; otherwise penalty `-distSq/100`.
- Area penalty only when `|log(hintArea / faceArea)| > 1.0`.
- After scoring, `resolveRef` rejects anything below `MIN_SCORE = 0.5` → `not-found`.

### Reproduce the role-table path minimally

Mirror `tests/shapeRefEditReplay.test.ts` — build the table, advance it, resolve:

```ts
const roles = new Map([['box', assignRoles(box, 'box')]]);
const ref = createRef('box', 'box:top', topFace);
const { evolution, shape: next } = unwrap(fuseWithEvolution(box, other)); // *WithEvolution → Result
const advanced = updateRoles(roles, 'box', evolution);
const resolved = resolveRef(ref, advanced, next); // 'face' in resolved ? exact/fallback : broken
```

`*WithEvolution` wrappers (`fuseWithEvolution`, `filletWithEvolution`, …) are the layer-2 source of the `ShapeEvolution` fed to `updateRoles` (`src/topology/evolutionFns.ts`, exported from `src/index.ts`). Each returns a `Result` that must be unwrapped or checked before use — mirror `tests/shapeRefEditReplay.test.ts`, which does `const { shape, evolution } = unwrap(fuseResult);`.

## Failure taxonomy by ref kind

- **Face ref** `BrokenRef.reason`: `'deleted' | 'ambiguous' | 'not-found'`. `deleted` means the role table had the role but its tracked successor was removed.
- **Edge / vertex / derived**: `reason` is only `'ambiguous' | 'not-found'` — **never `deleted`**. They track adjacent face roles, not their own hash, so a vanished entity is `not-found`. This is stated in the type docblocks in `shapeRefTypes.ts`.
- All broken results carry `candidates?` — the tied entities to inspect.

## Adding a new reference kind

The four existing kinds (face, edge, vertex, derived) share one contract. To add a fifth, work through this checklist against the real files. Follow the export-surface mechanics in the `adding-operations` sibling skill — a new `create*/resolve*` pair must flow through the same six export surfaces plus the `brepjs/shapeRef` subpath.

1. **Types** — in `shapeRefTypes.ts` add `XRef`, its `XHint`, `ResolvedXRef` (with a `confidence`), and `BrokenXRef`. Decide the failure taxonomy up front: it can report `deleted` **only if it tracks its own face hash**; if it names itself by neighbour roles (the recommended pattern), its reason is `'ambiguous' | 'not-found'` like edge/vertex.
2. **Functions** — new `xRefFns.ts` with `createXRef` (capture the hint on the pre-edit shape) and `resolveXRef`. Follow the established pattern: resolve neighbour roles via `roleLookup.ts` helpers (`facesForRole`, `roleOfFace`), disambiguate with the hint, apply an ambiguity margin. Return early `not-found` when `facesForRole` yields `[]`.
3. **Dispatch** — in `refResolveFns.ts` add an `isXRef` structural guard and a branch in `resolveLineageRef`, and extend the `LineageRef` union (and `ResolvedEntity` if it resolves to a new entity type). **Guard ordering is load-bearing**: guards discriminate structurally, most-specific first. Current order is derived (`betweenRoles` + `op`) → edge (`faceRoles.length === 2`) → vertex (`faceRoles.length >= 3`) → face (`role` is a string). Place a new guard so it can't be shadowed by a looser one.
4. **Barrels** — export from `src/topology/shapeRef/index.ts`, `src/shapeRef.ts`, and `src/index.ts`. Once it's in the `LineageRef` union and the guards, it auto-flows through `resolveRefParams` and history replay for free.
5. **Recursion caveat** — `resolveRefParams` descends via `isPlainOptions`, which skips arrays it already handled, non-plain-prototype objects, and anything with a `wrapped` key. Keep the new ref a **plain serializable object** (like the others); a class instance would be silently skipped by the walker.
6. **Test** — add `tests/shapeRefXReplay.test.ts` gated to occt-wasm. Use the divergence-skip mechanics owned by the `writing-tests` sibling skill (`currentKernelId`, `shouldSkipSuite`, `describe.skipIf`).

## How history replay resolves refs

Replay lets a stored selection survive an upstream parameter edit. The engine is `src/operations/historyFns.ts` (`ModelHistory` / `OperationStep` are pure data; `OperationRegistry` maps op name → `OperationFn`).

- `resolveStepParams(params, inputs)` resolves refs **only for single-input, 3D steps** — it calls `resolveRefParams` against the sole input. Multi-input, ref-free, or non-3D steps are left raw: with several inputs the target input is ambiguous, and resolving against the wrong input would silently return a wrong-shape entity.
- Called from both `replayHistory` and `replayFrom` before invoking the `OperationFn`.
- The **stored step keeps its raw refs**; resolution happens fresh at each replay. A `ShapeRef` is plain JSON, so it survives `serializeHistory`/`deserializeHistory`.
- `modifyStep(stepId, newParams)` is the parametric-edit loop: it updates the params then `replayFrom`s that step.
- `tests/historyRefReplay.test.ts` is the canonical worked example (re-targets an edge after a box-height edit; multi-input leaves the ref raw).

Replay errors are `Result.Err` with codes `REPLAY_UNKNOWN_OP` / `REPLAY_MISSING_INPUT` / `REPLAY_STEP_FAILED` / `REPLAY_STEP_NOT_FOUND` / `MODIFY_STEP_NOT_FOUND`.

## Where evolution comes from

`ShapeEvolution = { modified, generated, deleted }` (`src/kernel/types.ts`) is built in `src/kernel/occt/evolutionOps.ts` and produced by the `*WithHistory` kernel methods in `src/kernel/occt/historyOps.ts` (wired via `makeHistoryOps`). Fillet/chamfer go through `BRepFilletAPI_MakeFillet`/`MakeChamfer`; the plumbing populates `generated`, but on occt-wasm those `Generated()` results don't map to final-shape faces — the empty/never-live reality above. For anything kernel-side (adding a `*WithHistory` method, adapter capability differences), defer to the `kernel-abstraction` sibling skill; for the embind enum/hash-code details underlying `evolutionOps.ts`, defer to `wasm-interop`.

## Worked examples in the test suite

`tests/shapeRefEditReplay.test.ts` (modified-face tracking + split-fragment disambiguation), `tests/shapeRefDerivedReplay.test.ts` (fillet/chamfer normal-blend, occt-wasm-gated), `tests/shapeRefEdgeReplay.test.ts`, `tests/shapeRefVertexReplay.test.ts`, `tests/historyRefReplay.test.ts`, and the unit/integration pair `tests/shapeRef.test.ts` + `tests/shapeRefIntegration.test.ts`.

## Sibling skills

- `adding-operations` — the six export surfaces + `function-lookup.md` gate a new `create*/resolve*` pair must pass through.
- `kernel-abstraction` — kernel-side evolution, `*WithHistory` methods, adapters, capability differences.
- `wasm-interop` — embind enum `.value`, `Uint32Array` conversion, and hash-code details underlying `evolutionOps.ts`.
- `writing-tests` — the kernel-divergence skip pattern for gating a new ref-kind test to occt-wasm.
