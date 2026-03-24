# OCCT Batch Extractors & Performance Instrumentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce boolean/sweep/modifier operation latency by adding C++ batch extractors that cross the WASM boundary once instead of N times, wire up the unused BooleanBatch extractor, and add operation-level performance instrumentation.

**Architecture:** New C++ batch classes (LoftBatch, ExtrudeBatch, ShellBatch, FilletBatch) follow the established extractor pattern in `defaults.yml` — data class with ownership-transfer copy ctor + static/instance extractor returning shapes via a shared `ShapeBatchResult` container. TypeScript adapters use lazy detection (`detectCpp*`) with JS fallback. A lightweight `PerfStats` module records per-category timing without affecting the public API.

**Tech Stack:** C++ (OCCT 7.8, Embind), TypeScript, Vitest

---

## File Structure

### New files

| File                                 | Responsibility                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| `src/kernel/perfStats.ts`            | Operation-level timing: start/stop/reset/getStats per category (kernel-agnostic) |
| `src/kernel/occt/booleanBatchOps.ts` | Wire up existing `BooleanBatch` C++ class for fuseAll/cutAll                     |
| `tests/perfStats.test.ts`            | Tests for PerfStats module                                                       |
| `tests/batchExtractors.test.ts`      | Tests for batch loft/extrude/shell/fillet C++ extractors                         |

### Modified files

| File                                                    | Changes                                                                                       |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `packages/brepjs-opencascade/build-source/defaults.yml` | Add ShapeBatchResult, LoftBatch, ExtrudeBatch, ShellBatch, FilletBatch C++ classes + bindings |
| `src/kernel/occt/sweepOps.ts`                           | Add `loftBatch()`, `extrudeBatch()` with C++ detection + JS fallback                          |
| `src/kernel/occt/modifierOps.ts`                        | Add `shellBatch()`, `filletBatch()` with C++ detection + JS fallback                          |
| `src/kernel/occt/booleanOps.ts`                         | Wire `fuseAllNative`/`cutAll` through BooleanBatch C++ when available                         |
| `src/kernel/occt/defaultAdapter.ts`                     | Delegate new batch methods                                                                    |
| `src/kernel/interfaces/sweepOps.ts`                     | Add optional `loftBatch`, `extrudeBatch` to interface                                         |
| `src/kernel/interfaces/modifierOps.ts`                  | Add optional `shellBatch`, `filletBatch` to interface                                         |
| `src/kernel/brepkit/brepkitAdapter.ts`                  | Add fallback implementations for new batch interface methods                                  |
| `src/kernel/index.ts`                                   | Import + call new detection cache resets, export `perfStats`                                  |
| `src/index.ts`                                          | Export `perfStats` (getPerformanceStats, resetPerformanceStats)                               |
| `src/topology/booleanFns.ts`                            | Use kernel batch methods in `fuseAll`/`cutAll`                                                |
| `src/operations/loftFns.ts`                             | Add `loftAll()` public function using kernel `loftBatch`                                      |
| `src/operations/extrudeFns.ts`                          | Add `extrudeAll()` public function using kernel `extrudeBatch`                                |

---

## Task 1: Performance Instrumentation (`PerfStats`)

**Files:**

- Create: `src/kernel/perfStats.ts`
- Create: `tests/perfStats.test.ts`
- Modify: `src/kernel/index.ts`
- Modify: `src/index.ts`

### Design

Lightweight timing module with zero allocation on the hot path. Each operation category has a cumulative duration counter. Consumers call `getPerformanceStats()` to read and `resetPerformanceStats()` to clear. Placed in `src/kernel/` (not `src/kernel/occt/`) because it's kernel-agnostic infrastructure.

Categories: `boolean`, `loft`, `extrude`, `shell`, `fillet`, `mesh`, `edgeMesh`, `transform`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/perfStats.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { perfTimer, getPerformanceStats, resetPerformanceStats } from '@/kernel/perfStats.js';
import type { PerfCategory } from '@/kernel/perfStats.js';

describe('PerfStats', () => {
  beforeEach(() => {
    resetPerformanceStats();
  });

  it('records timing for a category', () => {
    const end = perfTimer('boolean');
    // Simulate work
    let sum = 0;
    for (let i = 0; i < 1_000_000; i++) sum += i;
    void sum;
    end();

    const stats = getPerformanceStats();
    expect(stats.boolean.totalMs).toBeGreaterThan(0);
    expect(stats.boolean.count).toBe(1);
  });

  it('accumulates multiple calls', () => {
    perfTimer('loft')();
    perfTimer('loft')();
    perfTimer('loft')();

    const stats = getPerformanceStats();
    expect(stats.loft.count).toBe(3);
  });

  it('resets all categories', () => {
    perfTimer('mesh')();
    resetPerformanceStats();

    const stats = getPerformanceStats();
    expect(stats.mesh.count).toBe(0);
    expect(stats.mesh.totalMs).toBe(0);
  });

  it('isolates categories', () => {
    perfTimer('boolean')();

    const stats = getPerformanceStats();
    expect(stats.boolean.count).toBe(1);
    expect(stats.loft.count).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/perfStats.test.ts`
Expected: FAIL — module `@/kernel/perfStats.js` does not exist

- [ ] **Step 3: Implement PerfStats**

```typescript
// src/kernel/perfStats.ts

const CATEGORIES = [
  'boolean',
  'loft',
  'extrude',
  'shell',
  'fillet',
  'mesh',
  'edgeMesh',
  'transform',
] as const;

export type PerfCategory = (typeof CATEGORIES)[number];

interface CategoryStats {
  totalMs: number;
  count: number;
}

export type PerformanceStats = Record<PerfCategory, CategoryStats>;

// Mutable accumulators — no allocation on hot path
const _totals: Record<PerfCategory, number> = Object.create(null);
const _counts: Record<PerfCategory, number> = Object.create(null);

function _init(): void {
  for (const c of CATEGORIES) {
    _totals[c] = 0;
    _counts[c] = 0;
  }
}
_init();

/**
 * Start timing an operation. Returns a function to call when the operation completes.
 * Uses `performance.now()` for sub-millisecond precision.
 */
export function perfTimer(category: PerfCategory): () => void {
  const start = performance.now();
  return () => {
    _totals[category] += performance.now() - start;
    _counts[category]++;
  };
}

/** Read accumulated stats (non-destructive). */
export function getPerformanceStats(): PerformanceStats {
  const result = {} as PerformanceStats;
  for (const c of CATEGORIES) {
    result[c] = { totalMs: _totals[c], count: _counts[c] };
  }
  return result;
}

/** Reset all counters to zero. */
export function resetPerformanceStats(): void {
  _init();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/perfStats.test.ts`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Wire into kernel index and public API**

Add to `src/kernel/index.ts` (after existing imports):

```typescript
export { getPerformanceStats, resetPerformanceStats, perfTimer } from './perfStats.js';
export type { PerfCategory, PerformanceStats } from './perfStats.js';
```

Add to `src/index.ts` (in the kernel re-exports section):

```typescript
export { getPerformanceStats, resetPerformanceStats } from '@/kernel/index.js';
export type { PerformanceStats } from '@/kernel/perfStats.js';
```

- [ ] **Step 6: Add perfTimer calls to existing operations**

Instrument the hot-path kernel functions. In each file, import `perfTimer` and wrap the core operation:

**`src/kernel/occt/booleanOps.ts`** — wrap `fuse`, `cut`, `fuseAllNative`, `fuseAllPairwise`, `cutAll`:

```typescript
import { perfTimer } from '../perfStats.js';

// In fuseAllNative():
export function fuseAllNative(oc, shapes, options) {
  const end = perfTimer('boolean');
  try {
    // ... existing implementation ...
    return result;
  } finally {
    end();
  }
}
```

Apply same pattern to: `fuse`, `cut`, `intersect`, `cutAll`.

**`src/kernel/occt/sweepOps.ts`** — wrap `loft`, `extrude`:

```typescript
import { perfTimer } from '../perfStats.js';

export function loft(oc, wires, ruled, startShape, endShape) {
  const end = perfTimer('loft');
  try {
    // ... existing ...
    return result;
  } finally {
    end();
  }
}
```

Apply same pattern to `extrude` → `'extrude'`.

**`src/kernel/occt/modifierOps.ts`** — wrap `fillet`, `shell`:

```typescript
import { perfTimer } from '../perfStats.js';
```

Wrap `fillet` → `'fillet'`, `shell` → `'shell'`.

**`src/kernel/occt/meshOps.ts`** — wrap mesh extraction:
Wrap the mesh function → `'mesh'`, edge mesh → `'edgeMesh'`.

**`src/kernel/occt/transformOps.ts`** — wrap `transformBatch`:
Wrap → `'transform'`.

- [ ] **Step 7: Run validation**

Run: `npm run validate`
Expected: PASS (typecheck + lint + boundaries + format + tests)

- [ ] **Step 8: Commit**

```bash
git add src/kernel/perfStats.ts tests/perfStats.test.ts
git add src/kernel/index.ts src/index.ts
git add src/kernel/occt/booleanOps.ts src/kernel/occt/sweepOps.ts
git add src/kernel/occt/modifierOps.ts src/kernel/occt/meshOps.ts src/kernel/occt/transformOps.ts
git commit -m "feat(kernel): add operation-level performance instrumentation"
```

---

## Task 2: Wire Up Existing BooleanBatch C++ Extractor

**Files:**

- Create: `src/kernel/occt/booleanBatchOps.ts`
- Modify: `src/kernel/occt/booleanOps.ts`
- Modify: `src/kernel/index.ts`

### Context

The `BooleanBatch` C++ class already exists in the WASM build (`defaults.yml:537-601`) but is **completely unused** in the TypeScript layer. It supports `fuseAll(glueMode, simplify, fuzzyValue)` and `cutAll(base, glueMode, simplify, fuzzyValue)` with parallel execution and OBB enabled. Currently, the TS `fuseAllNative` creates OCCT objects directly via Embind (each `Append`, `SetArguments`, `Build`, `Shape` = 4+ WASM boundary crossings). The C++ `BooleanBatch` does all of this in one call.

- [ ] **Step 1: Write detection + adapter module**

```typescript
// src/kernel/occt/booleanBatchOps.ts
import type { KernelInstance, KernelShape, BooleanOptions } from '@/kernel/types.js';
import { perfTimer } from '../perfStats.js';

let hasCppBooleanBatch: boolean | undefined;

export function resetBooleanBatchDetectionCache(): void {
  hasCppBooleanBatch = undefined;
}

function detectCppBooleanBatch(oc: KernelInstance): boolean {
  hasCppBooleanBatch ??= typeof oc.BooleanBatch === 'function';
  return hasCppBooleanBatch;
}

function glueToInt(optimisation?: string): number {
  if (optimisation === 'commonFace') return 1;
  if (optimisation === 'sameFace') return 2;
  return 0;
}

/**
 * Attempt fuseAll via C++ BooleanBatch extractor.
 * Returns null if C++ extractor is not available.
 */
export function cppFuseAll(
  oc: KernelInstance,
  shapes: KernelShape[],
  options: BooleanOptions = {}
): KernelShape | null {
  /* v8 ignore start */
  if (!detectCppBooleanBatch(oc)) return null;

  const end = perfTimer('boolean');
  const batch = new oc.BooleanBatch();
  try {
    for (const s of shapes) {
      batch.addShape(s);
    }
    return batch.fuseAll(
      glueToInt(options.optimisation),
      !!options.simplify,
      options.fuzzyValue ?? 0
    );
  } finally {
    batch.delete();
    end();
  }
  /* v8 ignore stop */
}

/**
 * Attempt cutAll via C++ BooleanBatch extractor.
 * Returns null if C++ extractor is not available.
 */
export function cppCutAll(
  oc: KernelInstance,
  base: KernelShape,
  tools: KernelShape[],
  options: BooleanOptions = {}
): KernelShape | null {
  /* v8 ignore start */
  if (!detectCppBooleanBatch(oc)) return null;
  if (tools.length === 0) return base;

  const end = perfTimer('boolean');
  const batch = new oc.BooleanBatch();
  try {
    for (const t of tools) {
      batch.addShape(t);
    }
    return batch.cutAll(
      base,
      glueToInt(options.optimisation),
      !!options.simplify,
      options.fuzzyValue ?? 0
    );
  } finally {
    batch.delete();
    end();
  }
  /* v8 ignore stop */
}
```

- [ ] **Step 2: Integrate into booleanOps.ts**

Modify `src/kernel/occt/booleanOps.ts` — in `fuseAllNative()`, try C++ path first:

```typescript
import { cppFuseAll, cppCutAll } from './booleanBatchOps.js';

function fuseAllNative(oc, shapes, options) {
  // Try C++ batch path (single WASM call)
  const cppResult = cppFuseAll(oc, shapes, options);
  if (cppResult !== null) return cppResult;

  // JS fallback — existing implementation
  const end = perfTimer('boolean');
  try {
    // ... existing code ...
  } finally {
    end();
  }
}
```

Same pattern for `cutAll`:

```typescript
export function cutAll(oc, shape, tools, options) {
  const cppResult = cppCutAll(oc, shape, tools, options);
  if (cppResult !== null) return cppResult;

  // JS fallback — existing code
  if (tools.length === 0) return shape;
  const end = perfTimer('boolean');
  try {
    const toolCompound = buildCompound(oc, tools);
    const result = cut(oc, shape, toolCompound, options);
    toolCompound.delete();
    return result;
  } finally {
    end();
  }
}
```

- [ ] **Step 3: Add detection cache reset**

In `src/kernel/index.ts`, add:

```typescript
import { resetBooleanBatchDetectionCache } from './occt/booleanBatchOps.js';
```

In `initFromOC()`:

```typescript
resetBooleanBatchDetectionCache();
```

- [ ] **Step 4: Run validation**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/kernel/occt/booleanBatchOps.ts src/kernel/occt/booleanOps.ts src/kernel/index.ts
git commit -m "feat(kernel): wire up BooleanBatch C++ extractor for fuseAll/cutAll"
```

---

## Task 3: C++ ShapeBatchResult + LoftBatch Extractor

**Files:**

- Modify: `packages/brepjs-opencascade/build-source/defaults.yml`
- Modify: `src/kernel/occt/sweepOps.ts`
- Modify: `src/kernel/interfaces/sweepOps.ts`
- Modify: `src/kernel/occt/defaultAdapter.ts`
- Modify: `src/kernel/brepkit/brepkitAdapter.ts`
- Modify: `src/kernel/index.ts`

### Context

Gridfinity builds 25+ independent socket cell lofts (each with 5 wire profiles). Currently each loft crosses the WASM boundary ~8 times (new ThruSections, N×AddWire, new ProgressRange, Build, Shape, 2×delete). A `LoftBatch` C++ class accumulates entries and builds all lofts in one WASM call.

All batch extractors share a common `ShapeBatchResult` return type — an array of `TopoDS_Shape` with an ownership-transfer copy ctor, matching the `TopologyResult`/`TransformBatchResult` pattern.

- [ ] **Step 1: Write ShapeBatchResult + LoftBatch C++ classes**

Add to `defaults.yml` after `TransformBatch` class (after line 1180), and add `ShapeBatchResult` and `LoftBatch` to the `bindings()` list:

```cpp
class ShapeBatchResult {
public:
  ShapeBatchResult() : shapesPtr_(nullptr), shapesCount_(0) {}

  ~ShapeBatchResult() {
    delete[] shapesPtr_;
  }

  ShapeBatchResult(const ShapeBatchResult& other)
    : shapesPtr_(other.shapesPtr_), shapesCount_(other.shapesCount_) {
    auto& mutable_other = const_cast<ShapeBatchResult&>(other);
    mutable_other.shapesPtr_ = nullptr;
  }

  int getShapesCount() const { return shapesCount_; }
  TopoDS_Shape getShape(int index) const {
    if (index < 0 || index >= shapesCount_ || !shapesPtr_) return TopoDS_Shape();
    return shapesPtr_[index];
  }

private:
  TopoDS_Shape* shapesPtr_;
  int shapesCount_;

  friend class LoftBatch;
  friend class ExtrudeBatch;
  friend class ShellBatch;
  friend class FilletBatch;
};

class LoftBatch {
public:
  // Begin a new loft entry. Returns the entry index.
  int beginLoft(bool solid, bool ruled, double tolerance) {
    entries_.push_back({solid, ruled, tolerance, {}, TopoDS_Shape(), TopoDS_Shape(), false, false});
    return static_cast<int>(entries_.size()) - 1;
  }

  void addWire(int entryIndex, const TopoDS_Shape& wire) {
    if (entryIndex >= 0 && entryIndex < static_cast<int>(entries_.size())) {
      entries_[entryIndex].wires.push_back(wire);
    }
  }

  void setStartVertex(int entryIndex, const TopoDS_Shape& vertex) {
    if (entryIndex >= 0 && entryIndex < static_cast<int>(entries_.size())) {
      entries_[entryIndex].startVertex = vertex;
      entries_[entryIndex].hasStart = true;
    }
  }

  void setEndVertex(int entryIndex, const TopoDS_Shape& vertex) {
    if (entryIndex >= 0 && entryIndex < static_cast<int>(entries_.size())) {
      entries_[entryIndex].endVertex = vertex;
      entries_[entryIndex].hasEnd = true;
    }
  }

  void clear() { entries_.clear(); }
  int count() const { return static_cast<int>(entries_.size()); }

  ShapeBatchResult execute() {
    ShapeBatchResult result;
    result.shapesCount_ = static_cast<int>(entries_.size());
    if (result.shapesCount_ == 0) return result;

    result.shapesPtr_ = new TopoDS_Shape[result.shapesCount_];

    for (int i = 0; i < result.shapesCount_; i++) {
      const Entry& e = entries_[i];
      BRepOffsetAPI_ThruSections builder(e.solid, e.ruled, e.tolerance);

      if (e.hasStart) {
        builder.AddVertex(TopoDS::Vertex(e.startVertex));
      }
      for (const auto& wire : e.wires) {
        builder.AddWire(TopoDS::Wire(wire));
      }
      if (e.hasEnd) {
        builder.AddVertex(TopoDS::Vertex(e.endVertex));
      }

      Message_ProgressRange progress;
      builder.Build(progress);
      result.shapesPtr_[i] = builder.Shape();
    }

    return result;
  }

private:
  struct Entry {
    bool solid;
    bool ruled;
    double tolerance;
    std::vector<TopoDS_Shape> wires;
    TopoDS_Shape startVertex;
    TopoDS_Shape endVertex;
    bool hasStart;
    bool hasEnd;
  };
  std::vector<Entry> entries_;
};
```

Add to `bindings()` list:

```yaml
- symbol: ShapeBatchResult
- symbol: LoftBatch
```

- [ ] **Step 2: Add optional loftBatch to kernel interface**

In `src/kernel/interfaces/sweepOps.ts`, add (optional so brepkit doesn't need to implement it):

```typescript
/** Batch loft: build N independent lofts in a single WASM call. */
loftBatch?(
  entries: ReadonlyArray<{
    wires: KernelShape[];
    solid?: boolean;
    ruled?: boolean;
    tolerance?: number;
    startVertex?: KernelShape;
    endVertex?: KernelShape;
  }>
): KernelShape[];
```

- [ ] **Step 3: Implement loftBatch in sweepOps.ts with detection + fallback**

Add to `src/kernel/occt/sweepOps.ts`:

```typescript
import { perfTimer } from '../perfStats.js';

let hasCppLoftBatch: boolean | undefined;

export function resetLoftBatchDetectionCache(): void {
  hasCppLoftBatch = undefined;
}

function detectCppLoftBatch(oc: KernelInstance): boolean {
  hasCppLoftBatch ??= typeof oc.LoftBatch === 'function';
  return hasCppLoftBatch;
}

export interface LoftBatchEntry {
  wires: KernelShape[];
  solid?: boolean;
  ruled?: boolean;
  tolerance?: number;
  startVertex?: KernelShape;
  endVertex?: KernelShape;
}

export function loftBatch(oc: KernelInstance, entries: readonly LoftBatchEntry[]): KernelShape[] {
  if (entries.length === 0) return [];

  const end = perfTimer('loft');
  try {
    /* v8 ignore start */
    if (detectCppLoftBatch(oc)) {
      const batch = new oc.LoftBatch();
      try {
        for (const e of entries) {
          const idx = batch.beginLoft(
            e.solid ?? true,
            e.ruled ?? false,
            e.tolerance ?? 1e-6
          ) as number;
          if (e.startVertex) batch.setStartVertex(idx, e.startVertex);
          for (const wire of e.wires) {
            batch.addWire(idx, wire);
          }
          if (e.endVertex) batch.setEndVertex(idx, e.endVertex);
        }

        const result = batch.execute();
        try {
          const count = result.getShapesCount() as number;
          return Array.from({ length: count }, (_, i) => result.getShape(i));
        } finally {
          result.delete();
        }
      } finally {
        batch.delete();
      }
    }
    /* v8 ignore stop */

    // JS fallback — individual lofts
    return entries.map((e) => loft(oc, e.wires, e.ruled ?? false, e.startVertex, e.endVertex));
  } finally {
    end();
  }
}
```

- [ ] **Step 4: Wire into DefaultAdapter**

In `src/kernel/occt/defaultAdapter.ts`, add the import and delegation:

```typescript
import { loftBatch as _loftBatch, resetLoftBatchDetectionCache } from './sweepOps.js';
```

Add method to class:

```typescript
loftBatch(entries: ReadonlyArray<LoftBatchEntry>): KernelShape[] {
  return _loftBatch(this.oc, entries);
}
```

- [ ] **Step 5: Add detection cache reset to kernel/index.ts**

```typescript
import { resetLoftBatchDetectionCache } from './occt/sweepOps.js';
```

In `initFromOC()`:

```typescript
resetLoftBatchDetectionCache();
```

- [ ] **Step 6: Run validation**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/brepjs-opencascade/build-source/defaults.yml
git add src/kernel/occt/sweepOps.ts src/kernel/interfaces/sweepOps.ts
git add src/kernel/occt/defaultAdapter.ts src/kernel/index.ts
git commit -m "feat(kernel): add ShapeBatchResult + LoftBatch C++ extractor"
```

---

## Task 4: C++ ExtrudeBatch Extractor

**Files:**

- Modify: `packages/brepjs-opencascade/build-source/defaults.yml`
- Modify: `src/kernel/occt/sweepOps.ts`
- Modify: `src/kernel/interfaces/sweepOps.ts`
- Modify: `src/kernel/occt/defaultAdapter.ts`
- Modify: `src/kernel/index.ts`

- [ ] **Step 1: Write ExtrudeBatch C++ class**

Add to `defaults.yml` after LoftBatch. Reuses `ShapeBatchResult` (already has `friend class ExtrudeBatch;`):

```cpp
class ExtrudeBatch {
public:
  void addExtrude(const TopoDS_Shape& face, double dx, double dy, double dz) {
    entries_.push_back({face, dx, dy, dz});
  }

  void clear() { entries_.clear(); }
  int count() const { return static_cast<int>(entries_.size()); }

  ShapeBatchResult execute() {
    ShapeBatchResult result;
    result.shapesCount_ = static_cast<int>(entries_.size());
    if (result.shapesCount_ == 0) return result;

    result.shapesPtr_ = new TopoDS_Shape[result.shapesCount_];

    for (int i = 0; i < result.shapesCount_; i++) {
      const Entry& e = entries_[i];
      gp_Vec vec(e.dx, e.dy, e.dz);
      BRepPrimAPI_MakePrism maker(e.face, vec, Standard_False, Standard_True);
      result.shapesPtr_[i] = maker.Shape();
    }

    return result;
  }

private:
  struct Entry {
    TopoDS_Shape face;
    double dx, dy, dz;
  };
  std::vector<Entry> entries_;
};
```

Add binding:

```yaml
- symbol: ExtrudeBatch
```

- [ ] **Step 2: Add optional extrudeBatch to kernel interface**

In `src/kernel/interfaces/sweepOps.ts`:

```typescript
/** Batch extrude: build N independent extrusions in a single WASM call. */
extrudeBatch?(
  entries: ReadonlyArray<{
    face: KernelShape;
    direction: [number, number, number];
    length: number;
  }>
): KernelShape[];
```

- [ ] **Step 3: Implement extrudeBatch in sweepOps.ts**

```typescript
let hasCppExtrudeBatch: boolean | undefined;

export function resetExtrudeBatchDetectionCache(): void {
  hasCppExtrudeBatch = undefined;
}

function detectCppExtrudeBatch(oc: KernelInstance): boolean {
  hasCppExtrudeBatch ??= typeof oc.ExtrudeBatch === 'function';
  return hasCppExtrudeBatch;
}

export interface ExtrudeBatchEntry {
  face: KernelShape;
  direction: [number, number, number];
  length: number;
}

export function extrudeBatch(
  oc: KernelInstance,
  entries: readonly ExtrudeBatchEntry[]
): KernelShape[] {
  if (entries.length === 0) return [];

  const end = perfTimer('extrude');
  try {
    /* v8 ignore start */
    if (detectCppExtrudeBatch(oc)) {
      const batch = new oc.ExtrudeBatch();
      try {
        for (const e of entries) {
          batch.addExtrude(
            e.face,
            e.direction[0] * e.length,
            e.direction[1] * e.length,
            e.direction[2] * e.length
          );
        }

        const result = batch.execute();
        try {
          const count = result.getShapesCount() as number;
          return Array.from({ length: count }, (_, i) => result.getShape(i));
        } finally {
          result.delete();
        }
      } finally {
        batch.delete();
      }
    }
    /* v8 ignore stop */

    // JS fallback
    return entries.map((e) => extrude(oc, e.face, e.direction, e.length));
  } finally {
    end();
  }
}
```

- [ ] **Step 4: Wire into DefaultAdapter + detection cache reset**

Same pattern as Task 3.

- [ ] **Step 5: Run validation**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/brepjs-opencascade/build-source/defaults.yml
git add src/kernel/occt/sweepOps.ts src/kernel/interfaces/sweepOps.ts
git add src/kernel/occt/defaultAdapter.ts src/kernel/index.ts
git commit -m "feat(kernel): add ExtrudeBatch C++ extractor for batch extrusions"
```

---

## Task 5: C++ ShellBatch Extractor

**Files:**

- Modify: `packages/brepjs-opencascade/build-source/defaults.yml`
- Modify: `src/kernel/occt/modifierOps.ts`
- Modify: `src/kernel/interfaces/modifierOps.ts`
- Modify: `src/kernel/occt/defaultAdapter.ts`
- Modify: `src/kernel/index.ts`

- [ ] **Step 1: Write ShellBatch C++ class**

```cpp
class ShellBatch {
public:
  int beginShell(const TopoDS_Shape& shape, double thickness, double tolerance) {
    entries_.push_back({shape, {}, thickness, tolerance});
    return static_cast<int>(entries_.size()) - 1;
  }

  void addFaceToRemove(int entryIndex, const TopoDS_Shape& face) {
    if (entryIndex >= 0 && entryIndex < static_cast<int>(entries_.size())) {
      entries_[entryIndex].facesToRemove.push_back(face);
    }
  }

  void clear() { entries_.clear(); }
  int count() const { return static_cast<int>(entries_.size()); }

  ShapeBatchResult execute() {
    ShapeBatchResult result;
    result.shapesCount_ = static_cast<int>(entries_.size());
    if (result.shapesCount_ == 0) return result;

    result.shapesPtr_ = new TopoDS_Shape[result.shapesCount_];

    for (int i = 0; i < result.shapesCount_; i++) {
      const Entry& e = entries_[i];

      TopTools_ListOfShape facesToRemove;
      for (const auto& face : e.facesToRemove) {
        facesToRemove.Append(face);
      }

      Message_ProgressRange progress;
      BRepOffsetAPI_MakeThickSolid builder;
      builder.MakeThickSolidByJoin(
        e.shape,
        facesToRemove,
        -e.thickness,
        e.tolerance,
        BRepOffset_Skin,
        Standard_False,
        Standard_False,
        GeomAbs_Arc,
        Standard_False,
        progress
      );
      result.shapesPtr_[i] = builder.Shape();
    }

    return result;
  }

private:
  struct Entry {
    TopoDS_Shape shape;
    std::vector<TopoDS_Shape> facesToRemove;
    double thickness;
    double tolerance;
  };
  std::vector<Entry> entries_;
};
```

Add binding:

```yaml
- symbol: ShellBatch
```

- [ ] **Step 2: Add optional shellBatch to kernel interface**

In `src/kernel/interfaces/modifierOps.ts`:

```typescript
/** Batch shell: hollow N solids in a single WASM call. */
shellBatch?(
  entries: ReadonlyArray<{
    shape: KernelShape;
    faces: KernelShape[];
    thickness: number;
    tolerance?: number;
  }>
): KernelShape[];
```

- [ ] **Step 3: Implement shellBatch in modifierOps.ts with detection + fallback**

Follow the same pattern as loftBatch/extrudeBatch. Detection flag `hasCppShellBatch`, detect via `typeof oc.ShellBatch === 'function'`, fallback to individual `shell()` calls.

- [ ] **Step 4: Wire into DefaultAdapter + detection cache reset**

Same pattern as Tasks 3-4.

- [ ] **Step 5: Run validation**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/brepjs-opencascade/build-source/defaults.yml
git add src/kernel/occt/modifierOps.ts src/kernel/interfaces/modifierOps.ts
git add src/kernel/occt/defaultAdapter.ts src/kernel/index.ts
git commit -m "feat(kernel): add ShellBatch C++ extractor for batch shell operations"
```

---

## Task 6: C++ FilletBatch Extractor

**Files:**

- Modify: `packages/brepjs-opencascade/build-source/defaults.yml`
- Modify: `src/kernel/occt/modifierOps.ts`
- Modify: `src/kernel/interfaces/modifierOps.ts`
- Modify: `src/kernel/occt/defaultAdapter.ts`
- Modify: `src/kernel/index.ts`

- [ ] **Step 1: Write FilletBatch C++ class**

Note: `addEdge` and `addEdgeVariable` take `const TopoDS_Shape&` (not `TopoDS_Edge`) because Embind passes shapes as `TopoDS_Shape`. The downcast to `TopoDS_Edge` happens inside C++.

```cpp
class FilletBatch {
public:
  int beginFillet(const TopoDS_Shape& shape) {
    entries_.push_back({shape, {}});
    return static_cast<int>(entries_.size()) - 1;
  }

  void addEdge(int entryIndex, const TopoDS_Shape& shape, double radius) {
    if (entryIndex >= 0 && entryIndex < static_cast<int>(entries_.size())) {
      TopoDS_Edge edge = TopoDS::Edge(shape);
      entries_[entryIndex].edges.push_back({edge, radius, radius, false});
    }
  }

  void addEdgeVariable(int entryIndex, const TopoDS_Shape& shape, double r1, double r2) {
    if (entryIndex >= 0 && entryIndex < static_cast<int>(entries_.size())) {
      TopoDS_Edge edge = TopoDS::Edge(shape);
      entries_[entryIndex].edges.push_back({edge, r1, r2, true});
    }
  }

  void clear() { entries_.clear(); }
  int count() const { return static_cast<int>(entries_.size()); }

  ShapeBatchResult execute() {
    ShapeBatchResult result;
    result.shapesCount_ = static_cast<int>(entries_.size());
    if (result.shapesCount_ == 0) return result;

    result.shapesPtr_ = new TopoDS_Shape[result.shapesCount_];

    for (int i = 0; i < result.shapesCount_; i++) {
      const Entry& e = entries_[i];

      BRepFilletAPI_MakeFillet builder(e.shape, ChFi3d_Rational);
      for (const auto& edgeInfo : e.edges) {
        if (edgeInfo.variable) {
          builder.Add(edgeInfo.r1, edgeInfo.r2, edgeInfo.edge);
        } else {
          builder.Add(edgeInfo.r1, edgeInfo.edge);
        }
      }

      Message_ProgressRange progress;
      builder.Build(progress);
      result.shapesPtr_[i] = builder.Shape();
    }

    return result;
  }

private:
  struct EdgeInfo {
    TopoDS_Edge edge;
    double r1;
    double r2;
    bool variable;
  };
  struct Entry {
    TopoDS_Shape shape;
    std::vector<EdgeInfo> edges;
  };
  std::vector<Entry> entries_;
};
```

Add binding:

```yaml
- symbol: FilletBatch
```

- [ ] **Step 2: Add optional filletBatch to kernel interface**

In `src/kernel/interfaces/modifierOps.ts`:

```typescript
/** Batch fillet: round edges on N solids in a single WASM call. */
filletBatch?(
  entries: ReadonlyArray<{
    shape: KernelShape;
    edges: Array<{ edge: KernelShape; radius: number } | { edge: KernelShape; r1: number; r2: number }>;
  }>
): KernelShape[];
```

- [ ] **Step 3: Implement filletBatch in modifierOps.ts with detection + fallback**

Same detection pattern. The JS fallback must distinguish constant vs variable radius entries:

```typescript
// Fallback: convert batch entries to individual fillet() calls
return entries.map((e) => {
  const edges = e.edges.map((ei) => ei.edge);
  const firstEntry = e.edges[0];
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- length checked by caller
  const radius =
    'r1' in firstEntry! ? ([firstEntry.r1, firstEntry.r2] as [number, number]) : firstEntry!.radius;
  return fillet(oc, e.shape, edges, radius);
});
```

- [ ] **Step 4: Wire into DefaultAdapter + detection cache reset**

Same pattern.

- [ ] **Step 5: Run validation**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/brepjs-opencascade/build-source/defaults.yml
git add src/kernel/occt/modifierOps.ts src/kernel/interfaces/modifierOps.ts
git add src/kernel/occt/defaultAdapter.ts src/kernel/index.ts
git commit -m "feat(kernel): add FilletBatch C++ extractor for batch fillet operations"
```

---

## Task 7: Public API — loftAll() and extrudeAll()

**Files:**

- Modify: `src/operations/loftFns.ts`
- Modify: `src/operations/extrudeFns.ts`
- Modify: `src/index.ts`
- Create: `tests/batchExtractors.test.ts`

### Context

Expose batch operations at the public API level so gridfinity-layout-tool can call `loftAll(entries)` instead of looping `loft()`.

- [ ] **Step 1: Write failing tests**

```typescript
// tests/batchExtractors.test.ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import {
  loftAll,
  extrudeAll,
  draw,
  drawRoundedRectangle,
  getPerformanceStats,
  resetPerformanceStats,
} from '@/index.js';
import { initOC } from './setup.js';
import { unwrap } from '@/core/result.js';

describe('Batch extractors', () => {
  beforeAll(async () => {
    await initOC();
  }, 30000);

  beforeEach(() => {
    resetPerformanceStats();
  });

  describe('loftAll', () => {
    it('builds multiple independent lofts', () => {
      const wire1a = unwrap(drawRoundedRectangle(10, 10, 1));
      const wire1b = unwrap(drawRoundedRectangle(8, 8, 1, { at: [0, 0, 5] }));
      const wire2a = unwrap(drawRoundedRectangle(20, 20, 2));
      const wire2b = unwrap(drawRoundedRectangle(18, 18, 2, { at: [0, 0, 10] }));

      const results = unwrap(
        loftAll([
          { wires: [wire1a, wire1b], ruled: true },
          { wires: [wire2a, wire2b], ruled: true },
        ])
      );

      expect(results).toHaveLength(2);
      for (const r of results) {
        expect(r).toBeDefined();
      }

      const stats = getPerformanceStats();
      expect(stats.loft.count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('extrudeAll', () => {
    it('builds multiple independent extrusions', () => {
      const face1 = unwrap(draw((d) => d.hLine(10).vLine(10).hLine(-10).close()));
      const face2 = unwrap(draw((d) => d.hLine(20).vLine(5).hLine(-20).close()));

      const results = unwrap(
        extrudeAll([
          { face: face1, height: 5 },
          { face: face2, height: 10 },
        ])
      );

      expect(results).toHaveLength(2);

      const stats = getPerformanceStats();
      expect(stats.extrude.count).toBeGreaterThanOrEqual(1);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/batchExtractors.test.ts`
Expected: FAIL — `loftAll` and `extrudeAll` not exported

- [ ] **Step 3: Implement loftAll**

In `src/operations/loftFns.ts`:

```typescript
import { getKernel } from '@/kernel/index.js';
import { ok, type Result } from '@/core/result.js';
import type { Wire } from '@/core/shapeTypes.js';
import type { Shape3D, Vec3 } from '@/core/shapeTypes.js';

export interface LoftAllEntry {
  wires: Wire[];
  ruled?: boolean;
  startPoint?: Vec3;
  endPoint?: Vec3;
  tolerance?: number;
}

export function loftAll(entries: readonly LoftAllEntry[]): Result<Shape3D[]> {
  if (entries.length === 0) return ok([]);

  const kernel = getKernel();
  const kernelEntries = entries.map((e) => ({
    wires: e.wires.map((w) => w.wrapped),
    solid: true,
    ruled: e.ruled ?? true,
    tolerance: e.tolerance ?? 1e-6,
    startVertex: e.startPoint ? kernel.makeVertex(...e.startPoint) : undefined,
    endVertex: e.endPoint ? kernel.makeVertex(...e.endPoint) : undefined,
  }));

  const shapes =
    kernel.loftBatch?.(kernelEntries) ??
    kernelEntries.map((e) => kernel.loft(e.wires, e.ruled, undefined, undefined));
  return ok(shapes.map((s) => kernel.downcast(s, 'solid') as Shape3D));
}
```

- [ ] **Step 4: Implement extrudeAll**

In `src/operations/extrudeFns.ts`:

```typescript
import type { OrientedFace, PlanarFace, ValidSolid, Vec3 } from '@/core/shapeTypes.js';

export interface ExtrudeAllEntry {
  face: OrientedFace & PlanarFace;
  height: number | Vec3;
}

export function extrudeAll(entries: readonly ExtrudeAllEntry[]): Result<ValidSolid[]> {
  if (entries.length === 0) return ok([]);

  const kernel = getKernel();
  const kernelEntries = entries.map((e) => {
    const vec = typeof e.height === 'number' ? ([0, 0, e.height] as Vec3) : e.height;
    const length = Math.sqrt(vec[0] ** 2 + vec[1] ** 2 + vec[2] ** 2);
    const direction: [number, number, number] =
      length > 0 ? [vec[0] / length, vec[1] / length, vec[2] / length] : [0, 0, 1];
    return { face: e.face.wrapped, direction, length };
  });

  const shapes =
    kernel.extrudeBatch?.(kernelEntries) ??
    kernelEntries.map((e) => kernel.extrude(e.face, e.direction, e.length));
  return ok(shapes.map((s) => kernel.downcast(s, 'solid') as ValidSolid));
}
```

- [ ] **Step 5: Export from index.ts**

Add to `src/index.ts`:

```typescript
export { loftAll } from '@/operations/loftFns.js';
export { extrudeAll } from '@/operations/extrudeFns.js';
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/batchExtractors.test.ts`
Expected: PASS

- [ ] **Step 7: Run full validation**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/operations/loftFns.ts src/operations/extrudeFns.ts
git add src/index.ts tests/batchExtractors.test.ts
git commit -m "feat: add loftAll() and extrudeAll() public batch APIs"
```

---

## Task 8: Boolean Parameter Optimization

**Files:**

- Modify: `src/kernel/occt/booleanOps.ts`

### Context

Review and tune the default boolean parameters for gridfinity's shape patterns:

- **Fuzzy tolerance**: OCCT default is `Precision::Confusion()` (~1e-7). For gridfinity's mm-scale geometry, a slightly larger fuzzy value (1e-5) can speed up vertex merging without affecting accuracy.
- **OBB rejection**: Already enabled — verify it's set for all boolean paths.

- [ ] **Step 1: Add smart fuzzy value calculation**

In `src/kernel/occt/booleanOps.ts`:

```typescript
/**
 * Compute a sensible fuzzy value based on shape bounding box diagonal.
 * Returns 0 (no fuzzy) for small shapes, 1e-5 for mm-scale shapes.
 */
function autoFuzzyValue(oc: KernelInstance, shapes: KernelShape[]): number {
  // Only compute for multi-shape operations where vertex merging matters
  if (shapes.length < 3) return 0;

  // Use first shape's bounding box as representative
  const firstShape = shapes[0];
  if (!firstShape) return 0;

  const box = new oc.Bnd_Box_1();
  oc.BRepBndLib.Add(firstShape, box, true);
  if (box.IsVoid()) {
    box.delete();
    return 0;
  }
  const xMin = box.CornerMin().X() as number;
  const yMin = box.CornerMin().Y() as number;
  const zMin = box.CornerMin().Z() as number;
  const xMax = box.CornerMax().X() as number;
  const yMax = box.CornerMax().Y() as number;
  const zMax = box.CornerMax().Z() as number;
  box.delete();

  const diagonal = Math.sqrt((xMax - xMin) ** 2 + (yMax - yMin) ** 2 + (zMax - zMin) ** 2);

  // 1e-5 for shapes > 1mm diagonal, 0 for sub-mm geometry
  return diagonal > 1 ? 1e-5 : 0;
}
```

- [ ] **Step 2: Apply autoFuzzy in fuseAllNative when no explicit fuzzyValue is set**

```typescript
function fuseAllNative(oc, shapes, options) {
  // ... existing setup ...
  const fuzzy = options.fuzzyValue ?? autoFuzzyValue(oc, shapes);
  applyBooleanDefaults(builder, fuzzy);
  // ... rest ...
}
```

- [ ] **Step 3: Run existing boolean tests to verify no regressions**

Run: `npx vitest run tests/booleanFns.test.ts`
Expected: PASS

- [ ] **Step 4: Run full validation**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/kernel/occt/booleanOps.ts
git commit -m "feat(kernel): add auto-fuzzy value for multi-shape boolean operations"
```

---

## Task 9: Integration Test with Performance Measurement

**Files:**

- Modify: `tests/batchExtractors.test.ts`

- [ ] **Step 1: Add gridfinity-like integration test**

```typescript
describe('gridfinity-like performance test', () => {
  it('batch loft builds multiple socket-like cells', () => {
    // Build 9 socket cell profiles (3×3 grid)
    const cellEntries: LoftAllEntry[] = [];
    for (let x = 0; x < 3; x++) {
      for (let y = 0; y < 3; y++) {
        const cx = x * 42;
        const cy = y * 42;
        const topWire = unwrap(drawRoundedRectangle(41, 41, 2, { at: [cx, cy, 0] }));
        const botWire = unwrap(drawRoundedRectangle(39, 39, 1, { at: [cx, cy, -5] }));
        cellEntries.push({ wires: [topWire, botWire], ruled: true });
      }
    }

    resetPerformanceStats();
    const results = unwrap(loftAll(cellEntries));
    expect(results).toHaveLength(9);

    const stats = getPerformanceStats();
    expect(stats.loft.totalMs).toBeGreaterThan(0);
  });

  it('perf stats accumulate across boolean + loft operations', () => {
    resetPerformanceStats();

    // Loft
    const wire1 = unwrap(drawRoundedRectangle(10, 10, 1));
    const wire2 = unwrap(drawRoundedRectangle(8, 8, 1, { at: [0, 0, 5] }));
    unwrap(loftAll([{ wires: [wire1, wire2], ruled: true }]));

    // Boolean
    const face1 = unwrap(draw((d) => d.hLine(10).vLine(10).hLine(-10).close()));
    const face2 = unwrap(draw((d) => d.hLine(5).vLine(5).hLine(-5).close()));
    const box1 = unwrap(extrude(face1, 5));
    const box2 = unwrap(extrude(face2, 10));
    unwrap(fuse(box1, box2));

    const stats = getPerformanceStats();
    expect(stats.loft.count).toBeGreaterThanOrEqual(1);
    expect(stats.boolean.count).toBeGreaterThanOrEqual(1);
    expect(stats.extrude.count).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/batchExtractors.test.ts`
Expected: PASS

- [ ] **Step 3: Run full validation**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add tests/batchExtractors.test.ts
git commit -m "test: add gridfinity-like batch extractor integration tests"
```

---

## Summary

| Task                            | Impact                  | C++ Changes           | TS Changes                      |
| ------------------------------- | ----------------------- | --------------------- | ------------------------------- |
| 1. PerfStats                    | Instrumentation         | None                  | New module + instrument 6 files |
| 2. BooleanBatch wiring          | High                    | None (already exists) | New adapter + modify booleanOps |
| 3. ShapeBatchResult + LoftBatch | High (25+ socket cells) | New C++ classes       | Detection + fallback pattern    |
| 4. ExtrudeBatch                 | Medium (feature walls)  | New C++ class         | Detection + fallback pattern    |
| 5. ShellBatch                   | Low (1 per bin)         | New C++ class         | Detection + fallback pattern    |
| 6. FilletBatch                  | Low (optional scoops)   | New C++ class         | Detection + fallback pattern    |
| 7. Public API                   | Usability               | None                  | loftAll, extrudeAll             |
| 8. Boolean params               | Medium                  | None                  | autoFuzzy heuristic             |
| 9. Integration tests            | Validation              | None                  | Test coverage                   |

### Task dependencies

- Tasks 1 → 2 (PerfStats needed by booleanBatchOps)
- Tasks 3, 4, 5, 6 are independent (can be parallelized after Task 1)
- Task 7 depends on Tasks 3 + 4
- Task 8 is independent
- Task 9 depends on Tasks 1 + 7

### Expected impact for gridfinity-layout-tool

- **Task 2** (BooleanBatch wiring): **Biggest immediate win** — reduces WASM boundary crossings for every fuseAll/cutAll from O(N) to O(1). Already compiled, just needs TS wiring.
- **Task 3** (LoftBatch): **Second biggest win** — 25+ socket cell lofts in one WASM call instead of 25 separate calls with ~8 boundary crossings each.
- **Task 8** (autoFuzzy): **Free speed** — OCCT's boolean algorithm converges faster with appropriate fuzzy tolerance.

### WASM rebuild note

Tasks 3-6 add new C++ classes to `defaults.yml`. These changes only take effect after rebuilding the WASM binary via the Docker build pipeline. Tasks 1, 2, 7, 8, 9 work immediately with the existing WASM build (Task 2 wires up `BooleanBatch` which is already compiled but unused).
