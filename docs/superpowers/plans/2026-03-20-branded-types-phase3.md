# Branded Types Phase 3: ValidSolid Consumers + PlanarFace/PlanarWire Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the branded type system by (1) requiring `ValidSolid` on boolean/modifier operations (ADR-0005 Phase 3b), and (2) adding `PlanarFace`/`PlanarWire` geometric validity brands (ADR-0011).

**Architecture:** Extends the existing phantom brand pattern in `src/core/validityTypes.ts`. Smart constructors prove validity at runtime via kernel calls (`isValid`, `surfaceType`). Consumer functions tighten their input types; internal call sites use justified `as` casts where the invariant holds by construction.

**Tech Stack:** TypeScript phantom types, Vitest, two WASM kernels (OCCT + brepkit)

---

## File Map

| File                                                | Action          | Responsibility                                                                         |
| --------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------- |
| `src/core/validityTypes.ts`                         | Modify          | Add `PlanarFace`, `PlanarWire`, smart constructors, type guards                        |
| `src/core/shapeTypes.ts`                            | Modify          | Re-export new types                                                                    |
| `src/index.ts`                                      | Modify          | Export new types + guards from public API                                              |
| `tests/validityTypes.test.ts`                       | Modify          | Add tests for planarity brands                                                         |
| `tests/booleanFns.test.ts`                          | Modify          | Update test call sites to use `ValidSolid`                                             |
| `src/topology/booleanFns.ts`                        | Modify          | Require `ValidSolid` on `fuse`, `cut`, `intersect`, `fuseAll`, `cutAll`                |
| `src/topology/modifierFns.ts`                       | Modify          | Require `ValidSolid` on `fillet`, `chamfer`, `shell`, `offset`, `draft`                |
| `src/operations/roofFns.ts`                         | Modify          | Return `Result<ValidSolid>` from `roof()`; require `PlanarWire` input                  |
| `src/topology/surfaceBuilders.ts`                   | Modify          | `makeFace` returns `OrientedFace & PlanarFace`; add planarity input brands             |
| `src/topology/primitiveFns.ts`                      | Modify          | `face()` requires `PlanarWire`, returns `PlanarFace`; `polygon()` returns `PlanarFace` |
| `src/operations/extrudeFns.ts`                      | Modify          | `extrude`/`revolve` require `PlanarFace`                                               |
| `docs/decisions/0005-topological-validity-types.md` | Already updated | Phase 3b documented                                                                    |
| `docs/decisions/0011-geometric-validity-brands.md`  | Already created | PlanarFace/PlanarWire ADR                                                              |

---

## Part A: ValidSolid Consumer Rollout (ADR-0005 Phase 3b)

### Task 1: ValidSolid on Boolean Operations

**Files:**

- Modify: `src/topology/booleanFns.ts` — `fuse`, `cut`, `intersect`, `fuseAll`, `cutAll` signatures
- Modify: `tests/booleanFns.test.ts` (update call sites)
- Test: `tests/booleanFns.test.ts`

- [ ] **Step 1: Read booleanFns.ts and tests to understand current usage**

Read `src/topology/booleanFns.ts` and `tests/booleanFns.test.ts` to understand how `fuse`, `cut`, `intersect`, `fuseAll`, `cutAll` are called. Note: these currently accept `Shape3D` which includes `Shell | Solid | CompSolid | Compound<'3D'>`. Verify whether any callers pass `Shell` or `Compound` — if so, they'll need the `unsafe` overload.

- [ ] **Step 2: Write failing test — fuse requires ValidSolid**

In `tests/booleanFns.test.ts`, add a type-level test confirming that `fuse` accepts `ValidSolid` inputs:

```ts
it('fuse accepts ValidSolid inputs', () => {
  const a = box(10, 10, 10);
  const b = box(5, 5, 5);
  // box() returns ValidSolid — this should compile and work
  const result = fuse(a, b);
  expect(isOk(result)).toBe(true);
});
```

- [ ] **Step 3: Run test to verify it passes (baseline)**

Run: `npx vitest run tests/booleanFns.test.ts --reporter=verbose`
Expected: PASS (this is a baseline — should already work)

- [ ] **Step 4: Add overloaded signatures for `fuse`**

In `src/topology/booleanFns.ts`, add overloads so the primary path requires `ValidSolid` but an `unsafe` flag allows `Shape3D`:

```ts
// Overload 1: safe path (default) — requires ValidSolid
export function fuse(
  a: ValidSolid,
  b: ValidSolid,
  options?: BooleanOptions
): Result<ValidSolid>;
// Overload 2: unsafe path — accepts any Shape3D when caller opts in
export function fuse(
  a: Shape3D,
  b: Shape3D,
  options: BooleanOptions & { unsafe: true }
): Result<Shape3D>;
// Implementation
export function fuse(
  a: Shape3D,
  b: Shape3D,
  { optimisation = 'none', simplify = false, signal, fuzzyValue, unsafe: _unsafe }: BooleanOptions & { unsafe?: boolean } = {}
): Result<Shape3D> {
```

Add `unsafe?: boolean` to the `BooleanOptions` type. This preserves the existing `Shape3D` path for advanced users (e.g., operating on shells) while making `ValidSolid` the default.

Update `validateShape3D` calls — they accept `Shape3D`, which remains the implementation parameter type.

- [ ] **Step 5: Apply same overload pattern to `cut`, `intersect`, `fuseAll`, `cutAll`**

Same pattern. Each gets two overloads: safe (ValidSolid) and unsafe (Shape3D + `{ unsafe: true }`).

For `fuseAll`: `shapes: ValidSolid[]` (safe) vs `shapes: Shape3D[], options: { unsafe: true }` (unsafe).
For `cutAll`: `base: ValidSolid, tools: ValidSolid[]` (safe) vs `base: Shape3D, tools: Shape3D[], options: { unsafe: true }` (unsafe).

- [ ] **Step 6: Fix compilation errors in internal call sites**

Run: `npm run typecheck`

Internal callers that pass `Shape3D` to boolean ops will break. For each:

- If the caller already has a `ValidSolid` (e.g., from `box()`, `extrude()`), no change needed
- If the caller has a `Solid` from casting, add `as ValidSolid` with a comment explaining why the cast is sound
- If the caller legitimately passes a `Shell`, use the `{ unsafe: true }` overload

Likely affected files: `src/topology/wrapperFns.ts` (OOP wrapper), `src/operations/compoundOpsFns.ts`.

- [ ] **Step 7: Run tests**

Run: `npx vitest run tests/booleanFns.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/topology/booleanFns.ts tests/booleanFns.test.ts
# Include any files fixed in Step 6
git commit -m "$(cat <<'EOF'
feat(types)!: require ValidSolid on boolean operations (fuse, cut, intersect, fuseAll, cutAll)

BREAKING CHANGE: Boolean operations now require ValidSolid inputs by
default. Pass { unsafe: true } to operate on arbitrary Shape3D (shells,
compounds). Primitive constructors (box, sphere, cylinder, etc.) and
extrude() already return ValidSolid. For other solids, use validSolid(s)
or isValidSolid(s) to narrow.
EOF
)"
```

### Task 2: ValidSolid on Modifier Operations

**Files:**

- Modify: `src/topology/modifierFns.ts` — `fillet`, `chamfer`, `shell`, `offset`, `draft` signatures
- Test: `tests/modifierFns.test.ts` or `tests/operations.test.ts`

- [ ] **Step 1: Read modifierFns.ts to understand current signatures**

Read `src/topology/modifierFns.ts` to find `fillet`, `chamfer`, `shell`, `offset`, `draft`. Note: all accept `Shape3D`. Verify whether any callers pass non-Solid shapes (e.g., Shell).

- [ ] **Step 2: Write baseline test**

Confirm existing tests pass with `ValidSolid` inputs (primitives already return `ValidSolid`):

```ts
it('fillet accepts ValidSolid input', () => {
  const s = box(10, 10, 10);
  const edges = getEdges(s);
  const result = fillet(s, edges, 1);
  expect(isOk(result)).toBe(true);
});
```

- [ ] **Step 3: Run baseline test**

Run: `npx vitest run tests/operations.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 4: Change signatures for `fillet`, `chamfer`, `shell`, `offset`, `draft`**

In `src/topology/modifierFns.ts`:

```ts
// fillet: Shape3D → ValidSolid (input), Result<Shape3D> → Result<ValidSolid> (output)
export function fillet(
  shape: ValidSolid,
  edges: ReadonlyArray<Edge> | undefined,
  radius: number | [number, number] | ((edge: Edge) => number | [number, number] | null)
): Result<ValidSolid> {

// chamfer: same pattern
export function chamfer(
  shape: ValidSolid,
  edges: ReadonlyArray<Edge> | undefined,
  distance: number | [number, number] | ((edge: Edge) => number | [number, number] | null)
): Result<ValidSolid> {

// shell: ValidSolid input, Result<ValidSolid> output
export function shell(
  shape: ValidSolid,
  faces: ReadonlyArray<Face>,
  thickness: number,
  tolerance = 1e-3
): Result<ValidSolid> {

// offset: ValidSolid input, Result<ValidSolid> output
export function offset(
  shape: ValidSolid,
  distance: number,
  tolerance = 1e-6
): Result<ValidSolid> {

// draft: ValidSolid input, Result<ValidSolid> output
export function draft(
  shape: ValidSolid,
  faces: ReadonlyArray<Face>,
  pullDirection: Vec3,
  neutralPlane: Vec3,
  angle: number | ((face: Face) => number | null)
): Result<ValidSolid> {
```

Add import for `ValidSolid`. Update internal cast sites to return `ValidSolid`.

- [ ] **Step 5: Fix compilation errors**

Run: `npm run typecheck`

Fix callers — same approach as Task 1 Step 6.

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/operations.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/topology/modifierFns.ts
# Include any files fixed in Step 5
git commit -m "$(cat <<'EOF'
feat(types)!: require ValidSolid on modifier operations (fillet, chamfer, shell, offset)

BREAKING CHANGE: fillet(), chamfer(), shell(), offset(), and draft() now
require ValidSolid inputs. These operations produce garbage on invalid solids.
EOF
)"
```

### Task 3: roof() Returns ValidSolid + Requires PlanarWire

**Files:**

- Modify: `src/operations/roofFns.ts` — `roof` signature (input + return type)

- [ ] **Step 1: Change `roof()` signature**

In `src/operations/roofFns.ts`, change both input and return type. The JSDoc already says "A planar wire defining the roof footprint" — the type should enforce this:

```ts
// Before
export function roof(w: ClosedWire<Dimension>, options?: RoofOptions): Result<Solid> {
// After
export function roof(w: ClosedWire<Dimension> & PlanarWire<Dimension>, options?: RoofOptions): Result<ValidSolid> {
```

Add imports for `PlanarWire` and `ValidSolid`. Update the internal return site to cast `as ValidSolid` (roof constructs from validated geometry).

- [ ] **Step 2: Fix compilation errors**

Run: `npm run typecheck`

Callers passing `ClosedWire` without `PlanarWire` to `roof()` will need updating. Check `src/topology/wrapperFns.ts` and any test files.

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/roofFns.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/operations/roofFns.ts
# Include any files fixed in Step 2
git commit -m "feat(types)!: roof() requires PlanarWire and returns ValidSolid"
```

---

## Part B: PlanarFace / PlanarWire Brands (ADR-0011)

### Task 4: Add PlanarFace and PlanarWire Types + Guards

**Files:**

- Modify: `src/core/validityTypes.ts`
- Modify: `src/core/shapeTypes.ts` (re-export)
- Modify: `src/index.ts` (public export)
- Create tests in: `tests/validityTypes.test.ts`

- [ ] **Step 1: Write failing tests for planarity guards**

In `tests/validityTypes.test.ts`, add:

```ts
describe('PlanarFace', () => {
  it('isPlanarFace returns true for a planar face', () => {
    const w = unwrap(
      wireLoop([
        line([0, 0, 0], [10, 0, 0]),
        line([10, 0, 0], [10, 10, 0]),
        line([10, 10, 0], [0, 10, 0]),
        line([0, 10, 0], [0, 0, 0]),
      ])
    );
    const f = unwrap(face(w));
    expect(isPlanarFace(f)).toBe(true);
  });

  it('isPlanarFace returns false for a non-planar face', () => {
    // filledFace on a non-planar wire
    const w = unwrap(
      wireLoop([
        line([0, 0, 0], [10, 0, 0]),
        line([10, 0, 0], [10, 10, 5]),
        line([10, 10, 5], [0, 10, 0]),
        line([0, 10, 0], [0, 0, 0]),
      ])
    );
    const f = unwrap(filledFace(w));
    expect(isPlanarFace(f)).toBe(false);
  });

  it('planarFace smart constructor returns Ok for planar face', () => {
    const w = unwrap(
      wireLoop([
        line([0, 0, 0], [10, 0, 0]),
        line([10, 0, 0], [10, 10, 0]),
        line([10, 10, 0], [0, 10, 0]),
        line([0, 10, 0], [0, 0, 0]),
      ])
    );
    const f = unwrap(face(w));
    const result = planarFace(f);
    expect(isOk(result)).toBe(true);
  });
});

describe('PlanarWire', () => {
  it('isPlanarWire returns true for a wire in a plane', () => {
    const w = unwrap(
      wireLoop([
        line([0, 0, 0], [10, 0, 0]),
        line([10, 0, 0], [10, 10, 0]),
        line([10, 10, 0], [0, 10, 0]),
        line([0, 10, 0], [0, 0, 0]),
      ])
    );
    expect(isPlanarWire(w)).toBe(true);
  });

  it('isPlanarWire returns false for a non-planar wire', () => {
    const w = unwrap(
      wireLoop([
        line([0, 0, 0], [10, 0, 0]),
        line([10, 0, 0], [10, 10, 5]),
        line([10, 10, 5], [0, 10, 0]),
        line([0, 10, 0], [0, 0, 0]),
      ])
    );
    expect(isPlanarWire(w)).toBe(false);
  });
});
```

Adjust imports as needed. The test helpers (`line`, `wireLoop`, `face`, `filledFace`) should already be available or importable from the test's existing imports.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/validityTypes.test.ts --reporter=verbose`
Expected: FAIL — `isPlanarFace` and `isPlanarWire` not exported

- [ ] **Step 3: Implement PlanarFace / PlanarWire in validityTypes.ts**

Add to `src/core/validityTypes.ts`:

```ts
// --- Brand symbol ---
declare const __planar: unique symbol;

// --- Types ---

/** A face whose underlying surface is a geometric plane. */
export type PlanarFace<D extends Dimension = '3D'> = Face<D> & { readonly [__planar]: true };

/** A wire whose edges all lie in a common plane. */
export type PlanarWire<D extends Dimension = '3D'> = Wire<D> & { readonly [__planar]: true };

// --- Type guards ---

/** Type guard — check if a face is planar (underlying surface is a plane). */
export function isPlanarFace<D extends Dimension>(face: Face<D>): face is PlanarFace<D> {
  return getKernel().surfaceType(face.wrapped) === 'plane';
}

/**
 * Type guard — check if a wire is planar (all edges lie in a common plane).
 * Strategy: call makeFace WITHOUT the planar-only flag (false = allow any surface),
 * then check the resulting surface type. This avoids false negatives from tolerance
 * issues — if makeFace produces a plane, the wire is truly planar.
 * Falls back to false if makeFace fails entirely (disconnected wire, etc.).
 */
export function isPlanarWire<D extends Dimension>(wire: Wire<D>): wire is PlanarWire<D> {
  const kernel = getKernel();
  try {
    // Pass false to allow non-planar face construction — we check surface type ourselves
    const tempFace = kernel.makeFace(wire.wrapped, false);
    const result = kernel.surfaceType(tempFace) === 'plane';
    try {
      kernel.dispose(tempFace);
    } catch {
      /* best-effort cleanup */
    }
    return result;
  } catch {
    return false;
  }
}

// --- Smart constructors ---

/** Prove that a face is planar, returning a branded `PlanarFace` on success. */
export function planarFace<D extends Dimension>(face: Face<D>): Result<PlanarFace<D>, string> {
  if (isPlanarFace(face)) return ok(face);
  return err('Face is not planar: underlying surface is not a geometric plane');
}

/** Prove that a wire is planar, returning a branded `PlanarWire` on success. */
export function planarWire<D extends Dimension>(wire: Wire<D>): Result<PlanarWire<D>, string> {
  if (isPlanarWire(wire)) return ok(wire);
  return err('Wire is not planar: edges do not lie in a common plane');
}
```

- [ ] **Step 4: Re-export from shapeTypes.ts and index.ts**

In `src/core/shapeTypes.ts`, add to the re-export block:

```ts
export type {
  ClosedWire,
  OrientedFace,
  ManifoldShell,
  ValidSolid,
  PlanarFace,
  PlanarWire,
} from './validityTypes.js';
export {
  closedWire,
  orientedFace,
  manifoldShell,
  validSolid,
  isClosedWire,
  isOrientedFace,
  isManifoldShell,
  isValidSolid,
  planarFace,
  planarWire,
  isPlanarFace,
  isPlanarWire,
} from './validityTypes.js';
```

In `src/index.ts`, add `PlanarFace`, `PlanarWire`, `planarFace`, `planarWire`, `isPlanarFace`, `isPlanarWire` to the appropriate export groups (wherever `ClosedWire` etc. are exported).

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/validityTypes.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/validityTypes.ts src/core/shapeTypes.ts src/index.ts tests/validityTypes.test.ts
git commit -m "feat(types): add PlanarFace and PlanarWire geometric validity brands (ADR-0011)"
```

### Task 5: makeFace / face Return PlanarFace (Producers)

**Files:**

- Modify: `src/topology/surfaceBuilders.ts` (line 22 — `makeFace` return type)
- Modify: `src/topology/primitiveFns.ts` (line 404 — `face` return type, line 428 — `polygon` return type)
- Test: `tests/surfaceBuilders.test.ts` or existing face tests

- [ ] **Step 1: Change `makeFace` return type to include PlanarFace**

In `src/topology/surfaceBuilders.ts`:

```ts
// Before
export function makeFace<D extends Dimension = '3D'>(
  wire: ClosedWire<D>,
  holes?: ClosedWire<D>[]
): Result<OrientedFace<D>> {

// After
export function makeFace<D extends Dimension = '3D'>(
  wire: ClosedWire<D>,
  holes?: ClosedWire<D>[]
): Result<OrientedFace<D> & PlanarFace<D>> {
```

Update internal return: after creating the face, verify planarity with a runtime check before branding. The kernel's `makeFace` may succeed on near-planar wires within tolerance, so add a defensive `isPlanarFace` check:

```ts
const faceShape = kernel.makeFace(wire.wrapped, true);
const result = createFace<D>(faceShape);
// Verify planarity — makeFace may succeed on near-planar wires within tolerance
if (!isPlanarFace(result)) {
  return err(
    validationError(
      'FACE_NOT_PLANAR',
      'makeFace produced a non-planar face — wire may not be truly planar'
    )
  );
}
return ok(result as OrientedFace<D> & PlanarFace<D>);
```

- [ ] **Step 2: Change `face()` and `polygon()` return types**

In `src/topology/primitiveFns.ts`:

```ts
// face(): delegates to makeFace, same return type
export function face(
  w: ClosedWire,
  holes?: ClosedWire[]
): Result<OrientedFace & PlanarFace> {

// polygon(): always planar (note: regular array param, not rest)
export function polygon(
  points: Vec3[]
): Result<OrientedFace & PlanarFace> {
```

- [ ] **Step 3: Run typecheck + tests**

Run: `npm run typecheck && npx vitest run tests/validityTypes.test.ts tests/shapeFns.test.ts --reporter=verbose`
Expected: PASS (return types are narrower — callers get more information, no breakage). Note: there is no dedicated `surfaceBuilders.test.ts` — `makeFace` is exercised via face/validity tests.

- [ ] **Step 4: Commit**

```bash
git add src/topology/surfaceBuilders.ts src/topology/primitiveFns.ts
git commit -m "feat(types): makeFace/face/polygon return PlanarFace brand"
```

### Task 6: Require PlanarFace on extrude / revolve (Breaking)

**Files:**

- Modify: `src/operations/extrudeFns.ts` (lines 29, 64 — `extrude`, `revolve`)
- Modify: `tests/operations-extrude.test.ts`

- [ ] **Step 1: Change `extrude` signature**

In `src/operations/extrudeFns.ts`:

```ts
// Before
export function extrude(face: OrientedFace<Dimension>, extrusionVec: Vec3): Result<ValidSolid> {

// After
export function extrude(
  face: OrientedFace<Dimension> & PlanarFace<Dimension>,
  extrusionVec: Vec3
): Result<ValidSolid> {
```

Add import: `import type { PlanarFace } from '@/core/validityTypes.js';`

- [ ] **Step 2: Change `revolve` signature**

```ts
// Before
export function revolve(
  face: OrientedFace<Dimension>,
  center: Vec3 = [0, 0, 0],
  direction: Vec3 = [0, 0, 1],
  angle = 360
): Result<Shape3D> {

// After
export function revolve(
  face: OrientedFace<Dimension> & PlanarFace<Dimension>,
  center: Vec3 = [0, 0, 0],
  direction: Vec3 = [0, 0, 1],
  angle = 360
): Result<Shape3D> {
```

- [ ] **Step 3: Fix compilation errors**

Run: `npm run typecheck`

Internal callers that pass `OrientedFace` without `PlanarFace` will break. For each:

- Sketch/CompoundSketch: `face as OrientedFace` → `face as OrientedFace & PlanarFace` (sketch faces are planar by construction)
- `sketchFns.ts`: same pattern
- `compoundOpsFns.ts`: same pattern
- Test files: faces from `face()` already return `PlanarFace` (Task 5), so test call sites should compile

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/operations-extrude.test.ts tests/operations.test.ts --reporter=verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/operations/extrudeFns.ts
# Include any files fixed in Step 3
git commit -m "$(cat <<'EOF'
feat(types)!: require PlanarFace on extrude and revolve

BREAKING CHANGE: extrude() and revolve() now require
OrientedFace & PlanarFace instead of just OrientedFace.
Faces from face(), makeFace(), and polygon() already carry
the PlanarFace brand. Use isPlanarFace() or planarFace()
to narrow other faces.
EOF
)"
```

### Task 7: Require PlanarWire on face() (Breaking)

**Files:**

- Modify: `src/topology/primitiveFns.ts` (line 404 — `face` input type)
- Modify: `src/topology/surfaceBuilders.ts` (line 22 — `makeFace` input type)

- [ ] **Step 1: Change `face()` input to require PlanarWire**

```ts
// Before
export function face(w: ClosedWire, holes?: ClosedWire[]): Result<OrientedFace & PlanarFace> {

// After
export function face(
  w: ClosedWire & PlanarWire,
  holes?: Array<ClosedWire & PlanarWire>
): Result<OrientedFace & PlanarFace> {
```

- [ ] **Step 2: Change `makeFace()` input to require PlanarWire**

```ts
// Before
export function makeFace<D extends Dimension = '3D'>(
  wire: ClosedWire<D>,
  holes?: ClosedWire<D>[]
): Result<OrientedFace<D> & PlanarFace<D>> {

// After
export function makeFace<D extends Dimension = '3D'>(
  wire: ClosedWire<D> & PlanarWire<D>,
  holes?: Array<ClosedWire<D> & PlanarWire<D>>
): Result<OrientedFace<D> & PlanarFace<D>> {
```

Note: `makeNonPlanarFace()` and `filledFace()` do NOT change — they handle non-planar wires.

- [ ] **Step 3: Fix compilation errors**

Run: `npm run typecheck`

Internal callers passing `ClosedWire` without `PlanarWire` will break. For each:

- Sketch code: `this.wire as ClosedWire` → `this.wire as ClosedWire & PlanarWire` (sketch wires are planar by construction — sketches operate on XY plane)
- `booleanFns.ts` `sectionToFace`: `outer as ClosedWire` → `outer as ClosedWire & PlanarWire` (section results are planar by construction)
- `compoundSketch.ts`: same pattern
- `blueprint.ts`: same pattern
- `surfaceBuilders.ts` `makePolygon`: `wire as ClosedWire` → `wire as ClosedWire & PlanarWire` (polygon edges are coplanar)

- [ ] **Step 4: Run full test suite**

Run: `npm run test:full`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/topology/primitiveFns.ts src/topology/surfaceBuilders.ts
# Include any files fixed in Step 3
git commit -m "$(cat <<'EOF'
feat(types)!: require PlanarWire on face() and makeFace()

BREAKING CHANGE: face() and makeFace() now require ClosedWire &
PlanarWire instead of just ClosedWire. Use isPlanarWire() or
planarWire() to narrow. filledFace() and makeNonPlanarFace()
still accept plain ClosedWire for non-planar surfaces.
EOF
)"
```

### Task 8: Final Validation + Public API Test

**Files:**

- Modify: `tests/public-api-types.test.ts` (if it exists — add type-level assertions)

- [ ] **Step 1: Add type-level smoke test**

In `tests/public-api-types.test.ts` (or `tests/validityTypes.test.ts`), add compile-time checks:

```ts
describe('branded type composition', () => {
  it('PlanarFace is assignable to Face', () => {
    const f: PlanarFace = {} as PlanarFace;
    const _face: Face = f; // should compile
    expect(_face).toBeDefined();
  });

  it('PlanarWire is assignable to Wire', () => {
    const w: PlanarWire = {} as PlanarWire;
    const _wire: Wire = w; // should compile
    expect(_wire).toBeDefined();
  });

  it('ClosedPlanarWire composes correctly', () => {
    const w: ClosedWire & PlanarWire = {} as ClosedWire & PlanarWire;
    const _closed: ClosedWire = w; // should compile
    const _planar: PlanarWire = w; // should compile
    const _wire: Wire = w; // should compile
    expect(_closed).toBeDefined();
    expect(_planar).toBeDefined();
    expect(_wire).toBeDefined();
  });
});
```

- [ ] **Step 2: Run full validation**

Run: `npm run validate`
Expected: PASS (typecheck + lint + boundaries + format + tests)

- [ ] **Step 3: Run pre-push checks**

Run: `npm run test:full && npm run knip`
Expected: PASS (full coverage + no unused exports)

- [ ] **Step 4: Commit**

```bash
git add tests/
git commit -m "test: add type-level tests for PlanarFace/PlanarWire composition"
```

---

## Execution Notes

### Cast Policy

The ~44 existing `as BrandedType` casts are justified by construction and will remain. This plan adds ~10 more casts in internal code (sketching, compound ops) where the `PlanarWire`/`PlanarFace` invariant holds by construction. Each cast should include a comment like `// planar by construction: sketch operates on XY plane`.

### Kernel Compatibility

All runtime checks use APIs available on both kernels:

- `isValid()` — OCCT + brepkit ✅
- `surfaceType()` — OCCT + brepkit ✅
- `makeFace()` (for `isPlanarWire` temp face) — OCCT + brepkit ✅

### Migration Guide for Users

After these changes, users with existing code calling `fuse(mySolid, otherSolid)` where `mySolid` is a plain `Solid` (e.g., from STEP import) will need to:

```ts
// Before (no longer compiles)
const result = fuse(importedSolid, box(10, 10, 10));

// After — prove validity first
const valid = validSolid(importedSolid);
if (isOk(valid)) {
  const result = fuse(valid.value, box(10, 10, 10));
}

// Or use the type guard
if (isValidSolid(importedSolid)) {
  const result = fuse(importedSolid, box(10, 10, 10));
}
```

Similarly for `face()`:

```ts
// Before
const f = face(myWire);

// After — prove planarity
if (isClosedWire(myWire) && isPlanarWire(myWire)) {
  const f = face(myWire);
}
```
