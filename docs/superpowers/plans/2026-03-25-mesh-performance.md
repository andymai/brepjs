# Mesh Performance & Progressive LOD Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce meshing latency for large models with batch multi-shape meshing in C++ and progressive LOD (coarse preview → fine export) with Three.js integration.

**Architecture:** New `MeshBatchExtractor` C++ class meshes N shapes in a single WASM call, returning a flat buffer of per-shape mesh data. `meshMultiLOD()` produces coarse + fine meshes in one pass. Three.js LOD helper swaps geometry based on camera distance.

**Tech Stack:** C++ (BRepMesh_IncrementalMesh, Poly_Triangulation), TypeScript, Three.js LOD

**Docker Rebuild:** Task 1 requires `brepjs.yml` changes. Batch with Plan A.

---

## File Structure

| File                                                  | Purpose                                         |
| ----------------------------------------------------- | ----------------------------------------------- |
| `packages/brepjs-opencascade/build-config/brepjs.yml` | Add `MeshBatchExtractor` C++ class              |
| `src/kernel/occt/meshOps.ts`                          | Add batch mesh + multi-LOD adapter              |
| `src/kernel/interfaces/meshOps.ts`                    | Add batch/LOD methods to interface              |
| `src/topology/meshFns.ts`                             | Add `meshBatch()` + `meshMultiLOD()` public API |
| `src/topology/threeHelpers.ts`                        | Add `toLODGeometry()` Three.js helper           |
| `tests/meshBatch.test.ts`                             | New: batch mesh + LOD tests                     |
| `benchmarks/mesh-batch.bench.test.ts`                 | New: batch vs individual mesh benchmark         |

---

### Task 1: MeshBatchExtractor C++ class

**Files:**

- Modify: `packages/brepjs-opencascade/build-config/brepjs.yml`

- [ ] **Step 1: Add MeshBatchExtractor to brepjs.yml additionalCppCode**

Add after the existing `MeshExtractor` class. This meshes N shapes in one call, reusing the mesher context.

```cpp
// Batch mesh extraction — meshes N shapes in a single WASM call.
// Returns per-shape mesh data packed sequentially in flat arrays.
class MeshBatchData {
public:
  int shapeCount_;

  // Per-shape offsets: [vertStart0, vertCount0, triStart0, triCount0, ...]
  int32_t* offsetsPtr_;
  int offsetsSize_;  // shapeCount * 4

  // All vertices packed: [x0,y0,z0, x1,y1,z1, ...]
  float* verticesPtr_;
  int verticesSize_;

  // All normals packed
  float* normalsPtr_;
  int normalsSize_;

  // All triangle indices packed (0-based per shape, add vertStart for global)
  uint32_t* trianglesPtr_;
  int trianglesSize_;

  int getOffsetsPtr() const { return reinterpret_cast<uintptr_t>(offsetsPtr_); }
  int getOffsetsSize() const { return offsetsSize_; }
  int getVerticesPtr() const { return reinterpret_cast<uintptr_t>(verticesPtr_); }
  int getVerticesSize() const { return verticesSize_; }
  int getNormalsPtr() const { return reinterpret_cast<uintptr_t>(normalsPtr_); }
  int getNormalsSize() const { return normalsSize_; }
  int getTrianglesPtr() const { return reinterpret_cast<uintptr_t>(trianglesPtr_); }
  int getTrianglesSize() const { return trianglesSize_; }
  int getShapeCount() const { return shapeCount_; }

  void dispose() {
    std::free(offsetsPtr_); std::free(verticesPtr_);
    std::free(normalsPtr_); std::free(trianglesPtr_);
  }
};

class MeshBatchExtractor {
public:
  void addShape(const TopoDS_Shape& shape) {
    shapes_.push_back(shape);
  }

  MeshBatchData extract(double tolerance, double angularTolerance) {
    MeshBatchData result;
    result.shapeCount_ = static_cast<int>(shapes_.size());

    // First pass: mesh all shapes and count totals
    int totalVerts = 0, totalTris = 0;
    struct ShapeMeshInfo { int vertStart; int vertCount; int triStart; int triCount; };
    std::vector<ShapeMeshInfo> infos(shapes_.size());

    for (size_t s = 0; s < shapes_.size(); s++) {
      BRepMesh_IncrementalMesh mesher(shapes_[s], tolerance, false, angularTolerance, false);
      int shapeVerts = 0, shapeTris = 0;
      for (TopExp_Explorer ex(shapes_[s], TopAbs_FACE); ex.More(); ex.Next()) {
        const TopoDS_Face& face = TopoDS::Face(ex.Current());
        TopLoc_Location loc;
        auto tri = BRep_Tool::Triangulation(face, loc);
        if (tri.IsNull()) continue;
        shapeVerts += tri->NbNodes();
        shapeTris += tri->NbTriangles();
      }
      infos[s] = {totalVerts, shapeVerts, totalTris, shapeTris};
      totalVerts += shapeVerts;
      totalTris += shapeTris;
    }

    // Allocate
    result.offsetsPtr_ = static_cast<int32_t*>(std::malloc(shapes_.size() * 4 * sizeof(int32_t)));
    result.offsetsSize_ = static_cast<int>(shapes_.size()) * 4;
    result.verticesPtr_ = static_cast<float*>(std::malloc(totalVerts * 3 * sizeof(float)));
    result.verticesSize_ = totalVerts * 3;
    result.normalsPtr_ = static_cast<float*>(std::malloc(totalVerts * 3 * sizeof(float)));
    result.normalsSize_ = totalVerts * 3;
    result.trianglesPtr_ = static_cast<uint32_t*>(std::malloc(totalTris * 3 * sizeof(uint32_t)));
    result.trianglesSize_ = totalTris * 3;

    // Second pass: extract geometry
    for (size_t s = 0; s < shapes_.size(); s++) {
      const auto& info = infos[s];
      result.offsetsPtr_[s * 4] = info.vertStart;
      result.offsetsPtr_[s * 4 + 1] = info.vertCount;
      result.offsetsPtr_[s * 4 + 2] = info.triStart;
      result.offsetsPtr_[s * 4 + 3] = info.triCount;

      int vi = info.vertStart * 3;
      int ni = info.vertStart * 3;
      int ti = info.triStart * 3;
      int nodeOffset = 0;

      for (TopExp_Explorer ex(shapes_[s], TopAbs_FACE); ex.More(); ex.Next()) {
        const TopoDS_Face& face = TopoDS::Face(ex.Current());
        TopLoc_Location loc;
        auto tri = BRep_Tool::Triangulation(face, loc);
        if (tri.IsNull()) continue;

        const gp_Trsf& trsf = loc.IsIdentity() ? gp_Trsf() : loc.IsIdentity() ? gp_Trsf() : loc.Transformation();
        const bool hasLoc = !loc.IsIdentity();
        const int nn = tri->NbNodes();
        const int nt = tri->NbTriangles();

        // Vertices
        for (int i = 1; i <= nn; i++) {
          gp_Pnt p = tri->Node(i);
          if (hasLoc) p.Transform(trsf);
          result.verticesPtr_[vi++] = static_cast<float>(p.X());
          result.verticesPtr_[vi++] = static_cast<float>(p.Y());
          result.verticesPtr_[vi++] = static_cast<float>(p.Z());
        }

        // Normals
        if (!tri->HasNormals()) {
          BRepLib_ToolTriangulatedShape::ComputeNormals(face, tri);
        }
        for (int i = 1; i <= nn; i++) {
          gp_Vec3f n = tri->Normal(i);
          if (hasLoc) {
            gp_Dir d(n.x(), n.y(), n.z());
            d.Transform(trsf);
            result.normalsPtr_[ni++] = static_cast<float>(d.X());
            result.normalsPtr_[ni++] = static_cast<float>(d.Y());
            result.normalsPtr_[ni++] = static_cast<float>(d.Z());
          } else {
            result.normalsPtr_[ni++] = n.x();
            result.normalsPtr_[ni++] = n.y();
            result.normalsPtr_[ni++] = n.z();
          }
        }

        // Triangles (face-local 1-based → global 0-based)
        const bool reversed = face.IsNull() ? false : (face.Orientation() == TopAbs_REVERSED);
        for (int i = 1; i <= nt; i++) {
          int n1, n2, n3;
          tri->Triangle(i).Get(n1, n2, n3);
          if (reversed) std::swap(n1, n2);
          result.trianglesPtr_[ti++] = static_cast<uint32_t>(nodeOffset + n1 - 1);
          result.trianglesPtr_[ti++] = static_cast<uint32_t>(nodeOffset + n2 - 1);
          result.trianglesPtr_[ti++] = static_cast<uint32_t>(nodeOffset + n3 - 1);
        }
        nodeOffset += nn;
      }
    }

    return result;
  }

private:
  std::vector<TopoDS_Shape> shapes_;
};
```

- [ ] **Step 2: Add symbols**

```yaml
- symbol: MeshBatchData
- symbol: MeshBatchExtractor
```

- [ ] **Step 3: Commit**

```bash
git add packages/brepjs-opencascade/build-config/brepjs.yml
git commit -m "feat(opencascade): add MeshBatchExtractor C++ class"
```

---

### Task 2: TypeScript batch mesh adapter + public API

**Files:**

- Modify: `src/kernel/occt/meshOps.ts` (add batch mesh function)
- Modify: `src/topology/meshFns.ts` (add `meshBatch()` public API)
- Create: `tests/meshBatch.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/meshBatch.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { box, cylinder } from '@/index.js';
import { meshBatch } from '@/topology/meshFns.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('meshBatch', () => {
  it('meshes multiple shapes in one call', () => {
    const shapes = [box(10, 10, 10), box(5, 5, 5), cylinder(3, 10)];
    const results = meshBatch(shapes, { tolerance: 0.1, angularTolerance: 0.5 });
    expect(results).toHaveLength(3);
    for (const m of results) {
      expect(m.vertices.length).toBeGreaterThan(0);
      expect(m.normals.length).toBeGreaterThan(0);
      expect(m.triangles.length).toBeGreaterThan(0);
    }
  });

  it('returns same results as individual mesh calls', () => {
    const shapes = [box(10, 10, 10), cylinder(3, 10)];
    const batchResults = meshBatch(shapes, { tolerance: 0.1, angularTolerance: 0.5 });
    // Vertex counts should match individual meshing
    for (let i = 0; i < shapes.length; i++) {
      expect(batchResults[i]!.vertices.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Implement meshBatch adapter and public API**

The adapter reads HEAP data from MeshBatchExtractor, splits into per-shape meshes. Falls back to sequential `mesh()` calls if C++ class unavailable.

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/meshBatch.test.ts`
Expected: PASS (JS fallback path)

- [ ] **Step 4: Commit**

```bash
git add src/kernel/occt/meshOps.ts src/topology/meshFns.ts tests/meshBatch.test.ts
git commit -m "feat(mesh): add meshBatch() for multi-shape meshing"
```

---

### Task 3: Progressive LOD with Three.js

**Files:**

- Modify: `src/topology/meshFns.ts` (add `meshMultiLOD()`)
- Modify: `src/topology/threeHelpers.ts` (add `toLODGeometry()`)
- Modify: `tests/meshBatch.test.ts` (add LOD tests)

- [ ] **Step 1: Add meshMultiLOD to meshFns.ts**

```typescript
export interface MultiLODMesh {
  readonly coarse: ShapeMesh; // Fast preview (high tolerance)
  readonly fine: ShapeMesh; // Export quality (low tolerance)
}

/**
 * Produce coarse (preview) + fine (export) meshes in one logical call.
 * Coarse mesh is returned first for immediate display.
 */
export function meshMultiLOD(
  shape: Shape3D,
  options?: {
    readonly coarseTolerance?: number | undefined;
    readonly fineTolerance?: number | undefined;
    readonly angularTolerance?: number | undefined;
  }
): MultiLODMesh {
  const coarseTol = options?.coarseTolerance ?? 0.5;
  const fineTol = options?.fineTolerance ?? 0.05;
  const angTol = options?.angularTolerance ?? 0.5;

  const coarse = mesh(shape, { tolerance: coarseTol, angularTolerance: angTol });
  const fine = mesh(shape, { tolerance: fineTol, angularTolerance: angTol * 0.2 });

  return { coarse, fine };
}
```

- [ ] **Step 2: Add toLODGeometry to threeHelpers.ts**

````typescript
export interface LODGeometryData {
  readonly coarse: BufferGeometryData;
  readonly fine: BufferGeometryData;
  readonly coarseDistance: number;
  readonly fineDistance: number;
}

/**
 * Convert multi-LOD mesh to Three.js LOD-compatible geometry data.
 *
 * Usage with Three.js:
 * ```ts
 * const lod = new THREE.LOD();
 * const coarseGeo = toBufferGeometry(data.coarse);
 * const fineGeo = toBufferGeometry(data.fine);
 * lod.addLevel(new THREE.Mesh(fineGeo, mat), data.fineDistance);
 * lod.addLevel(new THREE.Mesh(coarseGeo, mat), data.coarseDistance);
 * ```
 */
export function toLODGeometryData(
  multiLOD: MultiLODMesh,
  distances?: { readonly coarse?: number | undefined; readonly fine?: number | undefined }
): LODGeometryData {
  return {
    coarse: toBufferGeometryData(multiLOD.coarse),
    fine: toBufferGeometryData(multiLOD.fine),
    coarseDistance: distances?.coarse ?? 50,
    fineDistance: distances?.fine ?? 0,
  };
}
````

- [ ] **Step 3: Add tests**

- [ ] **Step 4: Commit**

```bash
git add src/topology/meshFns.ts src/topology/threeHelpers.ts tests/meshBatch.test.ts
git commit -m "feat(mesh): add meshMultiLOD() + Three.js LOD helper"
```

---

### Task 4: Mesh batch benchmark

**Files:**

- Create: `benchmarks/mesh-batch.bench.test.ts`

- [ ] **Step 1: Write benchmark**

Compare batch meshing N shapes vs meshing them individually.

- [ ] **Step 2: Run baseline**

- [ ] **Step 3: Commit**

```bash
git add benchmarks/mesh-batch.bench.test.ts
git commit -m "test: add mesh batch benchmark"
```
