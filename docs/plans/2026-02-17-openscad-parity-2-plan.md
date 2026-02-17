# OpenSCAD Parity Batch 2 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close remaining feature gaps between brepjs and OpenSCAD: fill, sectionToFace, OBJ import, 3MF import, textMetrics/fontMetrics, roof (straight skeleton), surfaceFromImage.

**Architecture:** Each feature is independent. Mesh import features (OBJ, 3MF) share a common triangle-sewing pattern from `surfaceFns.ts:buildTriFace`. Text metrics wraps the already-loaded opentype.js font. Roof requires a new straight skeleton algorithm in pure TypeScript.

**Tech Stack:** TypeScript, OpenCascade WASM (via `getKernel()`), opentype.js (text), Vitest (tests)

---

## Task 1: `fill()` — Remove holes from 2D shapes

**Files:**

- Modify: `src/topology/surfaceBuilders.ts` (add `fill` function after `makeFace` at line ~38)
- Modify: `src/index.ts` (add export)
- Modify: `tests/public-api-types.test.ts` (add to EXPECTED_RUNTIME_EXPORTS)
- Create: `tests/fn-fill.test.ts`

**Step 1: Write the failing test**

Create `tests/fn-fill.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { box, cylinder, cut, fill, getFaces, getWires, measureArea } from '../src/index.js';

describe('fill', () => {
  it('removes holes from a face', () => {
    const b = box(10, 10, 1);
    const c = cylinder(2, 2);
    const result = cut(b, c);
    const topFaces = getFaces(result);
    const faceWithHole = topFaces.find((f) => getWires(f).length > 1);
    expect(faceWithHole).toBeDefined();

    const filled = fill(faceWithHole!);
    expect(filled.ok).toBe(true);
    if (!filled.ok) return;
    expect(getWires(filled.value).length).toBe(1);
    expect(measureArea(filled.value)).toBeGreaterThan(measureArea(faceWithHole!));
  });

  it('returns unchanged face when no holes exist', () => {
    const b = box(10, 10, 1);
    const faces = getFaces(b);
    const simpleFace = faces.find((f) => getWires(f).length === 1)!;
    const result = fill(simpleFace);
    expect(result.ok).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fn-fill.test.ts`
Expected: FAIL — `fill` is not exported

**Step 3: Write minimal implementation**

In `src/topology/surfaceBuilders.ts`, add after the `makeFace` function (line ~38). Import `outerWire` from `./faceFns.js`:

```typescript
export function fill(face: Face): Result<Face> {
  const outer = outerWire(face);
  return makeFace(outer);
}
```

Add to `src/index.ts` in the topology section:

```typescript
export { fill } from './topology/surfaceBuilders.js';
```

Add `'fill'` to `EXPECTED_RUNTIME_EXPORTS` in `tests/public-api-types.test.ts` (alphabetically after `'filledFace'`).

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/fn-fill.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat: add fill() to remove holes from 2D faces
```

---

## Task 2: `sectionToFace()` — Section as filled 2D

**Files:**

- Modify: `src/topology/booleanFns.ts` (add `sectionToFace` after `section` at line ~455)
- Modify: `src/index.ts` (add export)
- Modify: `tests/public-api-types.test.ts`
- Create: `tests/fn-sectionToFace.test.ts`

**Step 1: Write the failing test**

Create `tests/fn-sectionToFace.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { box, cut, sectionToFace, measureArea, getWires } from '../src/index.js';

describe('sectionToFace', () => {
  it('returns a filled face from sectioning a box at XY', () => {
    const b = box(10, 20, 30);
    const result = sectionToFace(b, 'XY');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const area = measureArea(result.value);
    expect(area).toBeCloseTo(200, 0);
    expect(getWires(result.value).length).toBe(1);
  });

  it('returns a face with hole when sectioning a hollow shape', () => {
    const outer = box(20, 20, 20);
    const inner = box(10, 10, 30);
    const hollow = cut(outer, inner);
    const result = sectionToFace(hollow, 'XY');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(getWires(result.value).length).toBe(2);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fn-sectionToFace.test.ts`
Expected: FAIL — `sectionToFace` is not exported

**Step 3: Write implementation**

In `src/topology/booleanFns.ts`, add after the `section` function. Uses `getWires` from `./shapeFns.js` and `makeFace` from `./surfaceBuilders.js`:

```typescript
export function sectionToFace(
  shape: AnyShape,
  plane: PlaneInput,
  options: { approximation?: boolean; planeSize?: number } = {}
): Result<Face> {
  const sectionResult = section(shape, plane, options);
  if (!sectionResult.ok) return sectionResult;

  const wires = getWires(sectionResult.value);
  if (wires.length === 0) {
    return err(occtError('SECTION_FAILED', 'sectionToFace: section produced no wires'));
  }

  // Find the outermost wire (largest bounding box area)
  let outerIdx = 0;
  let maxArea = -1;
  for (let i = 0; i < wires.length; i++) {
    const bb = getKernel().boundingBox(wires[i].wrapped);
    const area = (bb.max[0] - bb.min[0]) * (bb.max[1] - bb.min[1]);
    if (area > maxArea) {
      maxArea = area;
      outerIdx = i;
    }
  }

  const outer = wires[outerIdx];
  const holes = wires.filter((_, i) => i !== outerIdx);
  return makeFace(outer, holes.length > 0 ? holes : undefined);
}
```

Add to `src/index.ts`:

```typescript
export { sectionToFace } from './topology/booleanFns.js';
```

Add `'sectionToFace'` to `EXPECTED_RUNTIME_EXPORTS` (alphabetically after `'section'`).

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/fn-sectionToFace.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat: add sectionToFace() for filled 2D cross-sections
```

---

## Task 3: OBJ Import

**Files:**

- Create: `src/io/objImportFns.ts`
- Modify: `src/core/errors.ts` (add `OBJ_IMPORT_FAILED`)
- Modify: `src/index.ts` (add export)
- Modify: `tests/public-api-types.test.ts`
- Create: `tests/fixtures/test-cube.obj`
- Create: `tests/fn-objImport.test.ts`

**Step 1: Create test fixture**

Create `tests/fixtures/test-cube.obj` — a simple unit cube:

```
# Unit cube
v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
v 0 0 1
v 1 0 1
v 1 1 1
v 0 1 1
f 1 2 3 4
f 5 8 7 6
f 1 5 6 2
f 2 6 7 3
f 3 7 8 4
f 4 8 5 1
```

**Step 2: Write the failing test**

Create `tests/fn-objImport.test.ts`:

```typescript
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importOBJ, measureVolume } from '../src/index.js';

describe('importOBJ', () => {
  it('imports a cube from OBJ', async () => {
    const buf = readFileSync(join(__dirname, 'fixtures/test-cube.obj'));
    const blob = new Blob([buf]);
    const result = await importOBJ(blob);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const vol = measureVolume(result.value);
    expect(vol).toBeCloseTo(1, 1);
  });

  it('fails on empty input', async () => {
    const blob = new Blob(['']);
    const result = await importOBJ(blob);
    expect(result.ok).toBe(false);
  });

  it('handles triangulated faces', async () => {
    const obj = `v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 0 1\nf 1 2 3\nf 1 3 4\n`;
    const blob = new Blob([obj]);
    const result = await importOBJ(blob);
    expect(result.ok).toBe(true);
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npx vitest run tests/fn-objImport.test.ts`
Expected: FAIL — `importOBJ` is not exported

**Step 4: Write implementation**

Add `OBJ_IMPORT_FAILED: 'OBJ_IMPORT_FAILED'` to `BrepErrorCode` in `src/core/errors.ts` under the IO errors section.

Create `src/io/objImportFns.ts`. Parse `v` (vertex) and `f` (face) lines. OBJ faces are 1-based and may use `v/vt/vn` format — extract vertex index only. Triangulate quads/n-gons via fan. Build solid using the same sewing pattern as `surfaceFns.ts:buildTriFace`: for each triangle, create 3 edges, make wire, make face, add to `BRepBuilderAPI_Sewing`. After sewing, wrap in `BRepBuilderAPI_MakeSolid`.

Key implementation details:

- Parse vertex lines: `const parts = line.split(/\s+/); vertices.push(+parts[1], +parts[2], +parts[3]);`
- Parse face lines: extract `parseInt(p.split('/')[0], 10) - 1` for each vertex ref
- Fan triangulation: `for (let i = 1; i < indices.length - 1; i++) triangles.push([indices[0], indices[i], indices[i+1]])`
- Sewing tolerance: `1e-6`

Add to `src/index.ts`:

```typescript
export { importOBJ } from './io/objImportFns.js';
```

Add `'importOBJ'` to `EXPECTED_RUNTIME_EXPORTS` (alphabetically after `'importIGES'`).

**Step 5: Run test to verify it passes**

Run: `npx vitest run tests/fn-objImport.test.ts`
Expected: PASS

**Step 6: Commit**

```
feat: add OBJ import for mesh geometry
```

---

## Task 4: 3MF Import

**Files:**

- Create: `src/io/threemfImportFns.ts`
- Modify: `src/core/errors.ts` (add `THREEMF_IMPORT_FAILED`)
- Modify: `src/index.ts`
- Modify: `tests/public-api-types.test.ts`
- Create: `tests/fn-threemfImport.test.ts`

**Step 1: Write the failing test**

Create `tests/fn-threemfImport.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { box, exportThreeMF, importThreeMF, measureVolume, mesh } from '../src/index.js';

describe('importThreeMF', () => {
  it('round-trips a box through 3MF export/import', async () => {
    const b = box(10, 10, 10);
    const m = mesh(b);
    const threemf = exportThreeMF(m);
    const blob = new Blob([threemf]);
    const result = await importThreeMF(blob);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const vol = measureVolume(result.value);
    expect(vol).toBeCloseTo(1000, -1);
  });

  it('fails on invalid 3MF data', async () => {
    const blob = new Blob([new ArrayBuffer(10)]);
    const result = await importThreeMF(blob);
    expect(result.ok).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fn-threemfImport.test.ts`
Expected: FAIL — `importThreeMF` is not exported

**Step 3: Write implementation**

Add `THREEMF_IMPORT_FAILED: 'THREEMF_IMPORT_FAILED'` to `BrepErrorCode` in `src/core/errors.ts`.

Create `src/io/threemfImportFns.ts`. Two key helper functions:

1. `extractFromZip(data, target)` — find end-of-central-directory (signature `0x06054b50`), walk central directory entries (signature `0x02014b50`), match filename, read from local file header (signature `0x04034b50`). Store-only ZIP (no decompression needed).

2. `parseModelXml(xml)` — regex extraction of `<vertex x="..." y="..." z="..."/>` and `<triangle v1="..." v2="..." v3="..."/>`.

Main function: unzip `3D/3dmodel.model`, parse XML, sew triangles into solid using same pattern as OBJ import.

Add to `src/index.ts`:

```typescript
export { importThreeMF } from './io/threemfImportFns.js';
```

Add `'importThreeMF'` to `EXPECTED_RUNTIME_EXPORTS` (alphabetically after `'importSTL'`).

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/fn-threemfImport.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat: add 3MF import for mesh geometry
```

---

## Task 5: `textMetrics()` / `fontMetrics()`

**Files:**

- Modify: `src/text/textBlueprints.ts` (add functions after existing text functions)
- Modify: `src/index.ts`
- Modify: `tests/public-api-types.test.ts`
- Create: `tests/fn-textMetrics.test.ts`

**Step 1: Write the failing test**

Create `tests/fn-textMetrics.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { textMetrics, fontMetrics } from '../src/index.js';

describe('textMetrics', () => {
  it('returns width and height for a string', () => {
    const m = textMetrics('Hello');
    expect(m.width).toBeGreaterThan(0);
    expect(m.height).toBeGreaterThan(0);
    expect(typeof m.ascender).toBe('number');
    expect(typeof m.descender).toBe('number');
  });

  it('scales with fontSize', () => {
    const m1 = textMetrics('A', { fontSize: 10 });
    const m2 = textMetrics('A', { fontSize: 20 });
    expect(m2.width).toBeCloseTo(m1.width * 2, 1);
  });
});

describe('fontMetrics', () => {
  it('returns font-level metrics', () => {
    const m = fontMetrics();
    expect(m.ascender).toBeGreaterThan(0);
    expect(m.descender).toBeLessThan(0);
    expect(m.unitsPerEm).toBeGreaterThan(0);
    expect(m.lineHeight).toBeGreaterThan(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fn-textMetrics.test.ts`
Expected: FAIL — `textMetrics` / `fontMetrics` not exported

**Step 3: Write implementation**

In `src/text/textBlueprints.ts`, add two exported functions and their return types. Uses the already-loaded opentype.js Font object via `getFont()`:

- `textMetrics`: calls `font.getAdvanceWidth(text, fontSize)`, computes height from `font.ascender` and `font.descender` scaled by `fontSize / font.unitsPerEm`.
- `fontMetrics`: reads `font.ascender`, `font.descender`, `font.unitsPerEm`, computes `lineHeight` from ascender - descender + line gap.

Add to `src/index.ts`:

```typescript
export {
  textMetrics,
  fontMetrics,
  type TextMetricsResult,
  type FontMetricsResult,
} from './text/textBlueprints.js';
```

Add `'fontMetrics'` and `'textMetrics'` to `EXPECTED_RUNTIME_EXPORTS` (in alphabetical positions).

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/fn-textMetrics.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat: add textMetrics() and fontMetrics() for text measurement
```

---

## Task 6: `roof()` — Straight Skeleton Extrusion

This is the most complex task. Split into two sub-commits.

**Files:**

- Create: `src/operations/straightSkeleton.ts` (pure algorithm, ~300-400 lines)
- Create: `src/operations/roofFns.ts` (OCCT integration, ~80 lines)
- Modify: `src/core/errors.ts` (add `ROOF_FAILED`)
- Modify: `src/index.ts`
- Modify: `tests/public-api-types.test.ts`
- Create: `tests/fn-straightSkeleton.test.ts` (algorithm unit tests)
- Create: `tests/fn-roof.test.ts` (integration tests)

### Step 1: Write algorithm unit tests

Create `tests/fn-straightSkeleton.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { computeStraightSkeleton } from '../src/operations/straightSkeleton.js';

describe('computeStraightSkeleton', () => {
  it('computes skeleton for a square', () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const skeleton = computeStraightSkeleton(polygon);
    expect(skeleton.nodes.length).toBeGreaterThanOrEqual(1);
    const center = skeleton.nodes.find((n) => Math.abs(n.x - 5) < 0.1 && Math.abs(n.y - 5) < 0.1);
    expect(center).toBeDefined();
    expect(skeleton.faces.length).toBe(4);
  });

  it('computes skeleton for an L-shape', () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 10 },
      { x: 0, y: 10 },
    ];
    const skeleton = computeStraightSkeleton(polygon);
    expect(skeleton.faces.length).toBe(6);
  });

  it('computes skeleton for a triangle', () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 8.66 },
    ];
    const skeleton = computeStraightSkeleton(polygon);
    expect(skeleton.faces.length).toBe(3);
    expect(skeleton.nodes.length).toBe(1);
  });
});
```

### Step 2: Implement straight skeleton algorithm

Create `src/operations/straightSkeleton.ts`.

Output types:

```typescript
export interface Point2D {
  x: number;
  y: number;
}
export interface SkeletonNode {
  x: number;
  y: number;
  height: number;
}
export interface SkeletonFace {
  vertices: Point2D[];
  heights: number[];
}
export interface StraightSkeleton {
  nodes: SkeletonNode[];
  faces: SkeletonFace[];
}
export function computeStraightSkeleton(polygon: Point2D[]): StraightSkeleton;
```

Algorithm overview (weighted straight skeleton for simple polygons):

1. Initialize LAV (List of Active Vertices) — circular doubly-linked list of polygon vertices
2. For each vertex, compute angular bisector direction from adjacent edges
3. Find next event by computing intersection times:
   - **Edge event**: two adjacent bisectors meet (edge collapses to zero length)
   - **Split event**: reflex vertex bisector hits a non-adjacent edge
4. Process events in time order:
   - Edge event: merge two LAV nodes, record skeleton arc to new node
   - Split event: split LAV into two, record skeleton arc
5. Continue until all LAVs collapse
6. Output: for each original edge, collect the polygon formed by [edgeStart, edgeEnd, ...skeleton nodes tracing the ridge]

### Step 3: Run algorithm tests, commit

```
feat: add straight skeleton algorithm for roof generation
```

### Step 4: Write roof integration tests

Create `tests/fn-roof.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { box, getFaces, getWires, measureVolume, roof } from '../src/index.js';

describe('roof', () => {
  it('creates a roof from a rectangular wire', () => {
    const b = box(10, 10, 1);
    const wire = getWires(getFaces(b)[0])[0];
    const result = roof(wire);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const vol = measureVolume(result.value);
    expect(vol).toBeGreaterThan(0);
  });

  it('respects angle option', () => {
    const b = box(10, 10, 1);
    const wire = getWires(getFaces(b)[0])[0];
    const r1 = roof(wire, { angle: 30 });
    const r2 = roof(wire, { angle: 60 });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(measureVolume(r2.value)).toBeGreaterThan(measureVolume(r1.value));
  });
});
```

### Step 5: Write roof OCCT integration

Add `ROOF_FAILED: 'ROOF_FAILED'` to `BrepErrorCode`.

Create `src/operations/roofFns.ts`:

- Extract 2D polygon from wire via `getEdges(wire)` + `curveStartPoint(edge)`
- Call `computeStraightSkeleton(polygon)`
- For each skeleton face, convert vertices to 3D (z = height \* tan(angle))
- Fan-triangulate each face, build OCCT faces, sew, make solid

Add to `src/index.ts`:

```typescript
export { roof } from './operations/roofFns.js';
```

Add `'roof'` to `EXPECTED_RUNTIME_EXPORTS`.

### Step 6: Run tests, commit

```
feat: add roof() for straight skeleton extrusion
```

---

## Task 7: `surfaceFromImage()` — Heightmap from image

**Files:**

- Modify: `src/topology/surfaceFns.ts` (add `surfaceFromImage`)
- Modify: `src/index.ts`
- Modify: `tests/public-api-types.test.ts`
- Create: `tests/fn-surfaceFromImage.test.ts`

**Step 1: Write the failing test**

Create `tests/fn-surfaceFromImage.test.ts`. Note: `createImageBitmap`/`OffscreenCanvas` may not be available in Vitest (Node). Test the error path and test that the function is exported. For the success path, test may need to be skipped in CI.

```typescript
import { describe, expect, it } from 'vitest';
import { surfaceFromImage } from '../src/index.js';

describe('surfaceFromImage', () => {
  it('fails on non-image data', async () => {
    const blob = new Blob(['not an image']);
    const result = await surfaceFromImage(blob);
    expect(result.ok).toBe(false);
  });
});
```

**Step 2: Write implementation**

In `src/topology/surfaceFns.ts`, add `surfaceFromImage`. Uses `createImageBitmap` + `OffscreenCanvas` to decode image, reads RGBA pixel data, converts to height grid based on channel option (r/g/b/luminance), delegates to `surfaceFromGrid()`.

Channel mapping:

- `'r'`: `data[i] / 255`
- `'g'`: `data[i+1] / 255`
- `'b'`: `data[i+2] / 255`
- `'luminance'` (default): `(0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2]) / 255`

Add to `src/index.ts`:

```typescript
export { surfaceFromImage, type SurfaceFromImageOptions } from './topology/surfaceFns.js';
```

Add `'surfaceFromImage'` to `EXPECTED_RUNTIME_EXPORTS`.

**Step 3: Run test, commit**

```
feat: add surfaceFromImage() for heightmap-from-image surfaces
```

---

## Task 8: Integration Checks

Run all quality gates:

- `npm run test` — full test suite passes
- `npm run typecheck` — no type errors
- `npm run lint` — no lint errors
- `npm run check:boundaries` — layer boundaries respected
- `npm run knip` — no unused exports
