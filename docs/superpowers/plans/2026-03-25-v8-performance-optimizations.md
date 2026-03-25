# V8 Performance Optimizations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Leverage OCCT V8 performance improvements: auto-disable sweep history, stream-based STEP I/O bypassing Emscripten FS, batch 2D curve evaluation, and STEP I/O benchmarks.

**Architecture:** Four independent optimizations, each touching the OCCT kernel adapter layer. Stream-based STEP I/O requires a new C++ wrapper in `brepjs.yml` additionalCppCode. Sweep history disable and batch 2D eval are pure TypeScript changes. STEP benchmarks are a new test file.

**Tech Stack:** TypeScript, C++ (Emscripten additionalCppCode), Vitest benchmarks

**Docker Rebuild:** Tasks 2 and 4 require `brepjs.yml` changes. **Batch all binding additions from all three V8 plans into a single Docker rebuild** before implementing any TypeScript code that depends on new C++ classes. The feature-detection pattern (`typeof oc.StepStreamIO?.exportSTEP === 'function'`) ensures TS code works both before and after the rebuild.

---

## File Structure

| File                                                     | Purpose                                                                    |
| -------------------------------------------------------- | -------------------------------------------------------------------------- |
| `packages/brepjs-opencascade/build-config/brepjs.yml`    | Add `StepStreamIO` C++ wrapper class                                       |
| `src/kernel/occt/ioOps.ts`                               | Refactor `exportSTEP`/`importSTEP` to use stream wrapper                   |
| `src/kernel/occt/sweepOps.ts`                            | Nothing — sweep doesn't track history, optimization is in `advancedOps.ts` |
| `src/kernel/occt/advancedOps.ts`                         | Modify `sweepPipeShell` to skip OCCT history when not needed               |
| `src/kernel/occt/kernel2dOps.ts`                         | Add `evaluateCurve2dBatch` C++ helper + TS wrapper                         |
| `benchmarks/step-io.bench.test.ts`                       | New: STEP import/export benchmarks                                         |
| `tests/ioOps.test.ts` or `tests/import-export.test.ts`   | Add stream I/O tests                                                       |
| `tests/sweepFns.test.ts` or `tests/evolutionFns.test.ts` | Add sweep history disable tests                                            |

---

### Task 1: STEP I/O Benchmark (baseline before optimizations)

**Files:**

- Create: `benchmarks/step-io.bench.test.ts`

- [ ] **Step 1: Write the benchmark file**

```typescript
/**
 * STEP I/O benchmarks — measures import/export performance.
 *
 * Run: npx vitest run benchmarks/step-io.bench.test.ts --config vitest.bench.config.ts
 */
import { describe, it, beforeAll, afterAll } from 'vitest';
import { getKernel } from '../src/kernel/index.js';
import { initBothKernels, benchBoth, hasBrepkit } from './setup.js';
import { collectResults, printResults, type BenchResult } from './harness.js';

const ALL_RESULTS: BenchResult[] = [];

beforeAll(async () => {
  await initBothKernels();
}, 30000);

describe('STEP Export', () => {
  const results: BenchResult[] = [];

  it('exportSTEP single box ×10', async () => {
    collectResults(
      results,
      await benchBoth('exportSTEP(box) ×10', () => {
        const k = getKernel();
        const box = k.makeBox(10, 10, 10);
        for (let i = 0; i < 10; i++) k.exportSTEP([box]);
      })
    );
  });

  it('exportSTEP complex model', async () => {
    collectResults(
      results,
      await benchBoth('exportSTEP(complex)', () => {
        const k = getKernel();
        let result = k.makeBox(50, 50, 10);
        for (let x = -15; x <= 15; x += 10) {
          for (let y = -15; y <= 15; y += 10) {
            const hole = k.translate(k.makeCylinder(3, 20), x, y, -5);
            result = k.cut(result, hole);
          }
        }
        k.exportSTEP([result]);
      })
    );
  });

  afterAll(() => {
    printResults(results);
    ALL_RESULTS.push(...results);
  });
});

describe('STEP Import', () => {
  const results: BenchResult[] = [];
  let simpleSTEP: string;
  let complexSTEP: string;

  beforeAll(() => {
    const k = getKernel();
    simpleSTEP = k.exportSTEP([k.makeBox(10, 10, 10)]);
    let complex = k.makeBox(50, 50, 10);
    for (let x = -15; x <= 15; x += 10) {
      for (let y = -15; y <= 15; y += 10) {
        complex = k.cut(complex, k.translate(k.makeCylinder(3, 20), x, y, -5));
      }
    }
    complexSTEP = k.exportSTEP([complex]);
  });

  it('importSTEP simple ×10', async () => {
    collectResults(
      results,
      await benchBoth('importSTEP(simple) ×10', () => {
        const k = getKernel();
        for (let i = 0; i < 10; i++) k.importSTEP(simpleSTEP);
      })
    );
  });

  it('importSTEP complex', async () => {
    collectResults(
      results,
      await benchBoth('importSTEP(complex)', () => {
        const k = getKernel();
        k.importSTEP(complexSTEP);
      })
    );
  });

  afterAll(() => {
    printResults(results);
    ALL_RESULTS.push(...results);
  });
});

afterAll(() => {
  console.log('\n=== STEP I/O Benchmark Summary ===');
  printResults(ALL_RESULTS);
});
```

- [ ] **Step 2: Run the benchmark to establish baseline**

Run: `npx vitest run benchmarks/step-io.bench.test.ts --config vitest.bench.config.ts --reporter=verbose`
Expected: PASS, prints baseline timing tables

- [ ] **Step 3: Commit**

```bash
git add benchmarks/step-io.bench.test.ts
git commit -m "bench: add STEP I/O benchmarks for baseline measurement"
```

---

### Task 2: Stream-based STEP I/O (bypass Emscripten FS)

**Files:**

- Modify: `packages/brepjs-opencascade/build-config/brepjs.yml` (additionalCppCode section)
- Modify: `src/kernel/occt/ioOps.ts:14-35` (exportSTEP) and `src/kernel/occt/ioOps.ts:83-101` (importSTEP)
- Modify: `tests/import-export.test.ts` (add stream I/O roundtrip test)

- [ ] **Step 1: Add C++ StepStreamIO wrapper to brepjs.yml**

Add after the existing `BRepToolsWrapper` class (around line 413 in additionalCppCode):

```cpp
class StepStreamIO {
public:
  // Export shapes to STEP format, returning the STEP content as a string.
  // Bypasses Emscripten FS entirely — writes directly to std::ostringstream.
  static std::string exportSTEP(const std::vector<TopoDS_Shape>& shapes, int schema) {
    STEPControl_Writer writer;
    Interface_Static::SetIVal("write.step.schema", schema);
    writer.Model(Standard_True);
    Message_ProgressRange progress;
    for (size_t i = 0; i < shapes.size(); i++) {
      writer.Transfer(shapes[i], STEPControl_AsIs, Standard_True, progress);
    }
    std::ostringstream oss;
    writer.WriteStream(oss);
    return oss.str();
  }

  // Import shapes from STEP content string.
  // Bypasses Emscripten FS — reads directly from std::istringstream.
  static TopoDS_Shape importSTEP(const std::string& data) {
    std::istringstream iss(data);
    STEPControl_Reader reader;
    if (reader.ReadStream(iss) != IFSelect_RetDone) {
      return TopoDS_Shape(); // Return null shape on failure
    }
    Message_ProgressRange progress;
    reader.TransferRoots(progress);
    return reader.OneShape();
  }
};
```

**NOTE:** V8 adds `WriteStream`/`ReadStream` to `STEPControl_Writer`/`STEPControl_Reader`. If these methods don't exist in V8 RC4, fall back to the approach used by `BRepToolsWrapper` — write to a temporary file path and read it back. Check the OCCT V8 RC4 source for `WriteStream` availability before implementing.

- [ ] **Step 2: Add StepStreamIO symbol to brepjs.yml bindings**

Add to the bindings array:

```yaml
- symbol: StepStreamIO
```

- [ ] **Step 3: Write failing test for stream-based export**

In `tests/import-export.test.ts`, add:

```typescript
describe('stream-based STEP I/O', () => {
  it('exports and reimports a box via stream', () => {
    const k = getKernel();
    const box = k.makeBox(10, 20, 30);
    const stepContent = k.exportSTEP([box]);
    expect(stepContent).toContain('HEADER');
    expect(stepContent).toContain('DATA');
    const [imported] = k.importSTEP(stepContent);
    expect(imported).toBeDefined();
    const vol = k.volume(imported);
    expect(vol).toBeCloseTo(6000, 0);
  });
});
```

- [ ] **Step 4: Run to verify test passes with existing implementation**

Run: `npx vitest run tests/import-export.test.ts`
Expected: PASS (existing FS-based implementation already passes this test shape)

- [ ] **Step 5: Refactor exportSTEP to use StepStreamIO when available**

In `src/kernel/occt/ioOps.ts`, replace lines 14-35:

```typescript
export function exportSTEP(oc: KernelInstance, shapes: KernelShape[]): string {
  // Feature-detect stream-based I/O (V8+)
  // Note: check each call — no module-scope let (prefer-const / no export let rules)
  const useStream = typeof oc.StepStreamIO?.exportSTEP === 'function';

  if (useStream) {
    // V8 stream path — no Emscripten FS round-trip
    // NOTE: The vector type name depends on Emscripten binding generation —
    // check brepjs_single.d.ts after Docker rebuild for the actual name
    const shapeVec = new oc.ShapeVector();
    for (const shape of shapes) shapeVec.push_back(shape);
    const result = oc.StepStreamIO.exportSTEP(shapeVec, 5); // AP214
    shapeVec.delete();
    return result;
  }

  // Fallback: FS-based path (V7 compatibility)
  const writer = new oc.STEPControl_Writer_1();
  oc.Interface_Static.SetIVal('write.step.schema', 5);
  writer.Model(true).delete();
  const progress = new oc.Message_ProgressRange_1();
  for (const shape of shapes) {
    writer.Transfer_1(shape, oc.STEPControl_StepModelType.STEPControl_AsIs, true, progress);
  }
  const filename = uniqueIOFilename('_export', 'step');
  const done = writer.Write(filename);
  writer.delete();
  progress.delete();
  if (done === oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
    const file = oc.FS.readFile('/' + filename);
    oc.FS.unlink('/' + filename);
    return new TextDecoder().decode(file);
  }
  throw new Error('STEP export failed: writer did not complete successfully');
}
```

- [ ] **Step 6: Refactor importSTEP similarly**

In `src/kernel/occt/ioOps.ts`, replace lines 83-101:

```typescript
export function importSTEP(oc: KernelInstance, data: string | ArrayBuffer): KernelShape[] {
  const useStream = typeof oc.StepStreamIO?.importSTEP === 'function';

  const dataStr = typeof data === 'string' ? data : new TextDecoder().decode(new Uint8Array(data));

  if (useStream) {
    // V8 stream path
    const shape = oc.StepStreamIO.importSTEP(dataStr);
    if (shape.IsNull())
      throw new Error('Failed to import STEP file: stream reader could not parse the input data');
    return [shape];
  }

  // Fallback: FS-based path
  const filename = uniqueIOFilename('_import', 'step');
  const buffer = new TextEncoder().encode(dataStr);
  oc.FS.writeFile('/' + filename, buffer);
  const reader = new oc.STEPControl_Reader_1();
  if (reader.ReadFile(filename)) {
    oc.FS.unlink('/' + filename);
    const progress = new oc.Message_ProgressRange_1();
    reader.TransferRoots(progress);
    progress.delete();
    const shape = reader.OneShape();
    reader.delete();
    return [shape];
  }
  oc.FS.unlink('/' + filename);
  reader.delete();
  throw new Error('Failed to import STEP file: reader could not parse the input data');
}
```

- [ ] **Step 7: Run tests**

Run: `npx vitest run tests/import-export.test.ts`
Expected: PASS

- [ ] **Step 8: Run STEP benchmark to measure improvement**

Run: `npx vitest run benchmarks/step-io.bench.test.ts --config vitest.bench.config.ts`
Expected: Visible improvement in export/import medians vs baseline

- [ ] **Step 9: Commit**

```bash
git add packages/brepjs-opencascade/build-config/brepjs.yml src/kernel/occt/ioOps.ts
git commit -m "perf(io): stream-based STEP I/O bypassing Emscripten FS"
```

**IMPORTANT NOTE:** This task requires a Docker rebuild to include the new `StepStreamIO` C++ class. The `WriteStream`/`ReadStream` methods may not exist in OCCT V8 RC4. If they don't, implement the stream approach using `std::ostringstream` with `STEPControl_Writer::Write(std::ostream&)` overload instead, or skip this task and move to Task 3 (the FS overhead may be negligible vs STEP parsing time — the benchmark from Task 1 will tell).

---

### Task 3: Auto-disable sweep history in BRepFill_PipeShell

**Files:**

- Modify: `src/kernel/occt/advancedOps.ts:122-199` (sweepPipeShell function)
- Test: `tests/sweepFns.test.ts` or `tests/evolutionFns.test.ts`

**Context:** The `sweepPipeShell` function in `advancedOps.ts` uses `BRepOffsetAPI_MakePipeShell`. OCCT V8 adds the ability to disable history generation in `BRepFill_PipeShell`. Since `sweepPipeShell` is always called WITHOUT evolution tracking (there's no `sweepPipeShellWithHistory` variant), we can safely disable history for all calls.

- [ ] **Step 1: Read the current sweepPipeShell implementation**

Read: `src/kernel/occt/advancedOps.ts:122-199`

- [ ] **Step 2: Add history disable after PipeShell creation**

In `sweepPipeShell`, after `const sweepBuilder = new oc.BRepOffsetAPI_MakePipeShell(spine);`, add:

```typescript
// V8: disable internal history generation since we don't extract it here.
// BRepFill_PipeShell.SetBuildHistory(false) was added in OCCT V8.
// Feature-detect to maintain V7 compatibility.
if (typeof sweepBuilder.SetBuildHistory === 'function') {
  sweepBuilder.SetBuildHistory(false);
}
```

**NOTE:** The method name may be `SetBuildHistory` or similar — verify against OCCT V8 RC4 source. If the method is on `BRepFill_PipeShell` (not `BRepOffsetAPI_MakePipeShell`), it may not be directly accessible. Check whether `BRepOffsetAPI_MakePipeShell` exposes it.

- [ ] **Step 3: Write a test to verify sweep still works**

In `tests/sweepFns.test.ts`:

```typescript
it('sweepPipeShell produces valid solid after history disable', () => {
  const k = getKernel();
  // Create a circular wire profile and a straight spine
  const circleEdge = k.makeCircle(1, [0, 0, 0], [1, 0, 0]);
  const profile = k.makeWire([circleEdge]);
  const spineEdge = k.makeLine([0, 0, 0], [0, 0, 20]);
  const spine = k.makeWire([spineEdge]);
  const result = k.sweepPipeShell(profile, spine);
  const shape = 'shape' in result ? result.shape : result;
  expect(k.shapeType(shape)).toBe('solid');
  const vol = k.volume(shape);
  expect(vol).toBeGreaterThan(0);
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/sweepFns.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/kernel/occt/advancedOps.ts tests/sweepFns.test.ts
git commit -m "perf(sweep): auto-disable BRepFill_PipeShell history in V8"
```

---

### Task 4: Batch 2D curve evaluation

**Files:**

- Modify: `packages/brepjs-opencascade/build-config/brepjs.yml` (additionalCppCode)
- Modify: `src/kernel/occt/kernel2dOps.ts` (add batch evaluation function)
- Modify: `src/kernel/interfaces/kernel2dTypes.ts` (add batch method to interface)
- Create: `tests/curve2dBatch.test.ts`

- [ ] **Step 1: Add C++ Curve2dBatchEval wrapper to brepjs.yml**

```cpp
class Curve2dBatchEval {
public:
  // Evaluate N points along a single 2D curve.
  // Returns flat array: [x0, y0, x1, y1, ...] for each parameter.
  static std::vector<double> evaluate(const Handle_Geom2d_Curve& curve,
                                       const std::vector<double>& params) {
    std::vector<double> result;
    result.reserve(params.size() * 2);
    for (double u : params) {
      gp_Pnt2d p;
      curve->D0(u, p);
      result.push_back(p.X());
      result.push_back(p.Y());
    }
    return result;
  }

  // Evaluate with first derivatives (point + tangent).
  // Returns flat array: [px0, py0, tx0, ty0, px1, py1, tx1, ty1, ...]
  static std::vector<double> evaluateD1(const Handle_Geom2d_Curve& curve,
                                         const std::vector<double>& params) {
    std::vector<double> result;
    result.reserve(params.size() * 4);
    for (double u : params) {
      gp_Pnt2d p;
      gp_Vec2d v;
      curve->D1(u, p, v);
      result.push_back(p.X());
      result.push_back(p.Y());
      result.push_back(v.X());
      result.push_back(v.Y());
    }
    return result;
  }
};
```

- [ ] **Step 2: Add Curve2dBatchEval symbol to brepjs.yml**

```yaml
- symbol: Curve2dBatchEval
```

- [ ] **Step 3: Write failing test**

Create `tests/curve2dBatch.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import {
  line2d,
  evaluateCurve2d,
  evaluateCurve2dBatch,
  boundsCurve2d,
} from '@/2d/curve2dGeometryFns.js';
import { unwrap } from '@/core/result.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('batch 2D curve evaluation', () => {
  it('evaluates multiple points along a line', () => {
    const curve = unwrap(line2d([0, 0], [10, 0]));
    const bounds = unwrap(boundsCurve2d(curve));
    // Evaluate at 5 evenly spaced parameters
    const params = Array.from(
      { length: 5 },
      (_, i) => bounds.first + (i / 4) * (bounds.last - bounds.first)
    );
    // Individual evaluation for comparison
    const expected = params.map((p) => unwrap(evaluateCurve2d(curve, p)));
    // Batch evaluation
    const batchResults = evaluateCurve2dBatch(curve, params);
    expect(batchResults).toHaveLength(5);
    for (let i = 0; i < 5; i++) {
      expect(batchResults[i][0]).toBeCloseTo(expected[i][0], 10);
      expect(batchResults[i][1]).toBeCloseTo(expected[i][1], 10);
    }
  });
});
```

- [ ] **Step 4: Add evaluateCurve2dBatch to the public API**

In `src/2d/curve2dGeometryFns.ts`, add:

```typescript
/**
 * Batch evaluate a 2D curve at multiple parameter values.
 * Single WASM call for N points — faster than N individual evaluateCurve2d calls.
 */
export function evaluateCurve2dBatch(curve: Curve2DHandle, params: number[]): Point2D[] {
  const k = getKernel2D();
  if (typeof k.evaluateCurve2dBatch === 'function') {
    return k.evaluateCurve2dBatch(curve.raw, params);
  }
  // Fallback: individual calls
  return params.map((p) => {
    const result = evaluateCurve2d(curve, p);
    if (!result.ok) throw new Error('Batch eval failed at param ' + p);
    return result.value;
  });
}
```

- [ ] **Step 5: Wire the C++ helper into kernel2dOps**

In `src/kernel/occt/kernel2dOps.ts`, add the batch evaluation method that calls `Curve2dBatchEval.evaluate()` and unpacks the flat double array into Point2D pairs.

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/curve2dBatch.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/brepjs-opencascade/build-config/brepjs.yml \
  src/kernel/occt/kernel2dOps.ts src/2d/curve2dGeometryFns.ts \
  tests/curve2dBatch.test.ts
git commit -m "perf(2d): batch 2D curve evaluation via single WASM call"
```

**NOTE:** This task requires a Docker rebuild for the new C++ class. Combine the rebuild with Task 2's `StepStreamIO` to avoid two rebuilds.
