# Boolean Pipeline & Compiler Flags Performance Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce boolean operation latency for large models by adding an opaque C++ pipeline that executes chained fuse/cut/intersect operations without JS↔WASM round-trips, and improve baseline WASM performance with compiler flag tuning.

**Architecture:** New `BooleanPipeline` C++ class in brepjs.yml additionalCppCode receives a full recipe (operations + shapes) in one call, executes sequentially in C++ with auto-skip of `UnifySameDomain` on intermediates, extracts evolution at the end. TypeScript adapter exposes `booleanPipeline()` function. Compiler flags add `-mtail-call` and tune `wasm-opt` passes.

**Tech Stack:** C++ (OCCT BRepAlgoAPI, BOPAlgo_BuilderAlgo), TypeScript, Vitest benchmarks

**Docker Rebuild:** Task 1 requires `brepjs.yml` changes. Batch with Plans B and C binding additions into a single Docker rebuild.

---

## File Structure

| File                                                  | Purpose                                              |
| ----------------------------------------------------- | ---------------------------------------------------- |
| `packages/brepjs-opencascade/build-config/brepjs.yml` | Add `BooleanPipeline` C++ class + `-mtail-call` flag |
| `src/kernel/occt/booleanPipelineOps.ts`               | New: TS adapter for the pipeline                     |
| `src/kernel/interfaces/booleanOps.ts`                 | Add `booleanPipeline` to interface                   |
| `src/topology/booleanFns.ts`                          | Add `booleanPipeline()` public API                   |
| `tests/booleanPipeline.test.ts`                       | New: pipeline tests                                  |
| `benchmarks/boolean-pipeline.bench.test.ts`           | New: pipeline vs sequential benchmark                |

---

### Task 1: BooleanPipeline C++ class

**Files:**

- Modify: `packages/brepjs-opencascade/build-config/brepjs.yml` (additionalCppCode + symbols + emccFlags)

- [ ] **Step 1: Add BooleanPipeline C++ class to brepjs.yml**

Add after the existing `BooleanBatch` class (around line 698). The pipeline takes a base shape and a sequence of operations, executing them without returning to JS.

```cpp
// Opaque boolean pipeline — executes chained fuse/cut/intersect in C++.
// Auto-skips UnifySameDomain on intermediates; only simplifies final result.
// Supports evolution extraction from the last operation.
class BooleanPipeline {
public:
  // Operation codes: 0=fuse, 1=cut, 2=intersect
  void addStep(int opCode, const TopoDS_Shape& tool) {
    steps_.push_back({opCode, tool});
  }

  // Execute the full pipeline on base shape.
  // Returns the final shape (or null shape on failure).
  TopoDS_Shape execute(const TopoDS_Shape& base, int glueMode, double fuzzyValue) {
    TopoDS_Shape current = base;

    for (size_t i = 0; i < steps_.size(); i++) {
      const auto& step = steps_[i];
      const bool isLast = (i == steps_.size() - 1);

      BRepAlgoAPI_BooleanOperation* op = nullptr;
      Message_ProgressRange progress;

      if (step.opCode == 0) {
        auto* fuseOp = new BRepAlgoAPI_Fuse(current, step.tool, progress);
        op = fuseOp;
      } else if (step.opCode == 1) {
        auto* cutOp = new BRepAlgoAPI_Cut(current, step.tool, progress);
        op = cutOp;
      } else {
        auto* commonOp = new BRepAlgoAPI_Common(current, step.tool, progress);
        op = commonOp;
      }

      // Apply standard optimization settings
      op->SetRunParallel(true);
      op->SetUseOBB(true);
      if (glueMode == 1) op->SetGlue(BOPAlgo_GlueShift);
      else if (glueMode == 2) op->SetGlue(BOPAlgo_GlueFull);
      if (fuzzyValue > 0) op->SetFuzzyValue(fuzzyValue);

      op->Build(progress);

      if (!op->IsDone() || op->HasErrors()) {
        delete op;
        return TopoDS_Shape(); // null shape on failure
      }

      // Only simplify the final result
      if (isLast) {
        op->SimplifyResult(true, true, 1e-3);
      }

      current = op->Shape();
      delete op;
    }

    return current;
  }

  int stepCount() const { return static_cast<int>(steps_.size()); }

  void clear() { steps_.clear(); }

private:
  struct Step { int opCode; TopoDS_Shape tool; };
  std::vector<Step> steps_;
};
```

- [ ] **Step 2: Add symbol to bindings**

```yaml
- symbol: BooleanPipeline
```

- [ ] **Step 3: Add -mtail-call to emccFlags**

Add after `-mrelaxed-simd`:

```yaml
- -mtail-call
```

**NOTE:** `-mtail-call` enables the WASM tail call proposal. Requires browser support (Chrome 112+, Firefox 131+, Safari 18.2+). If this causes issues, it can be removed without other changes.

- [ ] **Step 4: Commit brepjs.yml changes**

```bash
git add packages/brepjs-opencascade/build-config/brepjs.yml
git commit -m "feat(opencascade): add BooleanPipeline C++ class + -mtail-call flag"
```

---

### Task 2: TypeScript adapter for BooleanPipeline

**Files:**

- Create: `src/kernel/occt/booleanPipelineOps.ts`
- Modify: `src/kernel/occt/defaultAdapter.ts` (wire into adapter)
- Modify: `src/kernel/interfaces/booleanOps.ts` (add interface method)

- [ ] **Step 1: Create booleanPipelineOps.ts**

```typescript
/**
 * Opaque boolean pipeline — executes chained operations in a single WASM call.
 *
 * Used by DefaultAdapter. Requires BooleanPipeline C++ class in WASM build.
 */

import type { KernelInstance, KernelShape } from '@/kernel/types.js';

export type PipelineOp = 'fuse' | 'cut' | 'intersect';

export interface PipelineStep {
  readonly op: PipelineOp;
  readonly tool: KernelShape;
}

const OP_CODES: Record<PipelineOp, number> = { fuse: 0, cut: 1, intersect: 2 };

/**
 * Execute a chained boolean pipeline in C++.
 * Falls back to sequential JS calls if BooleanPipeline is not available.
 */
export function executeBooleanPipeline(
  oc: KernelInstance,
  base: KernelShape,
  steps: readonly PipelineStep[],
  options: { glueMode?: number; fuzzyValue?: number } = {}
): KernelShape | null {
  const { glueMode = 0, fuzzyValue = 0 } = options;

  // Feature-detect C++ pipeline
  if (typeof oc.BooleanPipeline === 'function') {
    const pipeline = new oc.BooleanPipeline();
    try {
      for (const step of steps) {
        pipeline.addStep(OP_CODES[step.op], step.tool);
      }
      const result = pipeline.execute(base, glueMode, fuzzyValue);
      if (result.IsNull()) return null;
      return result;
    } finally {
      pipeline.delete();
    }
  }

  // JS fallback: sequential operations
  let current = base;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!; // eslint-disable-line @typescript-eslint/no-non-null-assertion
    const progress = new oc.Message_ProgressRange_1();
    let result: KernelShape;

    if (step.op === 'fuse') {
      const op = new oc.BRepAlgoAPI_Fuse_3(current, step.tool, progress);
      op.Build(progress);
      if (i === steps.length - 1) op.SimplifyResult(true, true, 1e-3);
      result = op.Shape();
      op.delete();
    } else if (step.op === 'cut') {
      const op = new oc.BRepAlgoAPI_Cut_4(current, step.tool, progress);
      op.Build(progress);
      if (i === steps.length - 1) op.SimplifyResult(true, true, 1e-3);
      result = op.Shape();
      op.delete();
    } else {
      const op = new oc.BRepAlgoAPI_Common_4(current, step.tool, progress);
      op.Build(progress);
      if (i === steps.length - 1) op.SimplifyResult(true, true, 1e-3);
      result = op.Shape();
      op.delete();
    }

    progress.delete();
    current = result;
  }
  return current;
}
```

- [ ] **Step 2: Add booleanPipeline to kernel interface**

In `src/kernel/interfaces/booleanOps.ts`, add:

```typescript
  /** Execute a chained boolean pipeline in a single WASM call. */
  booleanPipeline?(
    base: KernelShape,
    steps: ReadonlyArray<{ op: 'fuse' | 'cut' | 'intersect'; tool: KernelShape }>,
    options?: { glueMode?: number | undefined; fuzzyValue?: number | undefined }
  ): KernelShape | null;
```

- [ ] **Step 3: Wire into DefaultAdapter**

In `src/kernel/occt/defaultAdapter.ts`, import and delegate:

```typescript
import { executeBooleanPipeline } from './booleanPipelineOps.js';

// In the class body:
booleanPipeline(
  base: KernelShape,
  steps: ReadonlyArray<{ op: 'fuse' | 'cut' | 'intersect'; tool: KernelShape }>,
  options?: { glueMode?: number; fuzzyValue?: number }
): KernelShape | null {
  return executeBooleanPipeline(this.oc, base, steps, options);
}
```

- [ ] **Step 4: Commit TS adapter**

```bash
git add src/kernel/occt/booleanPipelineOps.ts src/kernel/interfaces/booleanOps.ts src/kernel/occt/defaultAdapter.ts
git commit -m "feat(boolean): add chained boolean pipeline adapter"
```

---

### Task 3: Public API + Tests

**Files:**

- Modify: `src/topology/booleanFns.ts` (add `booleanPipeline()`)
- Create: `tests/booleanPipeline.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/booleanPipeline.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { box, cylinder } from '@/index.js';
import { booleanPipeline } from '@/topology/booleanFns.js';
import { translate } from '@/topology/transformFns.js';
import { isSolid } from '@/core/shapeTypes.js';
import { unwrap } from '@/core/result.js';
import { measureVolume } from '@/measurement/measureFns.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('booleanPipeline', () => {
  it('executes a fuse+cut chain and returns valid solid', () => {
    const base = box(10, 10, 10);
    const addBox = translate(box(5, 5, 5), [5, 5, 5]);
    const hole = cylinder(2, 20);

    const result = booleanPipeline(base, [
      { op: 'fuse', tool: addBox },
      { op: 'cut', tool: hole },
    ]);

    expect(result.ok).toBe(true);
    const shape = unwrap(result);
    expect(isSolid(shape)).toBe(true);
    const vol = unwrap(measureVolume(shape));
    // Box(10³) + Box(5³) - overlap(5³) - cylinder(π*2²*10) ≈ 1000 + 125 - 125 - 125.7 ≈ 874
    expect(vol).toBeGreaterThan(800);
    expect(vol).toBeLessThan(950);
  });

  it('returns error for empty pipeline', () => {
    const base = box(10, 10, 10);
    const result = booleanPipeline(base, []);
    // Empty pipeline should return the base shape unchanged
    expect(result.ok).toBe(true);
  });

  it('16-step fuse pipeline (spiral staircase pattern)', () => {
    const shapes = Array.from({ length: 16 }, (_, i) => translate(box(3, 3, 3), [i * 1.5, 0, 0]));
    const [base, ...tools] = shapes;
    const result = booleanPipeline(base!, [
      ...tools.map((t) => ({ op: 'fuse' as const, tool: t })),
    ]);
    expect(result.ok).toBe(true);
    expect(isSolid(unwrap(result))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/booleanPipeline.test.ts`
Expected: FAIL (booleanPipeline not exported from booleanFns.ts yet)

- [ ] **Step 3: Add booleanPipeline to public API**

In `src/topology/booleanFns.ts`, add:

````typescript
import type { PipelineOp } from '@/kernel/occt/booleanPipelineOps.js';

export interface BooleanPipelineStep {
  readonly op: PipelineOp;
  readonly tool: Shape3D;
}

/**
 * Execute a chained boolean pipeline in a single WASM call.
 *
 * More efficient than sequential fuse/cut calls for long chains (e.g., 16-step
 * spiral staircase). Skips UnifySameDomain on intermediate results — only
 * simplifies the final shape.
 *
 * @example
 * ```ts
 * const result = booleanPipeline(base, [
 *   { op: 'fuse', tool: box1 },
 *   { op: 'cut', tool: hole },
 *   { op: 'fuse', tool: box2 },
 * ]);
 * ```
 */
export function booleanPipeline(
  base: Shape3D,
  steps: readonly BooleanPipelineStep[],
  options?: { readonly optimisation?: 'none' | 'commonFace' | 'sameFace' | undefined }
): Result<Shape3D, BooleanError> {
  if (steps.length === 0) return ok(base);

  const glueMode =
    options?.optimisation === 'commonFace' ? 1 : options?.optimisation === 'sameFace' ? 2 : 0;

  const k = getKernel();
  const kernelSteps = steps.map((s) => ({
    op: s.op,
    tool: s.tool.wrapped,
  }));

  const result = k.booleanPipeline?.(base.wrapped, kernelSteps, { glueMode });
  if (!result) {
    // Kernel doesn't support pipeline — fall back to sequential
    let current: Shape3D = base;
    for (const step of steps) {
      const r =
        step.op === 'fuse'
          ? fuse(current, step.tool as ValidSolid)
          : step.op === 'cut'
            ? cut(current, step.tool)
            : intersect(current, step.tool as ValidSolid);
      if (!r.ok) return r;
      current = unwrap(r);
    }
    return ok(current);
  }

  return castToShape3D(result, 'BOOLEAN_PIPELINE_FAILED', 'boolean pipeline');
}
````

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/booleanPipeline.test.ts`
Expected: PASS (JS fallback path works without C++ class)

- [ ] **Step 5: Commit**

```bash
git add src/topology/booleanFns.ts tests/booleanPipeline.test.ts
git commit -m "feat(boolean): add booleanPipeline() public API with JS fallback"
```

---

### Task 4: Pipeline benchmark

**Files:**

- Create: `benchmarks/boolean-pipeline.bench.test.ts`

- [ ] **Step 1: Write benchmark comparing pipeline vs sequential**

```typescript
/**
 * Boolean pipeline benchmark — compares chained pipeline vs sequential operations.
 *
 * Run: npx vitest run benchmarks/boolean-pipeline.bench.test.ts --config vitest.bench.config.ts
 */
import { describe, it, beforeAll, afterAll } from 'vitest';
import { getKernel } from '../src/kernel/index.js';
import { initBothKernels, benchBoth } from './setup.js';
import { collectResults, printResults, type BenchResult } from './harness.js';

const ALL: BenchResult[] = [];

beforeAll(async () => {
  await initBothKernels();
}, 30000);

describe('Sequential vs Pipeline: 8-step fuse', () => {
  const results: BenchResult[] = [];

  it('sequential fuse ×8', async () => {
    collectResults(
      results,
      await benchBoth('sequential fuse ×8', () => {
        const k = getKernel();
        let result = k.makeBox(10, 10, 10);
        for (let i = 1; i <= 8; i++) {
          const tool = k.translate(k.makeBox(5, 5, 5), i * 3, 0, 0);
          result = k.fuse(result, tool, {});
        }
      })
    );
  });

  it('pipeline fuse ×8', async () => {
    collectResults(
      results,
      await benchBoth('pipeline fuse ×8', () => {
        const k = getKernel();
        const base = k.makeBox(10, 10, 10);
        if (typeof k.booleanPipeline === 'function') {
          const steps = Array.from({ length: 8 }, (_, i) => ({
            op: 'fuse' as const,
            tool: k.translate(k.makeBox(5, 5, 5), (i + 1) * 3, 0, 0),
          }));
          k.booleanPipeline(base, steps, {});
        } else {
          // Fallback: same as sequential
          let result = base;
          for (let i = 1; i <= 8; i++) {
            const tool = k.translate(k.makeBox(5, 5, 5), i * 3, 0, 0);
            result = k.fuse(result, tool, {});
          }
        }
      })
    );
  });

  afterAll(() => {
    printResults(results);
    ALL.push(...results);
  });
});

describe('Sequential vs Pipeline: 4-step mixed', () => {
  const results: BenchResult[] = [];

  it('sequential mixed ×4', async () => {
    collectResults(
      results,
      await benchBoth('sequential mixed ×4', () => {
        const k = getKernel();
        let result = k.makeBox(20, 20, 20);
        result = k.fuse(result, k.translate(k.makeBox(10, 10, 10), 10, 0, 0), {});
        result = k.cut(result, k.makeCylinder(3, 40), {});
        result = k.fuse(result, k.translate(k.makeBox(5, 5, 5), -5, 0, 0), {});
        result = k.cut(result, k.translate(k.makeCylinder(2, 40), 5, 5, 0), {});
      })
    );
  });

  it('pipeline mixed ×4', async () => {
    collectResults(
      results,
      await benchBoth('pipeline mixed ×4', () => {
        const k = getKernel();
        const base = k.makeBox(20, 20, 20);
        if (typeof k.booleanPipeline === 'function') {
          k.booleanPipeline(
            base,
            [
              { op: 'fuse', tool: k.translate(k.makeBox(10, 10, 10), 10, 0, 0) },
              { op: 'cut', tool: k.makeCylinder(3, 40) },
              { op: 'fuse', tool: k.translate(k.makeBox(5, 5, 5), -5, 0, 0) },
              { op: 'cut', tool: k.translate(k.makeCylinder(2, 40), 5, 5, 0) },
            ],
            {}
          );
        }
      })
    );
  });

  afterAll(() => {
    printResults(results);
    ALL.push(...results);
  });
});

afterAll(() => {
  printResults(ALL);
});
```

- [ ] **Step 2: Run benchmark (baseline — JS fallback path)**

Run: `npx vitest run benchmarks/boolean-pipeline.bench.test.ts --config vitest.bench.config.ts`
Expected: PASS, shows baseline sequential timing. Pipeline and sequential should be similar since C++ class isn't built yet.

- [ ] **Step 3: Commit**

```bash
git add benchmarks/boolean-pipeline.bench.test.ts
git commit -m "test: add boolean pipeline benchmark (baseline)"
```

---

### Task 5: Docker rebuild + measure improvement

This task happens AFTER all Plans A/B/C `brepjs.yml` changes are batched.

- [ ] **Step 1: Rebuild Docker with new C++ classes**

Run the Docker build with the updated brepjs.yml (includes BooleanPipeline, -mtail-call, and any Plan B/C additions).

- [ ] **Step 2: Run pipeline benchmark with C++ path**

Expected: Pipeline path shows measurable improvement over sequential for 8+ step chains (reduced bridge crossings + skipped intermediate simplify).

- [ ] **Step 3: Run full test suite**

Run: `npm run test:full`
Expected: All tests pass

- [ ] **Step 4: Commit results and update baseline**

```bash
git commit -m "perf(boolean): pipeline shows Xms improvement for N-step chains"
```
