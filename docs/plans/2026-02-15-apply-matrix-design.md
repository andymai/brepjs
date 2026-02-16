# applyMatrix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `applyMatrix()` — a 4x4 affine transform function (OpenSCAD `multmatrix` equivalent) that supports non-uniform scale, shear, and all orthogonal transforms.

**Architecture:** Dual-path approach: parse 4x4 matrix into 3x3 linear + translation, detect orthogonality. Orthogonal matrices use the fast `gp_Trsf` + `BRepBuilderAPI_Transform` path. Non-orthogonal matrices use `gp_GTrsf` + `BRepBuilderAPI_GTransform` (general affine). Types in Layer 0, kernel ops in Layer 0, shape functions in Layer 2, public API in Layer 2.

**Tech Stack:** OpenCascade WASM (`gp_Trsf`, `gp_GTrsf`, `BRepBuilderAPI_Transform`, `BRepBuilderAPI_GTransform`), TypeScript, Vitest.

---

### Task 1: Add BRepBuilderAPI_GTransform to WASM build configs

This is a prerequisite — the WASM module must expose the general transform class.

**Files:**
- Modify: `packages/brepjs-opencascade/build-config/custom_build_single.yml:185`
- Modify: `packages/brepjs-opencascade/build-config/custom_build_threaded.yml:185`
- Modify: `packages/brepjs-opencascade/build-config/custom_build_with_exceptions.yml:185`

**Step 1: Add symbol to all three build configs**

In each file, find the line `- symbol: BRepBuilderAPI_Transform` (line 185) and add `BRepBuilderAPI_GTransform` immediately after:

```yaml
  - symbol: BRepBuilderAPI_Transform
  - symbol: BRepBuilderAPI_GTransform
```

**Step 2: Commit**

```bash
git add packages/brepjs-opencascade/build-config/
git commit -m "chore: add BRepBuilderAPI_GTransform to WASM build configs"
```

> **Note:** The WASM binary must be rebuilt separately (`npm run build` in the opencascade package). Tests for the general transform path won't work until the binary is rebuilt. We can still implement and test the orthogonal fast-path immediately. This task only updates the config files — the actual rebuild is a separate manual step.

---

### Task 2: Add Matrix4x4 and MatrixTransform types

**Files:**
- Modify: `src/core/types.ts` (append after `resolveDirection`)

**Step 1: Write the types**

Add to end of `src/core/types.ts`:

```ts
// ---------------------------------------------------------------------------
// Matrix types for applyMatrix (OpenSCAD multmatrix equivalent)
// ---------------------------------------------------------------------------

/** A row of a 4x4 matrix. */
type Row4 = [number, number, number, number];

/** 4x4 affine transformation matrix in row-major order. Bottom row must be [0,0,0,1]. */
export type Matrix4x4 = [Row4, Row4, Row4, Row4];

/** Structured matrix input: 3x3 linear part + translation vector. */
export interface MatrixTransform {
  /** 3x3 linear part in row-major order: [r00, r01, r02, r10, r11, r12, r20, r21, r22]. */
  readonly linear: readonly [number, number, number, number, number, number, number, number, number];
  /** Translation vector [tx, ty, tz]. */
  readonly translation: Vec3;
}

/** Input accepted by `applyMatrix`: either a raw 4x4 array or a structured object. */
export type MatrixInput = Matrix4x4 | MatrixTransform;
```

**Step 2: Export from `src/index.ts`**

Find the line `export { toVec3, toVec2, resolveDirection } from './core/types.js';` and add the matrix types to the `export type` line above it:

```ts
export type { Vec3, Vec2, PointInput, Direction as DirectionInput, Matrix4x4, MatrixTransform, MatrixInput } from './core/types.js';
```

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (types only, no implementations yet)

**Step 4: Commit**

```bash
git add src/core/types.ts src/index.ts
git commit -m "feat: add Matrix4x4 and MatrixTransform types"
```

---

### Task 3: Write tests for applyMatrix

**Files:**
- Create: `tests/fn-applyMatrix.test.ts`

**Step 1: Write the test file**

```ts
import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  box,
  translate,
  scale,
  applyMatrix,
  getBounds,
  measureVolume,
  measureArea,
  type Matrix4x4,
  type MatrixTransform,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

// ── Helpers ──

/** Identity 4x4 matrix */
const IDENTITY: Matrix4x4 = [
  [1, 0, 0, 0],
  [0, 1, 0, 0],
  [0, 0, 1, 0],
  [0, 0, 0, 1],
];

/** Builds a translation-only 4x4 matrix */
function translationMatrix(tx: number, ty: number, tz: number): Matrix4x4 {
  return [
    [1, 0, 0, tx],
    [0, 1, 0, ty],
    [0, 0, 1, tz],
    [0, 0, 0, 1],
  ];
}

/** 90-degree rotation around Z axis */
const ROTATE_Z_90: Matrix4x4 = [
  [0, -1, 0, 0],
  [1, 0, 0, 0],
  [0, 0, 1, 0],
  [0, 0, 0, 1],
];

/** Uniform scale by factor 2 */
const UNIFORM_SCALE_2: Matrix4x4 = [
  [2, 0, 0, 0],
  [0, 2, 0, 0],
  [0, 0, 2, 0],
  [0, 0, 0, 1],
];

/** Non-uniform scale: stretch X by 2, keep Y and Z */
const NONUNIFORM_SCALE: Matrix4x4 = [
  [2, 0, 0, 0],
  [0, 1, 0, 0],
  [0, 0, 1, 0],
  [0, 0, 0, 1],
];

/** Shear: X sheared by Y */
const SHEAR_XY: Matrix4x4 = [
  [1, 1, 0, 0],
  [0, 1, 0, 0],
  [0, 0, 1, 0],
  [0, 0, 0, 1],
];

// ── Orthogonal fast-path tests ──

describe('applyMatrix — orthogonal (fast path)', () => {
  it('identity matrix preserves shape bounds', () => {
    const b = box(10, 10, 10);
    const result = applyMatrix(b, IDENTITY);
    const bounds = getBounds(result);
    expect(bounds.xMin).toBeCloseTo(0, 5);
    expect(bounds.xMax).toBeCloseTo(10, 5);
    expect(bounds.yMin).toBeCloseTo(0, 5);
    expect(bounds.yMax).toBeCloseTo(10, 5);
  });

  it('pure translation matches translate()', () => {
    const b = box(10, 10, 10);
    const viaMatrix = applyMatrix(b, translationMatrix(5, 10, 15));
    const viaTranslate = translate(b, [5, 10, 15]);
    const mb = getBounds(viaMatrix);
    const tb = getBounds(viaTranslate);
    expect(mb.xMin).toBeCloseTo(tb.xMin, 5);
    expect(mb.xMax).toBeCloseTo(tb.xMax, 5);
    expect(mb.yMin).toBeCloseTo(tb.yMin, 5);
    expect(mb.yMax).toBeCloseTo(tb.yMax, 5);
    expect(mb.zMin).toBeCloseTo(tb.zMin, 5);
    expect(mb.zMax).toBeCloseTo(tb.zMax, 5);
  });

  it('90° Z rotation moves box correctly', () => {
    const b = box(10, 20, 5);
    const result = applyMatrix(b, ROTATE_Z_90);
    const bounds = getBounds(result);
    // Box [0,10]x[0,20] rotated 90° CW → [-20,0]x[0,10]
    expect(bounds.xMin).toBeCloseTo(-20, 3);
    expect(bounds.xMax).toBeCloseTo(0, 3);
    expect(bounds.yMin).toBeCloseTo(0, 3);
    expect(bounds.yMax).toBeCloseTo(10, 3);
  });

  it('uniform scale doubles dimensions and volume 8x', () => {
    const b = box(10, 10, 10);
    const result = applyMatrix(b, UNIFORM_SCALE_2);
    const bounds = getBounds(result);
    expect(bounds.xMax).toBeCloseTo(20, 3);
    expect(bounds.yMax).toBeCloseTo(20, 3);
    expect(bounds.zMax).toBeCloseTo(20, 3);
    expect(measureVolume(result)).toBeCloseTo(8000, 0);
  });

  it('uniform scale matches scale()', () => {
    const b = box(10, 10, 10);
    const viaMatrix = applyMatrix(b, UNIFORM_SCALE_2);
    const viaScale = scale(b, 2);
    expect(measureVolume(viaMatrix)).toBeCloseTo(measureVolume(viaScale), 0);
  });
});

// ── General affine tests (require BRepBuilderAPI_GTransform) ──

describe('applyMatrix — general affine (non-orthogonal)', () => {
  it('non-uniform scale stretches one axis', () => {
    const b = box(10, 10, 10);
    const result = applyMatrix(b, NONUNIFORM_SCALE);
    const bounds = getBounds(result);
    expect(bounds.xMin).toBeCloseTo(0, 3);
    expect(bounds.xMax).toBeCloseTo(20, 3);
    expect(bounds.yMax).toBeCloseTo(10, 3);
    expect(bounds.zMax).toBeCloseTo(10, 3);
    // Volume doubles (2x in X, 1x in Y, 1x in Z)
    expect(measureVolume(result)).toBeCloseTo(2000, 0);
  });

  it('shear preserves volume', () => {
    const b = box(10, 10, 10);
    const result = applyMatrix(b, SHEAR_XY);
    // Shear det = 1, so volume is preserved
    expect(measureVolume(result)).toBeCloseTo(1000, 0);
  });

  it('combined non-uniform scale + translation', () => {
    const m: Matrix4x4 = [
      [2, 0, 0, 5],
      [0, 3, 0, 10],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ];
    const b = box(10, 10, 10);
    const result = applyMatrix(b, m);
    const bounds = getBounds(result);
    expect(bounds.xMin).toBeCloseTo(5, 3);
    expect(bounds.xMax).toBeCloseTo(25, 3); // 10*2 + 5
    expect(bounds.yMin).toBeCloseTo(10, 3);
    expect(bounds.yMax).toBeCloseTo(40, 3); // 10*3 + 10
  });
});

// ── MatrixTransform input ──

describe('applyMatrix — MatrixTransform input', () => {
  it('structured input matches equivalent Matrix4x4', () => {
    const b = box(10, 10, 10);
    const m4: Matrix4x4 = [
      [2, 0, 0, 5],
      [0, 1, 0, 10],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ];
    const mt: MatrixTransform = {
      linear: [2, 0, 0, 0, 1, 0, 0, 0, 1],
      translation: [5, 10, 0],
    };
    const r1 = getBounds(applyMatrix(b, m4));
    const r2 = getBounds(applyMatrix(b, mt));
    expect(r1.xMin).toBeCloseTo(r2.xMin, 5);
    expect(r1.xMax).toBeCloseTo(r2.xMax, 5);
    expect(r1.yMin).toBeCloseTo(r2.yMin, 5);
    expect(r1.yMax).toBeCloseTo(r2.yMax, 5);
  });
});

// ── Validation ──

describe('applyMatrix — validation', () => {
  it('throws on singular matrix (zero row)', () => {
    const singular: Matrix4x4 = [
      [1, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ];
    expect(() => applyMatrix(box(10, 10, 10), singular)).toThrow(/singular/i);
  });

  it('throws on invalid bottom row', () => {
    const bad: Matrix4x4 = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 1, 1],
    ];
    expect(() => applyMatrix(box(10, 10, 10), bad)).toThrow(/bottom row/i);
  });
});

// ── Immutability ──

describe('applyMatrix — immutability', () => {
  it('does not mutate the original shape', () => {
    const b = box(10, 10, 10);
    const before = getBounds(b);
    applyMatrix(b, translationMatrix(100, 200, 300));
    const after = getBounds(b);
    expect(after.xMin).toBeCloseTo(before.xMin, 5);
    expect(after.xMax).toBeCloseTo(before.xMax, 5);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/fn-applyMatrix.test.ts`
Expected: FAIL — `applyMatrix` is not exported from `src/index.ts`

**Step 3: Commit**

```bash
git add tests/fn-applyMatrix.test.ts
git commit -m "test: add applyMatrix test suite (failing — implementation pending)"
```

---

### Task 4: Implement kernel-level generalTransform

**Files:**
- Modify: `src/kernel/transformOps.ts` (add `generalTransform` after `scale`)
- Modify: `src/kernel/types.ts` (add to `KernelAdapter` interface)
- Modify: `src/kernel/occtAdapter.ts` (add adapter method)

**Step 1: Add `generalTransform` to `src/kernel/transformOps.ts`**

Add before the `simplify` function (before line 102):

```ts
/**
 * Applies a general affine transform (3x3 linear + translation) to a shape.
 *
 * If `isOrthogonal` is true, uses the fast gp_Trsf + BRepBuilderAPI_Transform path.
 * Otherwise uses gp_GTrsf + BRepBuilderAPI_GTransform for non-orthogonal transforms
 * (shear, non-uniform scale).
 *
 * @param linear - 9 numbers in row-major order: [r00,r01,r02, r10,r11,r12, r20,r21,r22]
 * @param translation - [tx, ty, tz]
 * @param isOrthogonal - whether the 3x3 part is orthogonal (caller determines this)
 */
export function generalTransform(
  oc: OpenCascadeInstance,
  shape: OcShape,
  linear: readonly [number, number, number, number, number, number, number, number, number],
  translation: readonly [number, number, number],
  isOrthogonal: boolean
): OcShape {
  if (isOrthogonal) {
    // Fast path: gp_Trsf supports orthogonal transforms (rotation, uniform scale, mirror)
    const trsf = new oc.gp_Trsf_1();
    trsf.SetValues(
      linear[0], linear[1], linear[2], translation[0],
      linear[3], linear[4], linear[5], translation[1],
      linear[6], linear[7], linear[8], translation[2]
    );
    const transformer = new oc.BRepBuilderAPI_Transform_2(shape, trsf, true);
    const result = transformer.ModifiedShape(shape);
    transformer.delete();
    trsf.delete();
    return result;
  }

  // General path: gp_GTrsf supports any affine transform
  const gtrsf = new oc.gp_GTrsf_1();
  // Set 3x3 linear part element-by-element (1-indexed rows and columns)
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      gtrsf.SetValue(row + 1, col + 1, linear[row * 3 + col]);
    }
  }
  // Set translation part
  const xyz = new oc.gp_XYZ_2(translation[0], translation[1], translation[2]);
  gtrsf.SetTranslationPart(xyz);
  xyz.delete();

  const transformer = new oc.BRepBuilderAPI_GTransform_2(shape, gtrsf, true);
  const result = transformer.ModifiedShape(shape);
  transformer.delete();
  gtrsf.delete();
  return result;
}
```

**Step 2: Add to `KernelAdapter` interface in `src/kernel/types.ts`**

Find the `// --- Transforms ---` section (around line 127-141) and add after the `scale` method:

```ts
  generalTransform(
    shape: OcShape,
    linear: readonly [number, number, number, number, number, number, number, number, number],
    translation: readonly [number, number, number],
    isOrthogonal: boolean
  ): OcShape;
```

**Step 3: Add to `OCCTAdapter` in `src/kernel/occtAdapter.ts`**

Add import of `generalTransform as _generalTransform` to the import from `'./transformOps.js'` (line 31-37), then add the method in the Transforms section (after `scale`, around line 274):

In the import:
```ts
import {
  transform as _transform,
  translate as _translate,
  rotate as _rotate,
  mirror as _mirror,
  scale as _scale,
  generalTransform as _generalTransform,
  simplify as _simplify,
} from './transformOps.js';
```

Method:
```ts
  generalTransform(
    shape: OcShape,
    linear: readonly [number, number, number, number, number, number, number, number, number],
    translation: readonly [number, number, number],
    isOrthogonal: boolean
  ): OcShape {
    return _generalTransform(this.oc, shape, linear, translation, isOrthogonal);
  }
```

**Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add src/kernel/transformOps.ts src/kernel/types.ts src/kernel/occtAdapter.ts
git commit -m "feat: add generalTransform kernel operation for affine transforms"
```

---

### Task 5: Implement applyMatrix in topology layer

**Files:**
- Modify: `src/topology/shapeFns.ts` (add `applyMatrix` in the transforms section, around line 131)
- Modify: `src/topology/api.ts` (add public API function)
- Modify: `src/topology/wrapperFns.ts` (add to `Wrapped` interface and implementation)

**Step 1: Add parsing and validation helpers + `applyMatrix` to `src/topology/shapeFns.ts`**

Add after the `scale` function (after line 131), before the composed transform section:

```ts
// ---------------------------------------------------------------------------
// Matrix transform (OpenSCAD multmatrix equivalent)
// ---------------------------------------------------------------------------

import type { Matrix4x4, MatrixTransform, MatrixInput } from '../core/types.js';

/**
 * Parse a MatrixInput into a 3x3 linear part and translation vector.
 * Validates the matrix: bottom row must be [0,0,0,1], must not be singular.
 */
function parseMatrixInput(input: MatrixInput): {
  linear: readonly [number, number, number, number, number, number, number, number, number];
  translation: readonly [number, number, number];
} {
  if ('linear' in input) {
    // MatrixTransform form
    return { linear: input.linear, translation: input.translation };
  }

  // Matrix4x4 form — validate bottom row
  const [r0, r1, r2, r3] = input;
  const TOL = 1e-10;
  if (
    Math.abs(r3[0]) > TOL ||
    Math.abs(r3[1]) > TOL ||
    Math.abs(r3[2]) > TOL ||
    Math.abs(r3[3] - 1) > TOL
  ) {
    throw new Error(
      `applyMatrix: invalid bottom row [${r3}]. Must be [0, 0, 0, 1] for an affine transform.`
    );
  }

  return {
    linear: [r0[0], r0[1], r0[2], r1[0], r1[1], r1[2], r2[0], r2[1], r2[2]],
    translation: [r0[3], r1[3], r2[3]],
  };
}

/**
 * Compute the determinant of a 3x3 matrix given as 9 row-major values.
 */
function det3x3(m: readonly [number, number, number, number, number, number, number, number, number]): number {
  return (
    m[0] * (m[4] * m[8] - m[5] * m[7]) -
    m[1] * (m[3] * m[8] - m[5] * m[6]) +
    m[2] * (m[3] * m[7] - m[4] * m[6])
  );
}

/**
 * Check if a 3x3 matrix is orthogonal (possibly with uniform scale).
 * A matrix M is orthogonal-with-scale if M^T * M = s^2 * I for some scalar s.
 */
function isOrthogonalMatrix(
  m: readonly [number, number, number, number, number, number, number, number, number]
): boolean {
  const TOL = 1e-8;

  // Compute M^T * M
  // Row i of M: m[i*3], m[i*3+1], m[i*3+2]
  // Col j of M: m[j], m[3+j], m[6+j]
  // (M^T * M)[i][j] = sum_k M[k][i] * M[k][j]
  const mtm = new Array(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      mtm[i * 3 + j] = m[i] * m[j] + m[3 + i] * m[3 + j] + m[6 + i] * m[6 + j];
    }
  }

  // Check off-diagonal ≈ 0
  if (Math.abs(mtm[1]) > TOL) return false;
  if (Math.abs(mtm[2]) > TOL) return false;
  if (Math.abs(mtm[3]) > TOL) return false;
  if (Math.abs(mtm[5]) > TOL) return false;
  if (Math.abs(mtm[6]) > TOL) return false;
  if (Math.abs(mtm[7]) > TOL) return false;

  // Check diagonal elements are equal (uniform scale)
  if (Math.abs(mtm[0] - mtm[4]) > TOL) return false;
  if (Math.abs(mtm[0] - mtm[8]) > TOL) return false;

  return true;
}

/**
 * Apply a 4x4 affine transformation matrix to a shape.
 * Equivalent to OpenSCAD's `multmatrix`.
 *
 * Uses the fast `gp_Trsf` path for orthogonal matrices (rotation, uniform scale, mirror)
 * and the general `gp_GTrsf` path for non-orthogonal transforms (shear, non-uniform scale).
 */
export function applyMatrix<T extends AnyShape>(shape: T, matrix: MatrixInput): T {
  const { linear, translation } = parseMatrixInput(matrix);

  // Validate: matrix must not be singular
  const d = det3x3(linear);
  if (Math.abs(d) < 1e-12) {
    throw new Error('applyMatrix: singular matrix (determinant ≈ 0). Cannot apply a non-invertible transform.');
  }

  const oc = getKernel().oc;
  const orthogonal = isOrthogonalMatrix(linear);

  if (orthogonal) {
    // Fast path: gp_Trsf
    const trsf = new oc.gp_Trsf_1();
    trsf.SetValues(
      linear[0], linear[1], linear[2], translation[0],
      linear[3], linear[4], linear[5], translation[1],
      linear[6], linear[7], linear[8], translation[2]
    );
    const transformer = new oc.BRepBuilderAPI_Transform_2(shape.wrapped, trsf, true);
    const result = castShape(transformer.Shape()) as T;
    transformer.delete();
    trsf.delete();
    return result;
  }

  // General path: gp_GTrsf
  const gtrsf = new oc.gp_GTrsf_1();
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      gtrsf.SetValue(row + 1, col + 1, linear[row * 3 + col]);
    }
  }
  const xyz = new oc.gp_XYZ_2(translation[0], translation[1], translation[2]);
  gtrsf.SetTranslationPart(xyz);
  xyz.delete();

  const transformer = new oc.BRepBuilderAPI_GTransform_2(shape.wrapped, gtrsf, true);
  const result = castShape(transformer.Shape()) as T;
  transformer.delete();
  gtrsf.delete();
  return result;
}
```

> **Important:** The `import type { Matrix4x4, MatrixTransform, MatrixInput }` must be added to the imports at the top of `shapeFns.ts`. Find the existing import from `'../core/types.js'` and add these types.

**Step 2: Add public API in `src/topology/api.ts`**

Add after the `transformCopy` function (around line 97), before the booleans section:

```ts
/** Apply a 4x4 affine transformation matrix. Equivalent to OpenSCAD's multmatrix.
 *
 * Accepts either a raw `Matrix4x4` (4 rows of 4 numbers, row-major) or a structured
 * `MatrixTransform` with explicit `linear` and `translation` fields.
 *
 * Uses the fast orthogonal path for rotation/uniform-scale matrices and
 * the general affine path for shear/non-uniform scale.
 */
export function applyMatrix<T extends AnyShape>(
  shape: Shapeable<T>,
  matrix: MatrixInput
): T {
  return transforms.applyMatrix(resolve(shape), matrix);
}
```

Add `MatrixInput` to the imports at the top of `api.ts`. Find the `import type { Vec3 } from '../core/types.js'` and change to:

```ts
import type { Vec3, MatrixInput } from '../core/types.js';
```

**Step 3: Add to `Wrapped` interface and implementation in `src/topology/wrapperFns.ts`**

In the `Wrapped<T>` interface, after `scale` (around line 168), add:

```ts
  applyMatrix(matrix: MatrixInput): Wrapped<T>;
```

In the `createWrappedBase` function, after the `scale` implementation (around line 302), add:

```ts
    applyMatrix: (matrix) => wrapAny(applyMatrix(val, matrix)),
```

Add `applyMatrix` to the import from `'./api.js'` and add `MatrixInput` to the import from `'../core/types.js'` at the top of `wrapperFns.ts`.

**Step 4: Export from `src/index.ts`**

In the clean API exports from `'./topology/api.js'` (around line 686-724), add `applyMatrix` to the transforms section:

```ts
  // Transforms
  translate,
  rotate,
  mirror,
  scale,
  clone,
  applyMatrix,
  composeTransforms,
```

**Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 6: Run tests**

Run: `npm run test -- tests/fn-applyMatrix.test.ts`
Expected: Orthogonal tests PASS. Non-orthogonal tests (non-uniform scale, shear) will FAIL if WASM hasn't been rebuilt with `BRepBuilderAPI_GTransform`.

**Step 7: Commit**

```bash
git add src/topology/shapeFns.ts src/topology/api.ts src/topology/wrapperFns.ts src/index.ts
git commit -m "feat: implement applyMatrix (4x4 affine transform, OpenSCAD multmatrix equivalent)"
```

---

### Task 6: Rebuild WASM and run full test suite

**Step 1: Rebuild the opencascade WASM module**

Run: `cd packages/brepjs-opencascade && npm run build`

> This rebuilds the WASM binary with `BRepBuilderAPI_GTransform` included. This step takes several minutes.

**Step 2: Run the full applyMatrix test suite**

Run: `npm run test -- tests/fn-applyMatrix.test.ts`
Expected: ALL tests PASS, including non-uniform scale and shear.

**Step 3: Run the full project test suite**

Run: `npm run test`
Expected: ALL tests PASS (no regressions).

**Step 4: Run lint and typecheck**

Run: `npm run typecheck && npm run lint && npm run check:boundaries`
Expected: All PASS.

**Step 5: Commit any final fixes**

If any tests or lint issues needed fixing, commit them:
```bash
git add -A && git commit -m "fix: resolve test/lint issues from applyMatrix integration"
```

---

### Task 7: Verify and clean up

**Step 1: Run knip (unused code detection)**

Run: `npm run knip`
Expected: No new unused exports.

**Step 2: Run boundary check**

Run: `npm run check:boundaries`
Expected: PASS — no layer violations.

**Step 3: Manual verification**

Create a quick manual test to verify the API works end-to-end:
```ts
import { box, applyMatrix, getBounds } from './src/index.js';
// Non-uniform scale: 2x in X, 3x in Y, translate by [10, 0, 0]
const b = box(10, 10, 10);
const result = applyMatrix(b, [
  [2, 0, 0, 10],
  [0, 3, 0, 0],
  [0, 0, 1, 0],
  [0, 0, 0, 1],
]);
console.log(getBounds(result));
// Expected: xMin=10, xMax=30, yMin=0, yMax=30, zMin=0, zMax=10
```

**Step 4: Final commit**

```bash
git add -A && git commit -m "chore: clean up after applyMatrix implementation"
```
