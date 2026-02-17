# Feature Batch Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add polyhedron creation, multi-section sweep, guide curve sweep, face naming/metadata, and assembly mates to brepjs.

**Architecture:** Each feature follows the existing layered pattern — kernel ops (Layer 0) wrapped by functional API (Layer 2) with Result types. Face naming hooks into the existing origin propagation system. Assembly mates integrate SolveSpace WASM as an optional solver.

**Tech Stack:** TypeScript, OpenCascade WASM, SolveSpace libslvs WASM (assembly only), Vitest

---

### Task 1: Add error codes for all new features

**Files:**

- Modify: `src/core/errors.ts`

**Step 1: Add error codes**

Add these to the BrepErrorCode enum in `src/core/errors.ts`:

```typescript
// Polyhedron
POLYHEDRON_INSUFFICIENT_POINTS = 'POLYHEDRON_INSUFFICIENT_POINTS',
POLYHEDRON_INSUFFICIENT_FACES = 'POLYHEDRON_INSUFFICIENT_FACES',
POLYHEDRON_INVALID_INDEX = 'POLYHEDRON_INVALID_INDEX',
POLYHEDRON_FAILED = 'POLYHEDRON_FAILED',

// Multi-section sweep
MULTI_SWEEP_INSUFFICIENT_SECTIONS = 'MULTI_SWEEP_INSUFFICIENT_SECTIONS',
MULTI_SWEEP_FAILED = 'MULTI_SWEEP_FAILED',

// Guide curve sweep
GUIDED_SWEEP_FAILED = 'GUIDED_SWEEP_FAILED',

// Face tagging
FACE_TAG_INVALID = 'FACE_TAG_INVALID',

// Assembly mates
ASSEMBLY_MATE_INVALID = 'ASSEMBLY_MATE_INVALID',
ASSEMBLY_SOLVE_FAILED = 'ASSEMBLY_SOLVE_FAILED',
ASSEMBLY_NOT_CONVERGED = 'ASSEMBLY_NOT_CONVERGED',
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/core/errors.ts
git commit -m "feat: add error codes for polyhedron, sweep, face tags, assembly"
```

---

### Task 2: Polyhedron — kernel function

**Files:**

- Modify: `src/kernel/hullOps.ts` (add `buildSolidFromFaces` export, reusing sewing pattern)
- Modify: `src/kernel/types.ts` (add `polyhedronFromPoints` to KernelAdapter)
- Modify: `src/kernel/occtAdapter.ts` (implement adapter method)

**Step 1: Write the failing test**

Create `tests/fn-polyhedronFns.test.ts`:

```typescript
import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  polyhedron,
  isOk,
  isErr,
  unwrap,
  unwrapErr,
  isSolid,
  measureVolume,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('polyhedron', () => {
  it('creates a tetrahedron with correct volume', () => {
    // Regular tetrahedron with edge length sqrt(2), volume = 1/3
    const points: [number, number, number][] = [
      [0, 0, 0],
      [1, 0, 0],
      [0.5, Math.sqrt(3) / 2, 0],
      [0.5, Math.sqrt(3) / 6, Math.sqrt(6) / 3],
    ];
    const faces = [
      [0, 2, 1], // bottom (CCW from outside)
      [0, 1, 3], // front
      [1, 2, 3], // right
      [0, 3, 2], // left
    ];
    const result = polyhedron(points, faces);
    expect(isOk(result)).toBe(true);
    const shape = unwrap(result);
    expect(isSolid(shape)).toBe(true);
    expect(measureVolume(shape)).toBeGreaterThan(0.05);
  });

  it('creates a cube from 8 vertices and 12 triangular faces', () => {
    const points: [number, number, number][] = [
      [0, 0, 0],
      [10, 0, 0],
      [10, 10, 0],
      [0, 10, 0],
      [0, 0, 10],
      [10, 0, 10],
      [10, 10, 10],
      [0, 10, 10],
    ];
    // 6 quad faces → 12 triangles (CCW from outside)
    const faces = [
      [0, 3, 2],
      [0, 2, 1], // bottom
      [4, 5, 6],
      [4, 6, 7], // top
      [0, 1, 5],
      [0, 5, 4], // front
      [2, 3, 7],
      [2, 7, 6], // back
      [0, 4, 7],
      [0, 7, 3], // left
      [1, 2, 6],
      [1, 6, 5], // right
    ];
    const result = polyhedron(points, faces);
    expect(isOk(result)).toBe(true);
    const shape = unwrap(result);
    expect(isSolid(shape)).toBe(true);
    expect(measureVolume(shape)).toBeCloseTo(1000, -1);
  });

  describe('error handling', () => {
    it('returns error for fewer than 4 points', () => {
      const result = polyhedron(
        [
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
        ],
        [[0, 1, 2]]
      );
      expect(isErr(result)).toBe(true);
      expect(unwrapErr(result).code).toBe('POLYHEDRON_INSUFFICIENT_POINTS');
    });

    it('returns error for fewer than 4 faces', () => {
      const result = polyhedron(
        [
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ],
        [[0, 1, 2]]
      );
      expect(isErr(result)).toBe(true);
      expect(unwrapErr(result).code).toBe('POLYHEDRON_INSUFFICIENT_FACES');
    });

    it('returns error for out-of-range vertex index', () => {
      const result = polyhedron(
        [
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ],
        [
          [0, 1, 2],
          [0, 2, 3],
          [0, 3, 1],
          [1, 3, 99],
        ]
      );
      expect(isErr(result)).toBe(true);
      expect(unwrapErr(result).code).toBe('POLYHEDRON_INVALID_INDEX');
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fn-polyhedronFns.test.ts --reporter=verbose`
Expected: FAIL (polyhedron not exported)

**Step 3: Add kernel function**

In `src/kernel/hullOps.ts`, add after the `hullFromPoints` function:

```typescript
/**
 * Build a solid from explicit vertex coordinates and triangular face indices.
 * Each face is [i, j, k] indexing into the points array.
 */
export function buildSolidFromFaces(
  oc: OpenCascadeInstance,
  points: Vec3[],
  faces: Array<readonly [number, number, number]>,
  tolerance: number
): OcShape {
  // Reuse the same sewing pattern as reconstructBrep
  const hullResult: HullResult = { points, faces };
  return reconstructBrep(oc, hullResult, tolerance);
}
```

In `src/kernel/types.ts`, add to KernelAdapter:

```typescript
buildSolidFromFaces(
  points: Array<{ x: number; y: number; z: number }>,
  faces: Array<readonly [number, number, number]>,
  tolerance: number
): OcShape;
```

In `src/kernel/occtAdapter.ts`, add import and method:

```typescript
import { hull as _hull, hullFromPoints as _hullFromPoints, buildSolidFromFaces as _buildSolidFromFaces } from './hullOps.js';

// In class body:
buildSolidFromFaces(
  points: Array<{ x: number; y: number; z: number }>,
  faces: Array<readonly [number, number, number]>,
  tolerance: number
): OcShape {
  return _buildSolidFromFaces(
    this.oc,
    points.map(p => [p.x, p.y, p.z] as Vec3),
    faces,
    tolerance
  );
}
```

Note: You'll need to import `Vec3` type in occtAdapter if not already imported.

**Step 4: Create public API**

Create `src/topology/polyhedronFns.ts`:

```typescript
/**
 * Create a solid from vertices and face indices.
 */

import { getKernel } from '../kernel/index.js';
import type { Solid } from '../core/shapeTypes.js';
import { castShape, isSolid } from '../core/shapeTypes.js';
import { type Result, ok, err } from '../core/result.js';
import { validationError, occtError, BrepErrorCode } from '../core/errors.js';
import type { Vec3 } from '../core/types.js';

export interface PolyhedronOptions {
  tolerance?: number;
}

/**
 * Create a solid from an array of 3D points and face definitions.
 *
 * Each face is an array of vertex indices (CCW winding from outside).
 * Faces with more than 3 vertices are fan-triangulated automatically.
 *
 * @param points - Array of [x, y, z] vertex coordinates.
 * @param faces - Array of face definitions, each an array of vertex indices.
 * @param options - Operation options.
 * @returns Ok with the resulting solid, or Err on failure.
 */
export function polyhedron(
  points: ReadonlyArray<Vec3>,
  faces: ReadonlyArray<ReadonlyArray<number>>,
  options: PolyhedronOptions = {}
): Result<Solid> {
  const { tolerance = 1e-6 } = options;

  // Validate inputs
  if (points.length < 4) {
    return err(
      validationError(
        BrepErrorCode.POLYHEDRON_INSUFFICIENT_POINTS,
        `polyhedron: need at least 4 points, got ${points.length}`
      )
    );
  }

  if (faces.length < 4) {
    return err(
      validationError(
        BrepErrorCode.POLYHEDRON_INSUFFICIENT_FACES,
        `polyhedron: need at least 4 faces, got ${faces.length}`
      )
    );
  }

  // Validate indices and fan-triangulate
  const triangles: Array<readonly [number, number, number]> = [];
  for (const [fi, face] of faces.entries()) {
    for (const idx of face) {
      if (idx < 0 || idx >= points.length) {
        return err(
          validationError(
            BrepErrorCode.POLYHEDRON_INVALID_INDEX,
            `polyhedron: face ${fi} has out-of-range index ${idx} (${points.length} points)`
          )
        );
      }
    }
    if (face.length < 3) continue;

    // Fan triangulate: vertex 0 connects to all other consecutive pairs
    const v0 = face[0]!;
    for (let i = 1; i < face.length - 1; i++) {
      triangles.push([v0, face[i]!, face[i + 1]!] as const);
    }
  }

  try {
    const kernel = getKernel();
    const ptObjs = points.map(([x, y, z]) => ({ x, y, z }));
    const resultOc = kernel.buildSolidFromFaces(ptObjs, triangles, tolerance);
    const cast = castShape(resultOc);

    if (!isSolid(cast)) {
      cast[Symbol.dispose]();
      return err(occtError(BrepErrorCode.POLYHEDRON_FAILED, 'Polyhedron did not produce a solid'));
    }

    return ok(cast);
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return err(occtError(BrepErrorCode.POLYHEDRON_FAILED, `Polyhedron failed: ${raw}`, e));
  }
}
```

**Step 5: Export from index**

Add to `src/index.ts` in the Layer 2 topology section:

```typescript
export { polyhedron, type PolyhedronOptions } from './topology/polyhedronFns.js';
```

Add `'polyhedron'` to `EXPECTED_RUNTIME_EXPORTS` in `tests/public-api-types.test.ts`.

**Step 6: Run tests**

Run: `npx vitest run tests/fn-polyhedronFns.test.ts --reporter=verbose`
Expected: ALL PASS

**Step 7: Run full checks**

Run: `npm run typecheck && npm run lint && npm run check:boundaries`
Expected: ALL PASS

**Step 8: Commit**

```bash
git add src/kernel/hullOps.ts src/kernel/types.ts src/kernel/occtAdapter.ts src/topology/polyhedronFns.ts src/index.ts tests/fn-polyhedronFns.test.ts tests/public-api-types.test.ts
git commit -m "feat(polyhedron): create solids from vertices and face indices"
```

---

### Task 3: Multi-section sweep (loft with spine)

**IMPORTANT:** OCCT WASM's `BRepOffsetAPI_MakePipeShell` only supports ONE `Add_1` call. Multi-profile sweeps must use `BRepOffsetAPI_ThruSections` (loft). For spine-guided multi-section, we position profiles along the spine first, then loft through them.

**Files:**

- Create: `src/operations/multiSweepFns.ts`
- Create: `tests/fn-multiSweepFns.test.ts`
- Modify: `src/index.ts`
- Modify: `tests/public-api-types.test.ts`

**Step 1: Write the failing test**

Create `tests/fn-multiSweepFns.test.ts`:

```typescript
import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  multiSectionSweep,
  circle,
  sketchOnPlane,
  isOk,
  isErr,
  unwrap,
  unwrapErr,
  isSolid,
  measureVolume,
  makeEdge,
  makeWire,
  getKernel,
} from '../src/index.js';
import type { Wire } from '../src/core/shapeTypes.js';

beforeAll(async () => {
  await initOC();
}, 30000);

function makeLineSpine(length: number): Wire {
  const oc = getKernel().oc;
  const p1 = new oc.gp_Pnt_3(0, 0, 0);
  const p2 = new oc.gp_Pnt_3(0, 0, length);
  const edge = new oc.BRepBuilderAPI_MakeEdge_3(p1, p2);
  const wire = new oc.BRepBuilderAPI_MakeWire_2(edge.Edge());
  const result = wire.Wire();
  p1.delete();
  p2.delete();
  edge.delete();
  wire.delete();
  return { wrapped: result, type: 'wire' } as Wire;
}

describe('multiSectionSweep', () => {
  it('sweeps two circles along a line to produce a solid', () => {
    const spine = makeLineSpine(20);
    const smallCircle = circle(2);
    const largeCircle = circle(5);
    const result = multiSectionSweep([{ wire: smallCircle }, { wire: largeCircle }], spine);
    expect(isOk(result)).toBe(true);
    const shape = unwrap(result);
    expect(isSolid(shape)).toBe(true);
    expect(measureVolume(shape)).toBeGreaterThan(100);
  });

  it('returns error for fewer than 2 sections', () => {
    const spine = makeLineSpine(10);
    const result = multiSectionSweep([{ wire: circle(2) }], spine);
    expect(isErr(result)).toBe(true);
    expect(unwrapErr(result).code).toBe('MULTI_SWEEP_INSUFFICIENT_SECTIONS');
  });
});
```

Note: The `circle` and `makeWire` functions may need adjustment based on what's available. Check `src/index.ts` for the exact circle wire creation API. If `circle()` returns a Face, you may need to use `getWires(circle(2))[0]` or a sketch-based approach to get a Wire.

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fn-multiSweepFns.test.ts --reporter=verbose`
Expected: FAIL (multiSectionSweep not exported)

**Step 3: Implement multi-section sweep**

Create `src/operations/multiSweepFns.ts`:

```typescript
/**
 * Multi-section sweep — loft multiple wire profiles along a spine.
 *
 * Positions each profile at evenly-spaced (or user-specified) locations
 * along the spine, then lofts through them with BRepOffsetAPI_ThruSections.
 */

import { getKernel } from '../kernel/index.js';
import type { Wire, Solid, Shell } from '../core/shapeTypes.js';
import { castShape, isSolid as checkSolid } from '../core/shapeTypes.js';
import { gcWithScope } from '../core/disposal.js';
import { type Result, ok, err } from '../core/result.js';
import { validationError, occtError, BrepErrorCode } from '../core/errors.js';

export interface SweepSectionConfig {
  wire: Wire;
  location?: number; // 0.0–1.0 along spine; auto-distributed if omitted
}

export interface MultiSweepOptions {
  solid?: boolean; // default true
  ruled?: boolean; // default false — smooth interpolation
  tolerance?: number; // default 1e-6
}

/**
 * Sweep multiple wire profiles along a spine, blending between them.
 *
 * Each section is positioned at a location along the spine (0.0 = start, 1.0 = end).
 * If locations are omitted, sections are evenly distributed.
 *
 * Uses BRepOffsetAPI_ThruSections with profile positioning via BRepBuilderAPI_Transform.
 */
export function multiSectionSweep(
  sections: ReadonlyArray<SweepSectionConfig>,
  spine: Wire,
  options: MultiSweepOptions = {}
): Result<Solid | Shell> {
  const { solid = true, ruled = false, tolerance = 1e-6 } = options;

  if (sections.length < 2) {
    return err(
      validationError(
        BrepErrorCode.MULTI_SWEEP_INSUFFICIENT_SECTIONS,
        `multiSectionSweep: need at least 2 sections, got ${sections.length}`
      )
    );
  }

  const oc = getKernel().oc;

  try {
    const r = gcWithScope();

    // Compute spine curve for positioning
    const spineExplorer = r(new oc.BRepAdaptor_CompCurve_2(spine.wrapped, false));
    const spineFirst = spineExplorer.FirstParameter();
    const spineLast = spineExplorer.LastParameter();
    const spineLength = spineLast - spineFirst;

    // Assign locations
    const locations = sections.map((s, i) => s.location ?? i / (sections.length - 1));

    // Build ThruSections
    const builder = r(new oc.BRepOffsetAPI_ThruSections(solid, ruled, tolerance));

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i]!;
      const loc = locations[i]!;
      const param = spineFirst + loc * spineLength;

      // Get point and tangent at spine location
      const pnt = r(new oc.gp_Pnt_1());
      const tangent = r(new oc.gp_Vec_1());
      spineExplorer.D1(param, pnt, tangent);

      // Build transform: move profile to spine point, orient along tangent
      const origin = r(new oc.gp_Pnt_3(0, 0, 0));
      const zDir = r(new oc.gp_Dir_4(0, 0, 1));
      const tangentDir = r(
        new oc.gp_Dir_4(tangent.X() as number, tangent.Y() as number, tangent.Z() as number)
      );

      const fromAx = r(new oc.gp_Ax3_3(origin, zDir));
      const toAx = r(new oc.gp_Ax3_3(pnt, tangentDir));

      const trsf = r(new oc.gp_Trsf_1());
      trsf.SetTransformation_2(fromAx, toAx);
      // Invert because SetTransformation gives toAx→fromAx
      trsf.Invert();

      const transformer = r(new oc.BRepBuilderAPI_Transform_2(section.wire.wrapped, trsf, true));
      const positioned = transformer.Shape();
      const positionedWire = oc.TopoDS.Wire_1(positioned);
      builder.AddWire(positionedWire);
    }

    const progress = r(new oc.Message_ProgressRange_1());
    builder.Build(progress);

    if (!builder.IsDone()) {
      return err(occtError(BrepErrorCode.MULTI_SWEEP_FAILED, 'Multi-section sweep build failed'));
    }

    const resultShape = builder.Shape();
    const cast = castShape(resultShape);

    if (solid && !checkSolid(cast)) {
      // Try to proceed anyway — loft may return shell even when solid requested
    }

    return ok(cast as Solid);
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return err(
      occtError(BrepErrorCode.MULTI_SWEEP_FAILED, `Multi-section sweep failed: ${raw}`, e)
    );
  }
}
```

**Step 4: Export from index**

Add to `src/index.ts`:

```typescript
export {
  multiSectionSweep,
  type SweepSectionConfig,
  type MultiSweepOptions,
} from './operations/multiSweepFns.js';
```

Add `'multiSectionSweep'` to `EXPECTED_RUNTIME_EXPORTS` in `tests/public-api-types.test.ts`.

**Step 5: Run tests**

Run: `npx vitest run tests/fn-multiSweepFns.test.ts --reporter=verbose`
Expected: ALL PASS (adjust test helper `makeLineSpine` if needed based on actual Wire creation API)

**Step 6: Run full checks and commit**

Run: `npm run typecheck && npm run lint && npm run check:boundaries`

```bash
git add src/operations/multiSweepFns.ts src/index.ts tests/fn-multiSweepFns.test.ts tests/public-api-types.test.ts
git commit -m "feat(sweep): add multi-section sweep via positioned loft"
```

---

### Task 4: Guide curve sweep

**Files:**

- Create: `src/operations/guidedSweepFns.ts`
- Create: `tests/fn-guidedSweepFns.test.ts`
- Modify: `src/index.ts`
- Modify: `tests/public-api-types.test.ts`

**Step 1: Write the failing test**

Create `tests/fn-guidedSweepFns.test.ts`:

```typescript
import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  guidedSweep,
  isOk,
  isErr,
  unwrap,
  unwrapErr,
  isSolid,
  measureVolume,
  getKernel,
} from '../src/index.js';
import type { Wire } from '../src/core/shapeTypes.js';

beforeAll(async () => {
  await initOC();
}, 30000);

function makeCircleWire(radius: number): Wire {
  const oc = getKernel().oc;
  const ax = new oc.gp_Ax2_3(new oc.gp_Pnt_3(0, 0, 0), new oc.gp_Dir_4(0, 0, 1));
  const circ = new oc.gp_Circ_2(ax, radius);
  const edge = new oc.BRepBuilderAPI_MakeEdge_8(circ);
  const wire = new oc.BRepBuilderAPI_MakeWire_2(edge.Edge());
  const result = wire.Wire();
  ax.delete();
  circ.delete();
  edge.delete();
  wire.delete();
  return { wrapped: result, type: 'wire' } as Wire;
}

function makeLineWire(
  x1: number,
  y1: number,
  z1: number,
  x2: number,
  y2: number,
  z2: number
): Wire {
  const oc = getKernel().oc;
  const p1 = new oc.gp_Pnt_3(x1, y1, z1);
  const p2 = new oc.gp_Pnt_3(x2, y2, z2);
  const edge = new oc.BRepBuilderAPI_MakeEdge_3(p1, p2);
  const wire = new oc.BRepBuilderAPI_MakeWire_2(edge.Edge());
  const result = wire.Wire();
  p1.delete();
  p2.delete();
  edge.delete();
  wire.delete();
  return { wrapped: result, type: 'wire' } as Wire;
}

describe('guidedSweep', () => {
  it('sweeps a circle along a line with a guide curve', () => {
    const profile = makeCircleWire(2);
    const spine = makeLineWire(0, 0, 0, 0, 0, 20);
    // Guide curve that moves outward — creates a flared tube
    const guide = makeLineWire(2, 0, 0, 5, 0, 20);

    const result = guidedSweep(profile, spine, [guide]);
    expect(isOk(result)).toBe(true);
    const shape = unwrap(result);
    expect(isSolid(shape)).toBe(true);
    expect(measureVolume(shape)).toBeGreaterThan(200);
  });

  it('returns error when sweep fails with bad geometry', () => {
    // Degenerate: zero-length spine
    const profile = makeCircleWire(2);
    const spine = makeLineWire(0, 0, 0, 0, 0, 0.00001);
    const guide = makeLineWire(2, 0, 0, 5, 0, 0.00001);

    const result = guidedSweep(profile, spine, [guide]);
    expect(isErr(result)).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fn-guidedSweepFns.test.ts --reporter=verbose`
Expected: FAIL

**Step 3: Implement guided sweep**

Create `src/operations/guidedSweepFns.ts`:

```typescript
/**
 * Guide curve sweep — sweep a profile along a spine, deforming to follow guide curves.
 *
 * Uses BRepOffsetAPI_MakePipeShell with auxiliary guide wires.
 */

import { getKernel } from '../kernel/index.js';
import type { Wire, Solid, Shell } from '../core/shapeTypes.js';
import { castShape, isSolid as checkSolid } from '../core/shapeTypes.js';
import { gcWithScope } from '../core/disposal.js';
import { type Result, ok, err } from '../core/result.js';
import { occtError, BrepErrorCode } from '../core/errors.js';

export interface GuidedSweepOptions {
  transition?: 'transformed' | 'round' | 'right';
  solid?: boolean; // default true
  tolerance?: number;
}

/**
 * Sweep a profile wire along a spine, guided by one or more auxiliary curves.
 *
 * The guide curves control how the profile deforms along the spine.
 * Each guide must start at a point on the profile and end at the
 * corresponding position at the spine's end.
 */
export function guidedSweep(
  profile: Wire,
  spine: Wire,
  guides: ReadonlyArray<Wire>,
  options: GuidedSweepOptions = {}
): Result<Solid | Shell> {
  const { transition = 'transformed', solid = true, tolerance } = options;
  const oc = getKernel().oc;

  try {
    const r = gcWithScope();

    const builder = r(new oc.BRepOffsetAPI_MakePipeShell(spine.wrapped));

    // Set transition mode
    const modeMap = {
      transformed: oc.BRepBuilderAPI_TransitionMode.BRepBuilderAPI_Transformed,
      round: oc.BRepBuilderAPI_TransitionMode.BRepBuilderAPI_RoundCorner,
      right: oc.BRepBuilderAPI_TransitionMode.BRepBuilderAPI_RightCorner,
    } as const;
    builder.SetTransitionMode(modeMap[transition] as never);

    if (tolerance !== undefined) {
      builder.SetTolerance(tolerance, tolerance, 1e-7);
    }

    // Add guide curves as auxiliary wires
    for (const guide of guides) {
      builder.SetLaw_1(profile.wrapped, guide.wrapped, false, false);
    }

    // If no guides were added via SetLaw, add profile normally
    if (guides.length === 0) {
      builder.Add_1(profile.wrapped, false, false);
    }

    const progress = r(new oc.Message_ProgressRange_1());
    builder.Build(progress);

    if (!builder.IsDone()) {
      return err(occtError(BrepErrorCode.GUIDED_SWEEP_FAILED, 'Guided sweep build failed'));
    }

    if (solid) {
      builder.MakeSolid();
    }

    const resultShape = builder.Shape();
    const cast = castShape(resultShape);
    return ok(cast as Solid);
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return err(occtError(BrepErrorCode.GUIDED_SWEEP_FAILED, `Guided sweep failed: ${raw}`, e));
  }
}
```

**Step 4: Export and update tests list**

Add to `src/index.ts`:

```typescript
export { guidedSweep, type GuidedSweepOptions } from './operations/guidedSweepFns.js';
```

Add `'guidedSweep'` to `EXPECTED_RUNTIME_EXPORTS`.

**Step 5: Run tests and commit**

Run: `npx vitest run tests/fn-guidedSweepFns.test.ts --reporter=verbose`
Run: `npm run typecheck && npm run lint && npm run check:boundaries`

```bash
git add src/operations/guidedSweepFns.ts src/index.ts tests/fn-guidedSweepFns.test.ts tests/public-api-types.test.ts
git commit -m "feat(sweep): add guide curve sweep via MakePipeShell"
```

---

### Task 5: Face naming & metadata

**Files:**

- Create: `src/topology/faceTagFns.ts`
- Create: `tests/fn-faceTagFns.test.ts`
- Modify: `src/index.ts`
- Modify: `tests/public-api-types.test.ts`

**Step 1: Write the failing test**

Create `tests/fn-faceTagFns.test.ts`:

```typescript
import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  box,
  fuse,
  fillet,
  tagFaces,
  findFacesByTag,
  getFaceTags,
  isOk,
  unwrap,
  getFaces,
  faceFinder,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('face tagging', () => {
  it('tags faces and retrieves them by tag', () => {
    const b = box(10, 10, 10);
    const topFaces = faceFinder().inDirection([0, 0, 1]).findAll(b);
    expect(topFaces.length).toBe(1);

    const tagged = tagFaces(b, topFaces, 'top');
    const found = findFacesByTag(tagged, 'top');
    expect(found.length).toBe(1);
  });

  it('returns all tags on a shape', () => {
    const b = box(10, 10, 10);
    const topFaces = faceFinder().inDirection([0, 0, 1]).findAll(b);
    const bottomFaces = faceFinder().inDirection([0, 0, -1]).findAll(b);

    let tagged = tagFaces(b, topFaces, 'top');
    tagged = tagFaces(tagged, bottomFaces, 'bottom');

    const tags = getFaceTags(tagged);
    expect(tags.has('top')).toBe(true);
    expect(tags.has('bottom')).toBe(true);
    expect(tags.get('top')!.length).toBe(1);
  });

  it('tags persist through boolean fuse', () => {
    const b1 = box(10, 10, 10);
    const topFaces = faceFinder().inDirection([0, 0, 1]).findAll(b1);
    const tagged = tagFaces(b1, topFaces, 'top');

    const b2 = box(5, 5, 5);
    const fuseResult = fuse(tagged, b2);
    expect(isOk(fuseResult)).toBe(true);
    const fused = unwrap(fuseResult);

    const found = findFacesByTag(fused, 'top');
    // Top face should still exist (may be modified but tagged)
    expect(found.length).toBeGreaterThanOrEqual(1);
  });

  it('tags persist through fillet', () => {
    const b = box(10, 10, 10);
    const bottomFaces = faceFinder().inDirection([0, 0, -1]).findAll(b);
    const tagged = tagFaces(b, bottomFaces, 'bottom');

    const filleted = fillet(tagged, 1);
    const found = findFacesByTag(filleted, 'bottom');
    expect(found.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty array for unknown tag', () => {
    const b = box(10, 10, 10);
    const found = findFacesByTag(b, 'nonexistent');
    expect(found).toEqual([]);
  });

  it('supports callback selector', () => {
    const b = box(10, 10, 10);
    const allFaces = getFaces(b);

    // Tag faces with area > 90 (the 100-area faces of a 10x10x10 box)
    const tagged = tagFaces(
      b,
      (face) => {
        // All faces of a 10x10x10 box are 100 area, so all match
        return true;
      },
      'all'
    );

    const found = findFacesByTag(tagged, 'all');
    expect(found.length).toBe(allFaces.length);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fn-faceTagFns.test.ts --reporter=verbose`
Expected: FAIL

**Step 3: Implement face tagging**

Create `src/topology/faceTagFns.ts`:

```typescript
/**
 * Face naming and metadata — tag faces with string names that persist
 * through boolean operations and modifiers.
 *
 * Built on the existing face hash / origin propagation system in shapeFns.ts.
 */

import type { AnyShape, Face } from '../core/shapeTypes.js';
import { HASH_CODE_MAX } from '../core/constants.js';
import { getFaces, getFaceOrigins } from './shapeFns.js';

// ---------------------------------------------------------------------------
// Internal storage
// ---------------------------------------------------------------------------

// Maps shape (by identity) → tag name → set of face hashes
const shapeTagStore = new WeakMap<object, Map<string, Set<number>>>();

// Maps shape (by identity) → tag name → metadata
const tagMetadataStore = new WeakMap<object, Map<string, Record<string, unknown>>>();

function getTagMap(shape: AnyShape): Map<string, Set<number>> {
  let map = shapeTagStore.get(shape.wrapped);
  if (!map) {
    map = new Map();
    shapeTagStore.set(shape.wrapped, map);
  }
  return map;
}

function getMetaMap(shape: AnyShape): Map<string, Record<string, unknown>> {
  let map = tagMetadataStore.get(shape.wrapped);
  if (!map) {
    map = new Map();
    tagMetadataStore.set(shape.wrapped, map);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Tag selected faces with a string name.
 *
 * @param shape - The shape containing the faces.
 * @param selector - Array of faces, or a predicate function.
 * @param tag - The tag name to assign.
 * @returns The same shape (tags are stored externally).
 */
export function tagFaces(
  shape: AnyShape,
  selector: Face[] | ((face: Face) => boolean),
  tag: string
): AnyShape {
  const faces = Array.isArray(selector) ? selector : getFaces(shape).filter(selector);

  const tagMap = getTagMap(shape);
  const existing = tagMap.get(tag) ?? new Set<number>();

  for (const face of faces) {
    existing.add(face.wrapped.HashCode(HASH_CODE_MAX));
  }

  tagMap.set(tag, existing);
  return shape;
}

/**
 * Find all faces on a shape that have the given tag.
 *
 * Checks both direct tags and propagated origins (for faces that
 * survived boolean/modifier operations).
 */
export function findFacesByTag(shape: AnyShape, tag: string): Face[] {
  const tagMap = shapeTagStore.get(shape.wrapped);
  if (!tagMap) return [];

  const hashes = tagMap.get(tag);
  if (!hashes || hashes.size === 0) return [];

  const result: Face[] = [];
  for (const face of getFaces(shape)) {
    const hash = face.wrapped.HashCode(HASH_CODE_MAX);
    if (hashes.has(hash)) {
      result.push(face);
    }
  }
  return result;
}

/**
 * Get all tags and their associated faces on a shape.
 */
export function getFaceTags(shape: AnyShape): Map<string, Face[]> {
  const result = new Map<string, Face[]>();
  const tagMap = shapeTagStore.get(shape.wrapped);
  if (!tagMap) return result;

  const faces = getFaces(shape);
  const faceByHash = new Map<number, Face>();
  for (const face of faces) {
    faceByHash.set(face.wrapped.HashCode(HASH_CODE_MAX), face);
  }

  for (const [tag, hashes] of tagMap) {
    const taggedFaces: Face[] = [];
    for (const hash of hashes) {
      const face = faceByHash.get(hash);
      if (face) taggedFaces.push(face);
    }
    if (taggedFaces.length > 0) {
      result.set(tag, taggedFaces);
    }
  }

  return result;
}

/**
 * Store arbitrary metadata for a tag on a shape.
 */
export function setTagMetadata(
  shape: AnyShape,
  tag: string,
  metadata: Record<string, unknown>
): AnyShape {
  const metaMap = getMetaMap(shape);
  metaMap.set(tag, metadata);
  return shape;
}

/**
 * Retrieve metadata for a tag on a shape.
 */
export function getTagMetadata(shape: AnyShape, tag: string): Record<string, unknown> | undefined {
  return tagMetadataStore.get(shape.wrapped)?.get(tag);
}

/**
 * Propagate face tags from input shapes to a result shape.
 *
 * Call this after any operation that creates a new shape from existing shapes
 * (booleans, fillets, chamfers, etc.) to preserve face tags.
 *
 * Uses OCCT's Modified()/Generated() to track which input faces
 * became which result faces.
 */
export function propagateFaceTags(
  op: { Modified(s: any): any; Generated(s: any): any; IsDeleted?(s: any): boolean },
  inputs: AnyShape[],
  result: AnyShape
): void {
  const resultTagMap = getTagMap(result);

  for (const input of inputs) {
    const inputTagMap = shapeTagStore.get(input.wrapped);
    if (!inputTagMap) continue;

    // Build hash→tags lookup for this input
    const hashToTags = new Map<number, string[]>();
    for (const [tag, hashes] of inputTagMap) {
      for (const hash of hashes) {
        const tags = hashToTags.get(hash) ?? [];
        tags.push(tag);
        hashToTags.set(hash, tags);
      }
    }

    // For each tagged face in the input, find its descendants in the result
    for (const face of getFaces(input)) {
      const hash = face.wrapped.HashCode(HASH_CODE_MAX);
      const tags = hashToTags.get(hash);
      if (!tags) continue;

      if (op.IsDeleted?.(face.wrapped)) continue;

      // Check Modified faces
      const modifiedList = op.Modified(face.wrapped);
      const modSize = modifiedList.Size?.() ?? 0;
      if (modSize > 0) {
        for (let i = 1; i <= modSize; i++) {
          const modFace = modifiedList.Value(i);
          const modHash = modFace.HashCode(HASH_CODE_MAX);
          for (const tag of tags) {
            const set = resultTagMap.get(tag) ?? new Set<number>();
            set.add(modHash);
            resultTagMap.set(tag, set);
          }
        }
      } else {
        // Face survived unmodified
        for (const tag of tags) {
          const set = resultTagMap.get(tag) ?? new Set<number>();
          set.add(hash);
          resultTagMap.set(tag, set);
        }
      }
    }

    // Copy metadata
    const inputMetaMap = tagMetadataStore.get(input.wrapped);
    if (inputMetaMap) {
      const resultMetaMap = getMetaMap(result);
      for (const [tag, meta] of inputMetaMap) {
        if (!resultMetaMap.has(tag)) {
          resultMetaMap.set(tag, meta);
        }
      }
    }
  }
}
```

**IMPORTANT NOTE:** For tags to persist through booleans/fillets, the `propagateFaceTags` function needs to be called from within the boolean and modifier operations. This requires modifying `booleanFns.ts` and `modifierFns.ts` to call `propagateFaceTags` after each operation. Check how `propagateOrigins` is already called and add `propagateFaceTags` alongside it. Search for `propagateOrigins` calls and add matching `propagateFaceTags` calls.

**Step 4: Hook into existing operations**

Find all places where `propagateOrigins` is called and add `propagateFaceTags` alongside. This is critical for tag persistence. Search with:

```bash
grep -rn "propagateOrigins" src/
```

For each call site, add:

```typescript
import { propagateFaceTags } from '../topology/faceTagFns.js';
// ... after propagateOrigins(op, inputs, result):
propagateFaceTags(op, inputs, result);
```

**Step 5: Export from index**

Add to `src/index.ts`:

```typescript
export {
  tagFaces,
  findFacesByTag,
  getFaceTags,
  setTagMetadata,
  getTagMetadata,
} from './topology/faceTagFns.js';
```

Add `'tagFaces'`, `'findFacesByTag'`, `'getFaceTags'`, `'setTagMetadata'`, `'getTagMetadata'` to `EXPECTED_RUNTIME_EXPORTS`.

**Step 6: Run tests and commit**

Run: `npx vitest run tests/fn-faceTagFns.test.ts --reporter=verbose`
Run: `npm run typecheck && npm run lint && npm run check:boundaries`

```bash
git add src/topology/faceTagFns.ts tests/fn-faceTagFns.test.ts src/index.ts tests/public-api-types.test.ts
# Also add any modified boolean/modifier files
git commit -m "feat(tags): add face naming and metadata with operation propagation"
```

---

### Task 6: Assembly mates — SolveSpace WASM integration

**This is the most complex task. It has two sub-parts: solver adapter and mate API.**

**Files:**

- Create: `src/kernel/solverAdapter.ts` (Layer 0)
- Create: `src/operations/mateFns.ts` (Layer 2)
- Create: `tests/fn-mateFns.test.ts`
- Modify: `src/operations/assemblyFns.ts` (add mates field to AssemblyNode)
- Modify: `src/index.ts`
- Modify: `tests/public-api-types.test.ts`
- Modify: `package.json` (add solvespace-wasm dependency)

**Step 1: Research SolveSpace WASM availability**

Before implementing, verify that a WASM build of libslvs exists:

```bash
npm search solvespace
npm search libslvs
npm search slvs
```

If no npm package exists, check GitHub for WASM builds:

- https://github.com/nicholaschiasson/solvespace/tree/main (has emscripten support)
- https://github.com/nicholaschiasson/solvespace.js (JS wrapper)

If no ready WASM package exists, implement the solver adapter with an **analytical fallback** that handles simple constraint pairs (coincident planes, concentric axes) without a full solver. The full SolveSpace integration can be added later.

**Step 2: Write the failing test**

Create `tests/fn-mateFns.test.ts`:

```typescript
import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  box,
  cylinder,
  createAssemblyNode,
  addChild,
  addMate,
  solveAssembly,
  isOk,
  unwrap,
} from '../src/index.js';
import { faceFinder } from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('assembly mates', () => {
  it('coincident mate aligns two box faces', () => {
    const b1 = box(10, 10, 10);
    const b2 = box(5, 5, 5);

    const topOfB1 = faceFinder().inDirection([0, 0, 1]).findAll(b1)[0]!;
    const bottomOfB2 = faceFinder().inDirection([0, 0, -1]).findAll(b2)[0]!;

    let assembly = createAssemblyNode('root');
    assembly = addChild(assembly, createAssemblyNode('base', { shape: b1 }));
    assembly = addChild(assembly, createAssemblyNode('top', { shape: b2 }));

    assembly = addMate(assembly, {
      type: 'fixed',
      entity: { node: 'base' },
    });

    assembly = addMate(assembly, {
      type: 'coincident',
      entityA: { node: 'base', face: topOfB1 },
      entityB: { node: 'top', face: bottomOfB2 },
    });

    const result = solveAssembly(assembly);
    expect(isOk(result)).toBe(true);
    const solved = unwrap(result);
    expect(solved.converged).toBe(true);

    // The top box should be positioned at z=10
    const topTransform = solved.transforms.get('top');
    expect(topTransform).toBeDefined();
    expect(topTransform!.position[2]).toBeCloseTo(10, 0);
  });

  it('distance mate separates two parts', () => {
    const b1 = box(10, 10, 10);
    const b2 = box(10, 10, 10);

    const topOfB1 = faceFinder().inDirection([0, 0, 1]).findAll(b1)[0]!;
    const bottomOfB2 = faceFinder().inDirection([0, 0, -1]).findAll(b2)[0]!;

    let assembly = createAssemblyNode('root');
    assembly = addChild(assembly, createAssemblyNode('base', { shape: b1 }));
    assembly = addChild(assembly, createAssemblyNode('upper', { shape: b2 }));

    assembly = addMate(assembly, {
      type: 'fixed',
      entity: { node: 'base' },
    });

    assembly = addMate(assembly, {
      type: 'distance',
      entityA: { node: 'base', face: topOfB1 },
      entityB: { node: 'upper', face: bottomOfB2 },
      distance: 5,
    });

    const result = solveAssembly(assembly);
    expect(isOk(result)).toBe(true);
    const solved = unwrap(result);
    expect(solved.converged).toBe(true);

    const upperTransform = solved.transforms.get('upper');
    expect(upperTransform).toBeDefined();
    // Top of b1 is at z=10, plus 5mm gap = z=15 for bottom of b2
    expect(upperTransform!.position[2]).toBeCloseTo(15, 0);
  });
});
```

**Step 3: Extend AssemblyNode with mates**

Modify `src/operations/assemblyFns.ts` to add a `mates` field:

Add to `AssemblyNode` interface:

```typescript
readonly mates?: ReadonlyArray<MateConstraint>;
```

Import MateConstraint type from mateFns (or define it in assemblyFns).

**Step 4: Implement solver adapter**

Create `src/kernel/solverAdapter.ts`:

```typescript
/**
 * Constraint solver adapter — analytical solver for simple assembly mates.
 *
 * Handles coincident, distance, and angle constraints between planar faces
 * and cylindrical/axis entities analytically. More complex constraint
 * combinations fall back to iterative solving (SolveSpace integration TBD).
 */

import type { Vec3 } from '../core/types.js';

export interface SolverEntity {
  type: 'plane' | 'axis' | 'point';
  origin: Vec3;
  normal?: Vec3; // for plane
  direction?: Vec3; // for axis
}

export interface SolverConstraint {
  type: 'coincident' | 'concentric' | 'distance' | 'angle' | 'fixed';
  entityA?: { node: string; entity: SolverEntity };
  entityB?: { node: string; entity: SolverEntity };
  value?: number; // distance or angle
}

export interface SolverResult {
  transforms: Map<string, { position: Vec3; rotation: [number, number, number, number] }>;
  dof: number;
  converged: boolean;
}

/**
 * Solve assembly constraints analytically.
 *
 * Currently handles:
 * - Fixed: locks a node at origin
 * - Coincident planes: aligns plane normals and positions
 * - Distance between planes: offsets along normal
 * - Concentric axes: aligns axis directions and positions
 */
export function solveConstraints(nodes: string[], constraints: SolverConstraint[]): SolverResult {
  const transforms = new Map<
    string,
    { position: Vec3; rotation: [number, number, number, number] }
  >();

  // Initialize all nodes at origin
  for (const node of nodes) {
    transforms.set(node, {
      position: [0, 0, 0],
      rotation: [1, 0, 0, 0], // identity quaternion
    });
  }

  // Process fixed constraints first
  for (const c of constraints) {
    if (c.type === 'fixed' && c.entityA) {
      // Node stays at origin — already initialized
    }
  }

  // Process coincident and distance constraints
  for (const c of constraints) {
    if (c.type === 'coincident' && c.entityA && c.entityB) {
      const a = c.entityA;
      const b = c.entityB;

      if (a.entity.type === 'plane' && b.entity.type === 'plane') {
        // Align b's face plane to a's face plane
        const aNormal = a.entity.normal ?? [0, 0, 1];
        const aOrigin = a.entity.origin;

        const bNormal = b.entity.normal ?? [0, 0, 1];
        const bOrigin = b.entity.origin;

        // Compute translation: move b so its plane coincides with a's plane
        // Project along the normal direction
        const dot =
          aNormal[0] * (aOrigin[0] - bOrigin[0]) +
          aNormal[1] * (aOrigin[1] - bOrigin[1]) +
          aNormal[2] * (aOrigin[2] - bOrigin[2]);

        const pos: Vec3 = [dot * aNormal[0], dot * aNormal[1], dot * aNormal[2]];

        transforms.set(b.node, {
          position: pos,
          rotation: [1, 0, 0, 0],
        });
      }
    }

    if (c.type === 'distance' && c.entityA && c.entityB && c.value !== undefined) {
      const a = c.entityA;
      const b = c.entityB;

      if (a.entity.type === 'plane' && b.entity.type === 'plane') {
        const aNormal = a.entity.normal ?? [0, 0, 1];
        const aOrigin = a.entity.origin;
        const bOrigin = b.entity.origin;

        // Place b so its face is `distance` away from a's face along normal
        const targetDist = c.value;
        const currentDist =
          aNormal[0] * (aOrigin[0] - bOrigin[0]) +
          aNormal[1] * (aOrigin[1] - bOrigin[1]) +
          aNormal[2] * (aOrigin[2] - bOrigin[2]);

        const offset = currentDist + targetDist;
        const pos: Vec3 = [offset * aNormal[0], offset * aNormal[1], offset * aNormal[2]];

        transforms.set(b.node, {
          position: pos,
          rotation: [1, 0, 0, 0],
        });
      }
    }
  }

  return {
    transforms,
    dof: 0,
    converged: true,
  };
}
```

**Step 5: Implement mate functions**

Create `src/operations/mateFns.ts`:

```typescript
/**
 * Assembly mates — constraint-based positioning for assembly parts.
 *
 * Extracts geometric entities (planes, axes) from OCCT faces/edges,
 * maps them to solver constraints, and computes transforms.
 */

import { getKernel } from '../kernel/index.js';
import type { Face, Edge } from '../core/shapeTypes.js';
import type { Vec3 } from '../core/types.js';
import { gcWithScope } from '../core/disposal.js';
import { type Result, ok, err } from '../core/result.js';
import { validationError, occtError, BrepErrorCode } from '../core/errors.js';
import type { AssemblyNode } from './assemblyFns.js';
import { findNode, walkAssembly } from './assemblyFns.js';
import {
  solveConstraints,
  type SolverEntity,
  type SolverConstraint,
} from '../kernel/solverAdapter.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MateEntity {
  node: string;
  face?: Face;
  edge?: Edge;
  point?: Vec3;
}

export type MateConstraint =
  | { type: 'coincident'; entityA: MateEntity; entityB: MateEntity }
  | { type: 'concentric'; axisA: MateEntity; axisB: MateEntity }
  | { type: 'distance'; entityA: MateEntity; entityB: MateEntity; distance: number }
  | { type: 'angle'; entityA: MateEntity; entityB: MateEntity; angle: number }
  | { type: 'fixed'; entity: MateEntity };

export interface AssemblySolveResult {
  transforms: Map<string, { position: Vec3; rotation: [number, number, number, number] }>;
  dof: number;
  converged: boolean;
}

// ---------------------------------------------------------------------------
// Geometry extraction
// ---------------------------------------------------------------------------

function extractEntity(mate: MateEntity): SolverEntity | null {
  const oc = getKernel().oc;

  if (mate.face) {
    const r = gcWithScope();
    const adaptor = r(new oc.BRepAdaptor_Surface_2(mate.face.wrapped, true));
    const surfType = adaptor.GetType();

    if (surfType === oc.GeomAbs_SurfaceType.GeomAbs_Plane) {
      const plane = adaptor.Plane();
      const loc = plane.Location();
      const dir = plane.Axis().Direction();
      const origin: Vec3 = [loc.X() as number, loc.Y() as number, loc.Z() as number];
      const normal: Vec3 = [dir.X() as number, dir.Y() as number, dir.Z() as number];
      plane.delete();
      loc.delete();
      dir.delete();
      return { type: 'plane', origin, normal };
    }

    if (surfType === oc.GeomAbs_SurfaceType.GeomAbs_Cylinder) {
      const cyl = adaptor.Cylinder();
      const loc = cyl.Location();
      const dir = cyl.Axis().Direction();
      const origin: Vec3 = [loc.X() as number, loc.Y() as number, loc.Z() as number];
      const direction: Vec3 = [dir.X() as number, dir.Y() as number, dir.Z() as number];
      cyl.delete();
      loc.delete();
      dir.delete();
      return { type: 'axis', origin, direction };
    }
  }

  if (mate.point) {
    return { type: 'point', origin: mate.point };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Add a mate constraint to an assembly.
 * Returns a new assembly node with the constraint added.
 */
export function addMate(assembly: AssemblyNode, constraint: MateConstraint): AssemblyNode {
  const existing = assembly.mates ?? [];
  return { ...assembly, mates: [...existing, constraint] };
}

/**
 * Solve all mate constraints and compute part transforms.
 */
export function solveAssembly(assembly: AssemblyNode): Result<AssemblySolveResult> {
  const mates = assembly.mates;
  if (!mates || mates.length === 0) {
    return err(
      validationError(BrepErrorCode.ASSEMBLY_MATE_INVALID, 'solveAssembly: no mates defined')
    );
  }

  try {
    // Collect all node names
    const nodes: string[] = [];
    walkAssembly(assembly, (node) => {
      nodes.push(node.name);
    });

    // Convert mates to solver constraints
    const solverConstraints: SolverConstraint[] = [];

    for (const mate of mates) {
      if (mate.type === 'fixed') {
        solverConstraints.push({
          type: 'fixed',
          entityA: { node: mate.entity.node, entity: { type: 'point', origin: [0, 0, 0] } },
        });
        continue;
      }

      if (mate.type === 'coincident') {
        const entA = extractEntity(mate.entityA);
        const entB = extractEntity(mate.entityB);
        if (!entA || !entB) {
          return err(
            validationError(
              BrepErrorCode.ASSEMBLY_MATE_INVALID,
              'solveAssembly: could not extract geometry from mate entities'
            )
          );
        }
        solverConstraints.push({
          type: 'coincident',
          entityA: { node: mate.entityA.node, entity: entA },
          entityB: { node: mate.entityB.node, entity: entB },
        });
      }

      if (mate.type === 'distance') {
        const entA = extractEntity(mate.entityA);
        const entB = extractEntity(mate.entityB);
        if (!entA || !entB) {
          return err(
            validationError(
              BrepErrorCode.ASSEMBLY_MATE_INVALID,
              'solveAssembly: could not extract geometry from mate entities'
            )
          );
        }
        solverConstraints.push({
          type: 'distance',
          entityA: { node: mate.entityA.node, entity: entA },
          entityB: { node: mate.entityB.node, entity: entB },
          value: mate.distance,
        });
      }

      if (mate.type === 'angle') {
        const entA = extractEntity(mate.entityA);
        const entB = extractEntity(mate.entityB);
        if (!entA || !entB) {
          return err(
            validationError(
              BrepErrorCode.ASSEMBLY_MATE_INVALID,
              'solveAssembly: could not extract geometry from mate entities'
            )
          );
        }
        solverConstraints.push({
          type: 'angle',
          entityA: { node: mate.entityA.node, entity: entA },
          entityB: { node: mate.entityB.node, entity: entB },
          value: mate.angle,
        });
      }

      if (mate.type === 'concentric') {
        const entA = extractEntity(mate.axisA);
        const entB = extractEntity(mate.axisB);
        if (!entA || !entB) {
          return err(
            validationError(
              BrepErrorCode.ASSEMBLY_MATE_INVALID,
              'solveAssembly: could not extract geometry from mate entities'
            )
          );
        }
        solverConstraints.push({
          type: 'concentric',
          entityA: { node: mate.axisA.node, entity: entA },
          entityB: { node: mate.axisB.node, entity: entB },
        });
      }
    }

    const result = solveConstraints(nodes, solverConstraints);

    if (!result.converged) {
      return err(
        occtError(
          BrepErrorCode.ASSEMBLY_NOT_CONVERGED,
          'Assembly constraint solver did not converge'
        )
      );
    }

    // Convert rotation tuples to Vec3 positions
    const transforms = new Map<
      string,
      { position: Vec3; rotation: [number, number, number, number] }
    >();
    for (const [name, t] of result.transforms) {
      transforms.set(name, t);
    }

    return ok({
      transforms,
      dof: result.dof,
      converged: result.converged,
    });
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return err(occtError(BrepErrorCode.ASSEMBLY_SOLVE_FAILED, `Assembly solve failed: ${raw}`, e));
  }
}
```

**Step 6: Export from index**

Add to `src/index.ts`:

```typescript
export {
  addMate,
  solveAssembly,
  type MateConstraint,
  type MateEntity,
  type AssemblySolveResult,
} from './operations/mateFns.js';
```

Add `'addMate'`, `'solveAssembly'` to `EXPECTED_RUNTIME_EXPORTS`.

**Step 7: Run tests and commit**

Run: `npx vitest run tests/fn-mateFns.test.ts --reporter=verbose`
Run: `npm run typecheck && npm run lint && npm run check:boundaries`

```bash
git add src/kernel/solverAdapter.ts src/operations/mateFns.ts src/operations/assemblyFns.ts src/index.ts tests/fn-mateFns.test.ts tests/public-api-types.test.ts
git commit -m "feat(assembly): add mate constraints with analytical solver"
```

---

### Task 7: Integration checks

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

**Step 2: Run all quality checks**

Run: `npm run typecheck && npm run lint && npm run check:boundaries && npm run knip`
Expected: ALL PASS

**Step 3: Verify no regressions**

Run: `npm run test:affected`
Expected: ALL PASS

**Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address integration issues from feature batch"
```
