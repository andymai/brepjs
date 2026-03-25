# V8 New Capabilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose new OCCT V8 capabilities: native TKHelix toolkit, NCollection_KDTree spatial queries, GeomHash/Geom2dHash geometry hashing, and BRepGraph topology graph.

**Architecture:** All four features require adding new WASM bindings (symbols in `brepjs.yml`) and some require C++ wrapper classes. Each feature gets a new or extended TypeScript adapter in `src/kernel/occt/`, a kernel interface method, and tests. All binding additions go into a single Docker rebuild.

**Tech Stack:** TypeScript, C++ (Emscripten additionalCppCode), OCCT V8 TKHelix/NCollection/GeomHash/BRepGraph

**Prerequisites:** Docker image `ghcr.io/andymai/opencascade.js:v8` must include the relevant OCCT toolkits. Verify availability before implementing.

---

## File Structure

| File                                                  | Purpose                                            |
| ----------------------------------------------------- | -------------------------------------------------- |
| `packages/brepjs-opencascade/build-config/brepjs.yml` | Add all new symbols + C++ wrappers                 |
| `src/kernel/occt/extendedConstructorOps.ts`           | Refactor `makeHelixWire` to use TKHelix            |
| `src/kernel/occt/advancedOps.ts`                      | Add KDTree-based spatial queries, geometry hashing |
| `src/kernel/interfaces/builderOps.ts`                 | Add `makeHelixNative` interface method             |
| `src/kernel/interfaces/geometryQueryOps.ts`           | Add spatial query + hashing interface methods      |
| `tests/helixFns.test.ts`                              | New: native helix tests                            |
| `tests/spatialQuery.test.ts`                          | New: KDTree spatial query tests                    |
| `tests/geometryHash.test.ts`                          | New: geometry hashing tests                        |

---

## Pre-implementation: Verify V8 toolkit availability

Before starting any task, verify that the required V8 classes exist in the OCCT source included in the Docker image:

- [ ] **Step 1: Check TKHelix availability**

```bash
distrobox-host-exec docker run --rm --entrypoint find ghcr.io/andymai/opencascade.js:v8 /occt/src -name "*Helix*" -type f 2>/dev/null | head -20
```

Expected: Files in `/occt/src/ModelingAlgorithms/TKHelix/` or similar

- [ ] **Step 2: Check NCollection_KDTree availability**

```bash
distrobox-host-exec docker run --rm --entrypoint find ghcr.io/andymai/opencascade.js:v8 /occt/src -name "*KDTree*" -o -name "*KdTree*" | head -10
```

- [ ] **Step 3: Check GeomHash availability**

```bash
distrobox-host-exec docker run --rm --entrypoint find ghcr.io/andymai/opencascade.js:v8 /occt/src -name "*GeomHash*" -o -name "*Geom2dHash*" | head -10
```

- [ ] **Step 4: Check BRepGraph availability**

```bash
distrobox-host-exec docker run --rm --entrypoint find ghcr.io/andymai/opencascade.js:v8 /occt/src -name "*BRepGraph*" | head -10
```

**If a toolkit is not found:** Skip that task. OCCT V8 RC4 may not include all features from the final V8 release. Document which features are blocked and revisit when V8.0.0 final ships.

---

### Task 1: Native helix via TKHelix

**Files:**

- Modify: `packages/brepjs-opencascade/build-config/brepjs.yml`
- Modify: `src/kernel/occt/extendedConstructorOps.ts:218-274`
- Test: `tests/helixFns.test.ts` (new)

**Context:** Current `makeHelixWire()` manually constructs a helix by creating a 2D parametric line on a cylindrical surface (`Geom_CylindricalSurface` + `Geom2d_Line`), then lifting to 3D via `BRepBuilderAPI_MakeEdge_30`. TKHelix provides a native helix adaptor that handles this internally with higher quality.

- [ ] **Step 1: Write failing test for native helix**

Create `tests/helixFns.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { getKernel } from '@/kernel/index.js';
import { isSolid } from '@/core/shapeTypes.js';
import { unwrap } from '@/core/result.js';
import { measureVolume } from '@/measurement/measureFns.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('native helix', () => {
  it('creates a helix wire with correct dimensions', () => {
    const k = getKernel();
    const helix = k.makeHelixWire(10, 30, 5); // pitch=10, height=30, radius=5
    expect(k.shapeType(helix)).toBe('wire');
    const bbox = k.boundingBox(helix);
    // Helix should span ~30mm in Z
    expect(bbox.zSize).toBeCloseTo(30, 0);
    // Radius should be ~5mm in X/Y
    expect(bbox.xSize).toBeCloseTo(10, 0); // diameter
    expect(bbox.ySize).toBeCloseTo(10, 0);
  });

  it('left-handed helix reverses winding', () => {
    const k = getKernel();
    const right = k.makeHelixWire(10, 30, 5, [0, 0, 0], [0, 0, 1], false);
    const left = k.makeHelixWire(10, 30, 5, [0, 0, 0], [0, 0, 1], true);
    // Both should have same bounding box dimensions
    const rbox = k.boundingBox(right);
    const lbox = k.boundingBox(left);
    expect(rbox.zSize).toBeCloseTo(lbox.zSize, 1);
    expect(rbox.xSize).toBeCloseTo(lbox.xSize, 1);
  });

  // NOTE: helicalSweep is only available in brepkit kernel, not OCCT.
  // Skip this test when running against OCCT.
  it.skipIf(currentKernel === 'occt')('helical sweep produces valid solid', () => {
    const k = getKernel();
    const circle = k.makeCircle(1, [5, 0, 0], [0, 1, 0]);
    const face = k.makeFace(circle);
    const result = k.helicalSweep(face, [0, 0, 0], [0, 0, 1], 5, 10, 3);
    expect(isSolid(result)).toBe(true);
    const vol = unwrap(measureVolume(result));
    expect(vol).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify current implementation passes**

Run: `npx vitest run tests/helixFns.test.ts`
Expected: PASS (current manual B-spline implementation should pass these)

- [ ] **Step 3: Investigate TKHelix API**

Read the OCCT V8 source inside the Docker image to find the exact class names and constructor signatures for the helix toolkit. Look for `GeomHelix_*` or `BRepHelix_*` classes.

```bash
distrobox-host-exec docker run --rm --entrypoint bash ghcr.io/andymai/opencascade.js:v8 -c 'find /occt/src -path "*Helix*" -name "*.hxx" | head -20 && echo "---" && grep -r "class.*Helix" /occt/src/*/TKHelix/ 2>/dev/null | head -20'
```

- [ ] **Step 4: Add TKHelix symbols to brepjs.yml and write wrapper if needed**

Based on step 3 findings, add the appropriate symbol declarations. If TKHelix uses `Adaptor3d_Curve` subclassing (which can't be bound directly), write a C++ wrapper class:

```cpp
class HelixWireBuilder {
public:
  // Build a helix wire using TKHelix native adaptor.
  // Returns a TopoDS_Wire with high-quality helix geometry.
  static TopoDS_Wire build(double radius, double pitch, double height,
                           const gp_Pnt& center, const gp_Dir& axis,
                           bool leftHanded) {
    // Implementation depends on TKHelix API — fill in after step 3
  }
};
```

- [ ] **Step 5: Refactor makeHelixWire to use native adaptor when available**

In `src/kernel/occt/extendedConstructorOps.ts`, at lines 218-274, add feature detection:

```typescript
export function makeHelixWire(
  oc: KernelInstance,
  pitch: number,
  height: number,
  radius: number,
  center: [number, number, number] = [0, 0, 0],
  direction: [number, number, number] = [0, 0, 1],
  leftHanded = false
): KernelShape {
  // V8: use native TKHelix if available
  if (typeof oc.HelixWireBuilder?.build === 'function') {
    const pnt = new oc.gp_Pnt_3(center[0], center[1], center[2]);
    const dir = new oc.gp_Dir_5(direction[0], direction[1], direction[2]);
    const wire = oc.HelixWireBuilder.build(radius, pitch, height, pnt, dir, leftHanded);
    pnt.delete();
    dir.delete();
    return wire;
  }

  // Fallback: manual parametric construction (existing code)
  // ... existing implementation unchanged ...
}
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/helixFns.test.ts`
Expected: PASS with native helix path

- [ ] **Step 7: Commit**

```bash
git add packages/brepjs-opencascade/build-config/brepjs.yml \
  src/kernel/occt/extendedConstructorOps.ts tests/helixFns.test.ts
git commit -m "feat(helix): use native TKHelix adaptor when available"
```

---

### Task 2: KDTree spatial queries

**Files:**

- Modify: `packages/brepjs-opencascade/build-config/brepjs.yml`
- Create: `src/kernel/occt/spatialQueryOps.ts`
- Modify: `src/kernel/interfaces/geometryQueryOps.ts`
- Create: `tests/spatialQuery.test.ts`

**Context:** `NCollection_KDTree` is a header-only V8 addition for spatial indexing. Useful for nearest-point queries on shape collections, feature detection on large models, and point cloud operations.

- [ ] **Step 1: Investigate NCollection_KDTree API**

```bash
distrobox-host-exec docker run --rm --entrypoint bash ghcr.io/andymai/opencascade.js:v8 -c 'find /occt/src -name "NCollection_KDTree*" | head -10 && cat /occt/src/*/TKernel/NCollection/NCollection_KDTree.hxx 2>/dev/null | head -80'
```

- [ ] **Step 2: Write C++ wrapper for KDTree**

KDTree is template-based (header-only) which can't be directly bound. Write a concrete wrapper:

```cpp
class SpatialIndex3D {
  NCollection_KDTree<gp_XYZ> tree_;
  std::vector<gp_XYZ> points_;
public:
  void addPoint(double x, double y, double z) {
    points_.push_back(gp_XYZ(x, y, z));
  }

  void build() {
    tree_ = NCollection_KDTree<gp_XYZ>(points_);
  }

  // Find the index of the nearest point to (x, y, z)
  int nearestPoint(double x, double y, double z) {
    return tree_.NearestNeighbor(gp_XYZ(x, y, z));
  }

  // Find all points within distance `radius` of (x, y, z)
  // Returns flat array of indices
  std::vector<int> pointsInRadius(double x, double y, double z, double radius) {
    auto results = tree_.RangeSearch(gp_XYZ(x, y, z), radius);
    return std::vector<int>(results.begin(), results.end());
  }

  // Find K nearest points
  std::vector<int> kNearest(double x, double y, double z, int k) {
    auto results = tree_.KNearest(gp_XYZ(x, y, z), k);
    return std::vector<int>(results.begin(), results.end());
  }

  int size() const { return static_cast<int>(points_.size()); }
};
```

**NOTE:** The exact NCollection_KDTree API may differ — adapt after step 1 investigation.

- [ ] **Step 3: Add symbol to brepjs.yml**

```yaml
- symbol: SpatialIndex3D
```

- [ ] **Step 4: Write TypeScript adapter**

Create `src/kernel/occt/spatialQueryOps.ts`:

```typescript
import type { KernelInstance } from '@/kernel/types.js';

export interface SpatialIndex {
  addPoint(x: number, y: number, z: number): void;
  build(): void;
  nearestPoint(x: number, y: number, z: number): number;
  pointsInRadius(x: number, y: number, z: number, radius: number): number[];
  kNearest(x: number, y: number, z: number, k: number): number[];
  size(): number;
  dispose(): void;
}

export function createSpatialIndex(oc: KernelInstance): SpatialIndex {
  const idx = new oc.SpatialIndex3D();
  return {
    addPoint(x, y, z) {
      idx.addPoint(x, y, z);
    },
    build() {
      idx.build();
    },
    nearestPoint(x, y, z) {
      return idx.nearestPoint(x, y, z);
    },
    pointsInRadius(x, y, z, r) {
      return Array.from(idx.pointsInRadius(x, y, z, r));
    },
    kNearest(x, y, z, k) {
      return Array.from(idx.kNearest(x, y, z, k));
    },
    size() {
      return idx.size();
    },
    dispose() {
      idx.delete();
    },
  };
}
```

- [ ] **Step 5: Write tests**

Create `tests/spatialQuery.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { getKernel } from '@/kernel/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('spatial index', () => {
  it('finds nearest point', () => {
    const k = getKernel();
    const idx = k.createSpatialIndex();
    idx.addPoint(0, 0, 0);
    idx.addPoint(10, 0, 0);
    idx.addPoint(5, 5, 0);
    idx.build();
    expect(idx.nearestPoint(4, 4, 0)).toBe(2); // closest to (5,5,0)
    expect(idx.nearestPoint(9, 0, 0)).toBe(1); // closest to (10,0,0)
    idx.dispose();
  });

  it('finds points in radius', () => {
    const k = getKernel();
    const idx = k.createSpatialIndex();
    for (let i = 0; i < 10; i++) idx.addPoint(i, 0, 0);
    idx.build();
    const nearby = idx.pointsInRadius(5, 0, 0, 2.5);
    // Should find points at x=3,4,5,6,7
    expect(nearby.length).toBeGreaterThanOrEqual(3);
    idx.dispose();
  });
});
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/spatialQuery.test.ts`

- [ ] **Step 7: Commit**

```bash
git add packages/brepjs-opencascade/build-config/brepjs.yml \
  src/kernel/occt/spatialQueryOps.ts tests/spatialQuery.test.ts
git commit -m "feat(query): add KDTree-based spatial index for point queries"
```

---

### Task 3: Geometry hashing (GeomHash / Geom2dHash)

**Files:**

- Modify: `packages/brepjs-opencascade/build-config/brepjs.yml`
- Modify: `src/kernel/occt/advancedOps.ts` or create `src/kernel/occt/geometryHashOps.ts`
- Create: `tests/geometryHash.test.ts`

- [ ] **Step 1: Investigate GeomHash API**

```bash
distrobox-host-exec docker run --rm --entrypoint bash ghcr.io/andymai/opencascade.js:v8 -c 'find /occt/src -name "*GeomHash*" -o -name "*Geom2dHash*" | head -10'
```

- [ ] **Step 2: Add symbols and write wrapper if needed**

If `GeomHash` provides a simple hash function for curves/surfaces:

```cpp
class GeometryHashHelper {
public:
  static int hashCurve(const Handle_Geom_Curve& curve, int upperBound) {
    return GeomHash::HashCode(curve, upperBound);
  }
  static int hashSurface(const Handle_Geom_Surface& surface, int upperBound) {
    return GeomHash::HashCode(surface, upperBound);
  }
  static int hashCurve2d(const Handle_Geom2d_Curve& curve, int upperBound) {
    return Geom2dHash::HashCode(curve, upperBound);
  }
  static bool curvesEqual(const Handle_Geom_Curve& a, const Handle_Geom_Curve& b) {
    return GeomHash::IsEqual(a, b);
  }
};
```

- [ ] **Step 3: Write TypeScript adapter and tests**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(geometry): add geometry-level hashing for curves and surfaces"
```

---

### Task 4: BRepGraph topology graph (investigation)

**Files:**

- None initially — investigation only

- [ ] **Step 1: Check if BRepGraph exists in V8 RC4**

```bash
distrobox-host-exec docker run --rm --entrypoint bash ghcr.io/andymai/opencascade.js:v8 -c 'find /occt/src -name "*BRepGraph*" -o -name "*TopGraph*" | head -20'
```

- [ ] **Step 2: If found, read header files to understand the API**

- [ ] **Step 3: Evaluate usefulness for brepjs**

Compare with existing topology extraction approach (`TopExp_Explorer` iteration + hash-based tracking in `TopologyExtractor`). If BRepGraph provides adjacency, connectivity, or graph traversal that's currently expensive to compute, plan a follow-up task.

- [ ] **Step 4: Document findings**

Write a brief investigation note in the commit message about what was found and whether it's worth pursuing.

```bash
git commit --allow-empty -m "docs: investigate BRepGraph V8 topology graph — [findings here]"
```

---

## Docker Rebuild Note

Tasks 1-3 all require `brepjs.yml` changes. **Batch all binding additions into a single Docker rebuild:**

1. Complete all `brepjs.yml` modifications from Tasks 1-3 (and Plan 1 Tasks 2 & 4)
2. Run a single `npm run buildWasm` (or Docker build + push)
3. Then implement and test each TypeScript adapter

This avoids multiple 15-minute rebuilds.
