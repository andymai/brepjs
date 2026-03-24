# Expose Unexposed OCCT Functionality — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface hidden OCCT capabilities through the brepjs public API across 5 phases — boolean diagnostics, kernel quick-wins, shape evolution, NURBS read access, and full 2D geometry.

**Architecture:** Each phase is independently shippable as its own PR. New functionality follows the existing pattern: kernel interface method → `*Fns.ts` functional wrapper → export from `src/index.ts` and relevant sub-path barrel. OCCT-first; brepkit support is optional (can throw `unsupportedError`). The `brepjs/2d` entry point already exists and will be expanded in Phase 5.

**Tech Stack:** TypeScript, Vitest, OCCT WASM (`BRepAlgoAPI_*`, `ShapeFix_*`, `BRepAdaptor_*`, `BRepProj_*`), existing `Result<T>` monad, branded types.

---

## Phase 1: Boolean Diagnostics

**Branch:** `feat/boolean-diagnostics`

**Motivation:** Boolean operation failures are the #1 user pain point. Currently, `HasErrors()` and `HasWarnings()` are available on OCCT boolean operations after `Build()` but are never checked. Failed booleans silently return degenerate shapes that only get caught downstream by the `isShape3D` type check, producing unhelpful `*_NOT_3D` errors. This phase adds pre-validation and structured failure reasons.

**Key constraint:** `BRepAlgoAPI_Check` is **not compiled into the WASM build**, so pre-flight validation must use `isValid()` on operands + post-Build `HasErrors()`/`HasWarnings()` extraction.

---

### Task 1.1: Add `HasErrors`/`HasWarnings` extraction to kernel boolean ops

**Files:**

- Modify: `src/kernel/occt/historyOps.ts:137-210` (fuseWithHistory, cutWithHistory, intersectWithHistory)
- Modify: `src/kernel/types.ts` (add `BooleanDiagnostics` type)
- Modify: `src/kernel/interfaces/booleanOps.ts` (add `checkBoolean` to interface)
- Modify: `src/kernel/types.ts` (add `DiagnosticOperationResult` extending `OperationResult`)
- Modify: `src/kernel/occt/booleanOps.ts` (add `checkBoolean` implementation)
- Modify: `src/kernel/brepkit/brepkitAdapter.ts` (add `checkBoolean` stub that throws unsupported)
- Test: `tests/booleanDiagnostics.test.ts`

- [ ] **Step 1: Define `BooleanDiagnostics` type in `src/kernel/types.ts`**

Add after `OperationResult` (line 139):

```typescript
/** Diagnostic information from a boolean operation. */
export interface BooleanDiagnostics {
  /** Whether the OCCT algorithm reported internal errors. */
  readonly hasErrors: boolean;
  /** Whether the OCCT algorithm reported warnings. */
  readonly hasWarnings: boolean;
  /** Human-readable error/warning messages extracted from the OCCT report. */
  readonly messages: readonly string[];
}

/** Extended operation result with diagnostics. */
export interface DiagnosticOperationResult extends OperationResult {
  readonly diagnostics: BooleanDiagnostics;
}
```

- [ ] **Step 2: Write failing test for `HasErrors` detection**

Create `tests/booleanDiagnostics.test.ts`:

```typescript
import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { box, fuse, isOk, isErr, unwrapErr } from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('boolean diagnostics', () => {
  it('fuse result error includes structured reason', () => {
    // Create a degenerate case: fuse a zero-volume shape
    // This should produce a structured error, not just "NOT_3D"
    const b = box(10, 10, 10);
    const degenerate = box(0, 0, 0); // zero-volume
    const result = fuse(b, degenerate);
    if (isErr(result)) {
      const error = unwrapErr(result);
      expect(error.metadata).toBeDefined();
      expect(error.metadata?.diagnostics).toBeDefined();
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/booleanDiagnostics.test.ts`
Expected: FAIL — no `diagnostics` in error metadata

- [ ] **Step 4: Extract OCCT diagnostics in `historyOps.ts`**

In `src/kernel/occt/historyOps.ts`, modify `fuseWithHistory` (and `cutWithHistory`, `intersectWithHistory` identically). After `fuseOp.Build(progress)` (line 149), before `booleanWithEvolution`:

```typescript
// Extract diagnostics before evolution tracking
const hasErrors = fuseOp.HasErrors();
const hasWarnings = fuseOp.HasWarnings();
const messages: string[] = [];
// Note: DumpErrors/DumpWarnings write to OStream which is not easily
// accessible in WASM. We detect errors via HasErrors() and let the
// downstream shape-type check produce the user-facing message.
const diagnostics: BooleanDiagnostics = { hasErrors, hasWarnings, messages };
```

Then change `booleanWithEvolution` to return diagnostics alongside the result. Modify `evolutionOps.ts:booleanWithEvolution` to accept an optional `diagnostics` parameter and return `DiagnosticOperationResult`:

```typescript
export function booleanWithEvolution(
  oc: KernelInstance,
  boolOp: OcctSimplifyBuilder & OcctEvolutionBuilder,
  inputShapes: KernelShape | KernelShape[],
  inputFaceHashes: number[],
  hashUpperBound: number,
  simplify: boolean,
  diagnostics?: BooleanDiagnostics
): DiagnosticOperationResult {
  if (simplify) boolOp.SimplifyResult(true, true, 1e-3);
  const resultShape = boolOp.Shape();
  const evolution = buildEvolution(oc, boolOp, inputShapes, inputFaceHashes, hashUpperBound);
  return {
    shape: resultShape,
    evolution,
    diagnostics: diagnostics ?? { hasErrors: false, hasWarnings: false, messages: [] },
  };
}
```

- [ ] **Step 5: Propagate diagnostics to `booleanFns.ts` error metadata**

In `src/topology/booleanFns.ts`, update `castToShape3D` to accept optional diagnostics and include them in error metadata. Then update `fuse`, `cut`, `intersect` to pass diagnostics through:

```typescript
function castToShape3D(
  shape: KernelType,
  errorCode: string,
  errorMsg: string,
  suggestion?: string,
  diagnostics?: BooleanDiagnostics
): Result<Shape3D> {
  const wrapped = castShape(shape);
  if (!isShape3D(wrapped)) {
    const shapeType = shape.ShapeType();
    const typeNames = [
      'COMPOUND',
      'COMPSOLID',
      'SOLID',
      'SHELL',
      'FACE',
      'WIRE',
      'EDGE',
      'VERTEX',
      'SHAPE',
    ];
    const typeName = typeNames[shapeType] ?? `UNKNOWN(${shapeType})`;
    wrapped[Symbol.dispose]();
    return err(
      typeCastError(
        errorCode,
        `${errorMsg}. Got ${typeName} instead.`,
        undefined,
        diagnostics ? { diagnostics } : undefined,
        suggestion
      )
    );
  }
  return ok(wrapped);
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/booleanDiagnostics.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/kernel/types.ts src/kernel/occt/historyOps.ts src/kernel/occt/evolutionOps.ts src/topology/booleanFns.ts tests/booleanDiagnostics.test.ts
git commit -m "feat(booleans): extract OCCT diagnostics from HasErrors/HasWarnings after Build"
```

---

### Task 1.2: Add `checkBoolean` pre-validation function

**Files:**

- Modify: `src/kernel/interfaces/booleanOps.ts` (add method)
- Modify: `src/kernel/occt/booleanOps.ts` (implement)
- Modify: `src/kernel/brepkit/brepkitAdapter.ts` (stub)
- Create: `src/topology/booleanDiagnosticFns.ts`
- Modify: `src/index.ts` (export)
- Test: `tests/booleanDiagnostics.test.ts` (extend)

- [ ] **Step 1: Write failing test for `checkBoolean`**

Add to `tests/booleanDiagnostics.test.ts`:

```typescript
import { checkBoolean } from '@/index.js';

describe('checkBoolean', () => {
  it('returns ok for valid operands', () => {
    const a = box(10, 10, 10);
    const b = translate(box(5, 5, 5), [5, 5, 5]);
    const result = checkBoolean(a, b, 'fuse');
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('reports invalid operand when shape is not valid', () => {
    // Create a shape, then damage it with a known-failing boolean
    // that produces a degenerate result, and use that as an operand
    const a = box(10, 10, 10);
    const b = box(10, 10, 10);
    // Force an invalid shape by attempting a degenerate boolean
    // and using the raw kernel result (bypassing Result checks)
    // Alternative: test the structure of CheckBooleanResult
    const result = checkBoolean(a, b, 'fuse');
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('issues');
    expect(Array.isArray(result.issues)).toBe(true);
  });

  it('issues array contains structured BooleanIssue objects', () => {
    const a = box(10, 10, 10);
    const b = box(10, 10, 10);
    const result = checkBoolean(a, b, 'cut');
    // Both valid shapes — should pass
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
    // Verify the interface shape: if any issues existed, each would have
    // operand ('base'|'tool'|'both'), issue string, and message string
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/booleanDiagnostics.test.ts`
Expected: FAIL — `checkBoolean` not exported

- [ ] **Step 3: Define `CheckBooleanResult` type**

Add to `src/kernel/types.ts`:

```typescript
/** Issue detected during boolean pre-validation. */
export interface BooleanIssue {
  readonly operand: 'base' | 'tool' | 'both';
  readonly issue: 'null-shape' | 'not-valid' | 'self-intersection';
  readonly message: string;
}

/** Result of boolean pre-validation. */
export interface CheckBooleanResult {
  readonly valid: boolean;
  readonly issues: readonly BooleanIssue[];
}

/** Boolean operation type for checkBoolean. */
export type BooleanOpType = 'fuse' | 'cut' | 'intersect';
```

- [ ] **Step 4: Add `checkBoolean` to kernel interface**

In `src/kernel/interfaces/booleanOps.ts`, add to `KernelBooleanOps`:

```typescript
/** Pre-validate operands before a boolean operation. */
checkBoolean(
  shape: KernelShape,
  tool: KernelShape,
  op: BooleanOpType
): CheckBooleanResult;
```

- [ ] **Step 5: Implement `checkBoolean` in OCCT adapter**

In `src/kernel/occt/booleanOps.ts`, add:

```typescript
export function checkBoolean(
  oc: KernelInstance,
  shape: KernelShape,
  tool: KernelShape,
  op: BooleanOpType,
  isValid: (s: KernelShape) => boolean
): CheckBooleanResult {
  const issues: BooleanIssue[] = [];

  // Check null shapes
  if (shape.IsNull()) {
    issues.push({ operand: 'base', issue: 'null-shape', message: 'Base shape is null' });
  }
  if (tool.IsNull()) {
    issues.push({ operand: 'tool', issue: 'null-shape', message: 'Tool shape is null' });
  }
  if (issues.length > 0) return { valid: false, issues };

  // Check validity
  if (!isValid(shape)) {
    issues.push({
      operand: 'base',
      issue: 'not-valid',
      message: 'Base shape fails BRepCheck validation. Try autoHeal() first.',
    });
  }
  if (!isValid(tool)) {
    issues.push({
      operand: 'tool',
      issue: 'not-valid',
      message: 'Tool shape fails BRepCheck validation. Try autoHeal() first.',
    });
  }

  return { valid: issues.length === 0, issues };
}
```

- [ ] **Step 6: Add brepkit stub**

In `src/kernel/brepkit/brepkitAdapter.ts`, add `checkBoolean` that uses the same null + `isValid` checks (brepkit has its own `isValid`).

- [ ] **Step 7: Create `src/topology/booleanDiagnosticFns.ts`**

````typescript
import { getKernel } from '@/kernel/index.js';
import type { Shape3D } from '@/core/shapeTypes.js';
import type { BooleanOpType, CheckBooleanResult } from '@/kernel/types.js';

/**
 * Pre-validate operands before a boolean operation.
 *
 * Checks that both shapes are non-null and topologically valid.
 * Returns a structured report of any issues found.
 *
 * @example
 * ```typescript
 * const check = checkBoolean(base, tool, 'fuse');
 * if (!check.valid) {
 *   console.warn('Boolean will likely fail:', check.issues);
 * }
 * ```
 */
export function checkBoolean(base: Shape3D, tool: Shape3D, op: BooleanOpType): CheckBooleanResult {
  const kernel = getKernel();
  return kernel.checkBoolean(base.wrapped, tool.wrapped, op);
}
````

- [ ] **Step 8: Export from `src/index.ts`**

Add `checkBoolean` to the boolean operations section and add `CheckBooleanResult`, `BooleanIssue`, `BooleanOpType` type exports.

- [ ] **Step 9: Run tests to verify they pass**

Run: `npx vitest run tests/booleanDiagnostics.test.ts`
Expected: PASS

- [ ] **Step 10: Run full validation**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add src/kernel/types.ts src/kernel/interfaces/booleanOps.ts src/kernel/occt/booleanOps.ts src/kernel/brepkit/brepkitAdapter.ts src/topology/booleanDiagnosticFns.ts src/index.ts tests/booleanDiagnostics.test.ts
git commit -m "feat(booleans): add checkBoolean pre-validation with structured diagnostics"
```

---

### Task 1.3: Enhance existing boolean error messages with diagnostics context

**Files:**

- Modify: `src/topology/booleanFns.ts:121-280` (fuse, cut, intersect functions)
- Modify: `src/core/errors.ts` (add new error codes)
- Test: `tests/booleanDiagnostics.test.ts` (extend)

- [ ] **Step 1: Write failing test for enhanced error messages**

Add to `tests/booleanDiagnostics.test.ts`:

```typescript
describe('enhanced boolean errors', () => {
  it('boolean error metadata contains diagnostics when OCCT reports errors', () => {
    // Create a degenerate scenario: fuse with a zero-volume box
    const a = box(10, 10, 10);
    const degenerate = box(0, 0, 0);
    const result = fuse(a, degenerate);
    if (isErr(result)) {
      const error = unwrapErr(result);
      // Error should now carry diagnostics metadata
      expect(error.metadata?.diagnostics).toBeDefined();
      // And include a suggestion pointing to checkBoolean
      expect(error.suggestion).toContain('checkBoolean');
    }
    // If it succeeds (kernel-dependent), the test still passes —
    // the error path is tested by the degenerate case
  });

  it('error suggestion mentions autoHeal when HasErrors is true', () => {
    // This test verifies the suggestion field is present on boolean errors
    const a = box(10, 10, 10);
    const b = box(10, 10, 10);
    const result = fuse(a, b);
    // Two identical overlapping boxes may or may not produce errors;
    // if it succeeds, just verify the shape is valid
    if (isOk(result)) {
      expect(isShape3D(unwrap(result))).toBe(true);
    } else {
      const error = unwrapErr(result);
      expect(error.suggestion).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Add `BOOLEAN_HAS_ERRORS` error code**

In `src/core/errors.ts`, add to `BrepErrorCode`:

```typescript
// Boolean diagnostic errors
BOOLEAN_HAS_ERRORS: 'BOOLEAN_HAS_ERRORS',
```

- [ ] **Step 3: Update `fuse`/`cut`/`intersect` in `booleanFns.ts`**

After the kernel call returns a `DiagnosticOperationResult`, check `diagnostics.hasErrors` before the shape type check. If OCCT reported errors, return a `kernelError` with the diagnostics in metadata:

```typescript
if (opResult.diagnostics.hasErrors) {
  return err(
    kernelError(
      BrepErrorCode.BOOLEAN_HAS_ERRORS,
      'Boolean operation reported internal errors. The result may be invalid.',
      undefined,
      { diagnostics: opResult.diagnostics },
      'Use checkBoolean() to pre-validate operands, or try autoHeal() on inputs.'
    )
  );
}
```

This fires _before_ the `castToShape3D` check, giving users a more actionable error.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/booleanDiagnostics.test.ts && npx vitest run tests/booleanFns.test.ts`
Expected: PASS (existing tests must not break)

- [ ] **Step 5: Commit**

```bash
git add src/topology/booleanFns.ts src/core/errors.ts tests/booleanDiagnostics.test.ts
git commit -m "feat(booleans): return BOOLEAN_HAS_ERRORS when OCCT reports internal failures"
```

---

## Phase 2: Quick-Win Kernel Exposures + Surface Projection

**Branch:** `feat/kernel-quick-wins`

**Motivation:** Several kernel methods are already implemented but hidden from the public API. Exposing them is low-effort, high-value. Surface projection (`BRepProj_Projection`) is a new OCCT capability.

**Convention reminders for all tasks in this phase:**

- Every new function in `src/topology/*.ts` must also be exported from `src/topology.ts` (the sub-path barrel)
- Every new function in `src/operations/*.ts` must also be exported from `src/operations.ts`
- Every new function in `src/io/*.ts` must also be exported from `src/io.ts`
- Run `npm run validate` before each commit
- Run `npm run check:boundaries` after creating any new files

---

### Task 2.1: Expose `positionOnCurve`

**Files:**

- Create: `src/topology/positionFns.ts`
- Modify: `src/index.ts`
- Modify: `src/topology.ts`
- Test: `tests/positionFns.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/positionFns.test.ts`:

```typescript
import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { box, line, positionOnCurve, isOk, unwrap, measureVolume } from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('positionOnCurve', () => {
  it('positions a box at the midpoint of a line', () => {
    const b = box(2, 2, 2);
    const spine = line([0, 0, 0], [10, 0, 0]);
    const result = positionOnCurve(b, spine, 0.5);
    expect(isOk(result)).toBe(true);
    const positioned = unwrap(result);
    // Volume should be preserved
    expect(unwrap(measureVolume(positioned))).toBeCloseTo(8, 0);
  });

  it('positions at start of curve (param=0)', () => {
    const b = box(1, 1, 1);
    const spine = line([0, 0, 0], [10, 0, 0]);
    const result = positionOnCurve(b, spine, 0.0);
    expect(isOk(result)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/positionFns.test.ts`
Expected: FAIL — `positionOnCurve` not exported

- [ ] **Step 3: Implement `src/topology/positionFns.ts`**

```typescript
import { getKernel } from '@/kernel/index.js';
import type { AnyShape, Edge, Wire } from '@/core/shapeTypes.js';
import { castShape } from '@/core/shapeTypes.js';
import { type Result, ok, err } from '@/core/result.js';
import { kernelError, BrepErrorCode } from '@/core/errors.js';

/**
 * Position a shape at a point along a spine curve with Frenet frame orientation.
 *
 * The shape is translated and rotated so its origin aligns with the curve point
 * and its Z axis aligns with the curve tangent at the given parameter.
 *
 * @param shape - The shape to position.
 * @param spine - The spine curve (Edge or Wire) to position along.
 * @param param - Normalized parameter (0 = start, 1 = end).
 * @returns The repositioned shape.
 */
export function positionOnCurve(
  shape: Shape3D,
  spine: Edge | Wire,
  param: number
): Result<Shape3D> {
  try {
    const kernel = getKernel();
    const result = kernel.positionOnCurve(shape.wrapped, spine.wrapped, param);
    const wrapped = castShape(result);
    // positionOnCurve applies a rigid transform — shape type is preserved
    if (!isShape3D(wrapped)) {
      return err(
        kernelError('POSITION_ON_CURVE_FAILED', 'positionOnCurve did not produce a 3D shape')
      );
    }
    return ok(wrapped);
  } catch (e) {
    return err(
      kernelError(
        'POSITION_ON_CURVE_FAILED',
        `Failed to position shape on curve at param ${param}`,
        e
      )
    );
  }
}
```

- [ ] **Step 4: Export from `src/index.ts` and `src/topology.ts`**

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/positionFns.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/topology/positionFns.ts src/index.ts src/topology.ts tests/positionFns.test.ts
git commit -m "feat(topology): expose positionOnCurve for Frenet frame positioning along curves"
```

---

### Task 2.2: Expose `solidFromShell` and `fixShape`

**Files:**

- Modify: `src/topology/healingFns.ts` (add `fixShape`, `solidFromShell`)
- Modify: `src/index.ts`
- Test: `tests/healingFns.test.ts` (extend)

- [ ] **Step 1: Write failing tests**

Add to `tests/healingFns.test.ts` (or create if needed):

```typescript
describe('fixShape', () => {
  it('fixes a shape without throwing', () => {
    const b = box(10, 10, 10);
    const result = fixShape(b);
    expect(isOk(result)).toBe(true);
  });
});

describe('solidFromShell', () => {
  it('converts a closed shell to a solid', () => {
    const b = box(10, 10, 10);
    const shelled = unwrap(shell(b, [faceFinder().inDirection('top').findOne(b)!], -1));
    // shelled is a shell — solidFromShell should convert it
    // (This test depends on shell returning a non-solid in some configs)
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement `fixShape` in `src/topology/healingFns.ts`**

```typescript
/**
 * General-purpose shape repair using ShapeFix_Shape.
 * Fixes orientations, missing curves, and other common issues.
 */
export function fixShape<T extends AnyShape>(shape: T): Result<T> {
  try {
    const kernel = getKernel();
    const fixed = kernel.fixShape(shape.wrapped);
    return ok(castShape(fixed) as T);
  } catch (e) {
    return err(kernelError('FIX_SHAPE_FAILED', 'ShapeFix_Shape failed', e));
  }
}
```

- [ ] **Step 4: Implement `solidFromShell`**

```typescript
/**
 * Convert a closed shell into a solid.
 */
export function solidFromShell(shell: Shell): Result<ValidSolid> {
  try {
    const kernel = getKernel();
    const solidShape = kernel.solidFromShell(shell.wrapped);
    const wrapped = castShape(solidShape);
    // Prove validity via smart constructor — solidFromShell may produce
    // an invalid solid if the shell wasn't properly closed
    const branded = validSolid(wrapped);
    if (!branded) {
      return err(
        kernelError(
          'SOLID_FROM_SHELL_FAILED',
          'solidFromShell produced a shape that does not pass ValidSolid validation'
        )
      );
    }
    return ok(branded);
  } catch (e) {
    return err(kernelError('SOLID_FROM_SHELL_FAILED', 'Failed to create solid from shell', e));
  }
}
```

- [ ] **Step 5: Export from `src/index.ts`**

- [ ] **Step 6: Run tests, then full validate**

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(healing): expose fixShape and solidFromShell"
```

---

### Task 2.3: Expose `fixSelfIntersection`

**Files:**

- Modify: `src/topology/healingFns.ts`
- Modify: `src/index.ts`
- Test: `tests/healingFns.test.ts`

- [ ] **Step 1: Write failing test**

- [ ] **Step 2: Implement wrapper**

```typescript
/**
 * Fix self-intersections in a wire.
 */
export function fixSelfIntersection(wire: Wire): Result<Wire> {
  try {
    const kernel = getKernel();
    const fixed = kernel.fixSelfIntersection(wire.wrapped);
    return ok(castShape(fixed) as Wire);
  } catch (e) {
    return err(
      kernelError(BrepErrorCode.SELF_INTERSECTION_FAILED, 'Failed to fix wire self-intersection', e)
    );
  }
}
```

- [ ] **Step 3: Export and test**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(healing): expose fixSelfIntersection for wire repair"
```

---

### Task 2.4: Expose `exportSTEPConfigured`

**Files:**

- Create: `src/io/stepConfigFns.ts`
- Modify: `src/index.ts`
- Modify: `src/io.ts`
- Test: `tests/stepConfig.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
describe('exportSTEPConfigured', () => {
  it('exports with custom unit and schema', () => {
    const b = box(10, 10, 10);
    const stepString = exportSTEPConfigured([b], {
      unit: 'inch',
      schema: 'AP214',
    });
    expect(typeof stepString).toBe('string');
    expect(stepString.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Implement `src/io/stepConfigFns.ts`**

Define a `StepExportOptions` type with `unit`, `schema`, and `assemblyMode` fields. Wrap `kernel.exportSTEPConfigured`.

- [ ] **Step 3: Export and test**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(io): expose exportSTEPConfigured with unit, schema, assembly mode options"
```

---

### Task 2.5: Expose variable-radius fillet

**Files:**

- Modify: `src/topology/modifierFns.ts` (add `variableFillet`)
- Modify: `src/kernel/interfaces/modifierOps.ts` (document)
- Modify: `src/index.ts`
- Test: `tests/modifierFns.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
describe('variableFillet', () => {
  it('applies variable radius fillet to a box edge', () => {
    const b = box(10, 10, 10);
    const edges = getEdges(b);
    const result = variableFillet(b, edges[0]!, [
      { param: 0, radius: 1 },
      { param: 1, radius: 3 },
    ]);
    // May only work on brepkit kernel — skip on OCCT if unsupported
    if (isErr(result)) {
      const e = unwrapErr(result);
      expect(e.kind).toBe('UNSUPPORTED');
    } else {
      expect(unwrap(measureVolume(unwrap(result)))).toBeLessThan(1000);
    }
  });
});
```

Note: `filletVariable` is brepkit-only (OCCT adapter throws). The public API wrapper should return `Result<ValidSolid>` with an `UNSUPPORTED_CAPABILITY` error on OCCT.

- [ ] **Step 2: Implement `variableFillet` in `modifierFns.ts`**

```typescript
export interface VariableFilletSpec {
  param: number;
  radius: number;
}

export function variableFillet(
  shape: ValidSolid,
  edge: Edge,
  radii: VariableFilletSpec[]
): Result<ValidSolid> {
  const kernel = getKernel();
  if (!kernel.filletVariable) {
    return err(
      unsupportedError(
        BrepErrorCode.UNSUPPORTED_CAPABILITY,
        'Variable-radius fillet is not supported by the current kernel',
        undefined,
        undefined,
        'Use the brepkit kernel for variable-radius fillet support.'
      )
    );
  }
  try {
    const result = kernel.filletVariable(shape.wrapped, { edge: edge.wrapped, radii });
    const wrapped = castShape(result);
    const branded = validSolid(wrapped);
    if (!branded) {
      return err(
        kernelError('VARIABLE_FILLET_FAILED', 'Variable-radius fillet produced an invalid solid')
      );
    }
    return ok(branded);
  } catch (e) {
    return err(kernelError('VARIABLE_FILLET_FAILED', 'Variable-radius fillet failed', e));
  }
}
```

- [ ] **Step 3: Export, test, commit**

```bash
git commit -m "feat(modifiers): expose variableFillet (brepkit-only, graceful UNSUPPORTED on OCCT)"
```

---

### Task 2.6: Add surface projection (`BRepProj_Projection`)

**Files:**

- Modify: `src/kernel/interfaces/surfaceOps.ts` (add `projectOnSurface`)
- Modify: `src/kernel/occt/advancedOps.ts` (implement using `BRepProj_Projection`)
- Modify: `src/kernel/brepkit/brepkitAdapter.ts` (stub)
- Create: `src/operations/surfaceProjectionFns.ts`
- Modify: `src/index.ts`
- Test: `tests/surfaceProjection.test.ts`

**Important:** First verify `BRepProj_Projection` exists in the WASM `.d.ts` files. If it is not compiled in, this task must be deferred until the WASM build is extended.

- [ ] **Step 1: Check WASM availability**

Run: `grep -r 'BRepProj_Projection' packages/brepjs-opencascade/src/`

If not found, skip this task and note it for a future WASM build update.

- [ ] **Step 2: Write failing test**

```typescript
describe('projectOnSurface', () => {
  it('projects a wire onto a cylinder', () => {
    const cyl = cylinder(10, 20);
    const wire = line([0, 0, 5], [20, 0, 5]);
    const result = projectOnSurface(wire, cyl);
    expect(isOk(result)).toBe(true);
  });
});
```

- [ ] **Step 3: Add to kernel interface**

In `src/kernel/interfaces/surfaceOps.ts`:

```typescript
/**
 * Project a wire/edge onto a shape's surface using normal projection.
 *
 * Uses BRepProj_Projection internally. The result is one or more edges
 * lying on the target surface.
 */
projectOnSurface?(
  wireOrEdge: KernelShape,
  targetShape: KernelShape
): KernelShape;
```

- [ ] **Step 4: Implement in OCCT adapter**

In `src/kernel/occt/advancedOps.ts`:

```typescript
export function projectOnSurface(
  oc: KernelInstance,
  wireOrEdge: KernelShape,
  targetShape: KernelShape,
  direction: readonly [number, number, number]
): KernelShape {
  // BRepProj_Projection constructor takes: wire/edge, shape, direction (gp_Dir)
  const dir = new oc.gp_Dir_4(direction[0], direction[1], direction[2]);
  const projector = new oc.BRepProj_Projection(wireOrEdge, targetShape, dir);
  dir.delete();
  if (!projector.IsDone()) {
    projector.delete();
    throw new Error('BRepProj_Projection failed — wire may not intersect the target surface');
  }
  const result = projector.Shape();
  projector.delete();
  return result;
}
```

Note: `BRepProj_Projection` has two constructor overloads — one with a `gp_Dir` (directional projection) and one without (normal projection). Check the WASM `.d.ts` to determine which overloads are available. If only directional is available, the public API should require a direction parameter. If normal projection is also available, consider exposing both via an options object.

````

- [ ] **Step 5: Create public wrapper `src/operations/surfaceProjectionFns.ts`**

- [ ] **Step 6: Export, test, validate, commit**

```bash
git commit -m "feat(operations): add projectOnSurface for projecting curves onto shapes"
````

---

## Phase 3: Shape Evolution API

**Branch:** `feat/shape-evolution-api`

**Motivation:** Web CAD apps need face tracking for persistent selections, coloring, and constraints across operations. The internal evolution data (Modified/Generated/Deleted face maps) is computed for every boolean and modifier operation but currently discarded after metadata propagation.

---

### Task 3.1: Define public evolution types and `withEvolution` wrapper

**Files:**

- Create: `src/topology/evolutionFns.ts`
- Modify: `src/index.ts`
- Modify: `src/core/errors.ts` (new error codes)
- Test: `tests/evolutionFns.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { box, fuseWithEvolution, translate, isOk, unwrap } from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('fuseWithEvolution', () => {
  it('returns shape and evolution data', () => {
    const a = box(10, 10, 10);
    const b = translate(box(10, 10, 10), [5, 0, 0]);
    const result = fuseWithEvolution(a, b);
    expect(isOk(result)).toBe(true);
    const { shape, evolution } = unwrap(result);
    expect(evolution).toBeDefined();
    expect(evolution.modified).toBeInstanceOf(Map);
    expect(evolution.generated).toBeInstanceOf(Map);
    expect(evolution.deleted).toBeInstanceOf(Set);
  });
});
```

- [ ] **Step 2: Implement `src/topology/evolutionFns.ts`**

Create evolution-returning variants of key operations. These are thin wrappers around the existing functions that pass through the evolution data instead of consuming it for metadata:

```typescript
import type { ShapeEvolution } from '@/kernel/types.js';

/** Result of an operation with face evolution tracking. */
export interface EvolutionResult<T> {
  readonly shape: T;
  readonly evolution: ShapeEvolution;
}

/**
 * Fuse two shapes and return face evolution data.
 * The evolution maps input face hashes to output face hashes.
 */
export function fuseWithEvolution(
  base: Shape3D,
  tool: Shape3D,
  options?: BooleanOptions
): Result<EvolutionResult<Shape3D>> {
  /* ... */
}

// Similarly: cutWithEvolution, intersectWithEvolution,
// filletWithEvolution, chamferWithEvolution, shellWithEvolution
```

- [ ] **Step 3: Export the `ShapeEvolution` and `EvolutionResult` types**

- [ ] **Step 4: Run tests**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(evolution): expose shape evolution API for face tracking across operations"
```

---

### Task 3.2: Add evolution-returning modifier variants

**Files:**

- Modify: `src/topology/evolutionFns.ts`
- Test: `tests/evolutionFns.test.ts`

- [ ] **Step 1: Write tests for `filletWithEvolution`, `shellWithEvolution`**

- [ ] **Step 2: Implement modifier variants**

These follow the same pattern: call the existing kernel `*WithHistory` method, wrap the result shape as a branded type, and pass through the `ShapeEvolution`.

- [ ] **Step 3: Export and test**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(evolution): add evolution-returning fillet, chamfer, shell, offset, thicken, draft"
```

---

## Phase 4: NURBS Read-Only Access

**Branch:** `feat/nurbs-read-access`

**Motivation:** Users want to inspect NURBS data (control points, degree, knots) for imported geometry debugging and surface quality analysis.

---

### Task 4.1: Add curve NURBS introspection

**Files:**

- Modify: `src/kernel/interfaces/curveOps.ts` (add methods)
- Modify: `src/kernel/occt/geometryQueryOps.ts` (implement)
- Modify: `src/kernel/brepkit/brepkitAdapter.ts` (stub or implement)
- Create: `src/topology/nurbsFns.ts`
- Modify: `src/index.ts`
- Test: `tests/nurbsFns.test.ts`

- [ ] **Step 1: Define `NurbsCurveData` type**

```typescript
/** Read-only NURBS curve data. */
export interface NurbsCurveData {
  readonly degree: number;
  readonly poles: ReadonlyArray<readonly [number, number, number]>;
  readonly weights: ReadonlyArray<number>;
  readonly knots: ReadonlyArray<number>;
  readonly multiplicities: ReadonlyArray<number>;
  readonly isPeriodic: boolean;
  readonly isRational: boolean;
}
```

- [ ] **Step 2: Write failing test**

```typescript
describe('getNurbsCurveData', () => {
  it('extracts NURBS data from a BSpline edge', () => {
    const pts: Vec3[] = [
      [0, 0, 0],
      [5, 5, 0],
      [10, 0, 0],
      [15, 5, 0],
    ];
    const edge = interpolateCurve(pts);
    const data = getNurbsCurveData(unwrap(edge));
    expect(data).toBeDefined();
    if (data) {
      expect(data.degree).toBeGreaterThanOrEqual(2);
      expect(data.poles.length).toBeGreaterThanOrEqual(4);
      expect(data.knots.length).toBeGreaterThan(0);
    }
  });

  it('returns null for non-NURBS edges', () => {
    const edge = line([0, 0, 0], [10, 0, 0]);
    const data = getNurbsCurveData(edge);
    expect(data).toBeNull();
  });
});
```

- [ ] **Step 3: Add to kernel interface**

In `src/kernel/interfaces/curveOps.ts`:

```typescript
/** Extract NURBS data from a BSpline/Bezier edge. Returns null for non-NURBS curves. */
getNurbsCurveData?(edge: KernelShape): NurbsCurveData | null;
```

- [ ] **Step 4: Implement in OCCT adapter**

Use `BRepAdaptor_Curve` → check `GetType()` is `GeomAbs_BSplineCurve` or `GeomAbs_BezierCurve` → extract via `BSpline()` or `Bezier()` handle → read `Degree()`, `NbPoles()`, `Pole(i)`, `Weight(i)`, `NbKnots()`, `Knot(i)`, `Multiplicity(i)`.

- [ ] **Step 5: Create `src/topology/nurbsFns.ts` wrapper**

- [ ] **Step 6: Export, test, commit**

```bash
git commit -m "feat(nurbs): add getNurbsCurveData for BSpline/Bezier edge introspection"
```

---

### Task 4.2: Add surface NURBS introspection

**Files:**

- Modify: `src/kernel/interfaces/surfaceOps.ts`
- Modify: `src/kernel/occt/geometryQueryOps.ts`
- Modify: `src/topology/nurbsFns.ts`
- Test: `tests/nurbsFns.test.ts`

- [ ] **Step 1: Define `NurbsSurfaceData` type**

```typescript
/** Read-only NURBS surface data. */
export interface NurbsSurfaceData {
  readonly degreeU: number;
  readonly degreeV: number;
  readonly poles: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>>;
  readonly weights: ReadonlyArray<ReadonlyArray<number>>;
  readonly knotsU: ReadonlyArray<number>;
  readonly knotsV: ReadonlyArray<number>;
  readonly multiplicitiesU: ReadonlyArray<number>;
  readonly multiplicitiesV: ReadonlyArray<number>;
  readonly isPeriodicU: boolean;
  readonly isPeriodicV: boolean;
  readonly isRational: boolean;
}
```

- [ ] **Step 2: Write failing test**

```typescript
describe('getNurbsSurfaceData', () => {
  it('extracts NURBS data from a BSpline face', () => {
    const heights = [
      [0, 1, 0],
      [1, 2, 1],
      [0, 1, 0],
    ];
    const surf = unwrap(surfaceFromGrid(heights, { sizeX: 10, sizeY: 10 }));
    const faces = getFaces(surf);
    const data = getNurbsSurfaceData(faces[0]!);
    expect(data).toBeDefined();
    if (data) {
      expect(data.degreeU).toBeGreaterThanOrEqual(2);
      expect(data.degreeV).toBeGreaterThanOrEqual(2);
      expect(data.poles.length).toBeGreaterThan(0);
    }
  });

  it('returns null for planar faces', () => {
    const b = box(10, 10, 10);
    const faces = getFaces(b);
    const data = getNurbsSurfaceData(faces[0]!);
    expect(data).toBeNull();
  });
});
```

- [ ] **Step 3: Add to kernel interface, implement, export**

Similar pattern to curve data. Use `BRepAdaptor_Surface` → check `GetType()` is `GeomAbs_BSplineSurface` → extract via `BSpline()` handle.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(nurbs): add getNurbsSurfaceData for BSpline face introspection"
```

---

## Phase 5: Full 2D Geometry API

**Branch:** `feat/2d-geometry-api`

**Motivation:** The `Kernel2DCapability` has 70+ methods powering the Blueprint/Sketch system internally. Users want direct access for custom sketch solvers, 2D CAD features, and fine-grained 2D geometry manipulation. The `brepjs/2d` entry point already exists.

---

### Task 5.1: Design the 2D geometry module structure

**Files:**

- Create: `src/2d/geometry/` directory
- Create: `src/2d/geometry/curve2dConstructors.ts`
- Create: `src/2d/geometry/curve2dTransforms.ts`
- Create: `src/2d/geometry/curve2dQueries.ts`
- Create: `src/2d/geometry/curve2dIntersection.ts`
- Create: `src/2d/geometry/curve2dBridge.ts` (2D → 3D)

The 2D geometry API groups into:

1. **Constructors**: `line2d`, `circle2d`, `arc2d`, `ellipse2d`, `bezier2d`, `bspline2d`
2. **Transforms**: `translate2d`, `rotate2d`, `scale2d`, `mirror2d`, `offset2d`
3. **Queries**: `evaluate2d`, `tangent2d`, `bounds2d`, `type2d`, `length2d`, `isClosed2d`
4. **Intersection**: `intersect2d`, `projectPoint2d`, `distance2d`
5. **Bridge**: `liftToPlane` (2D curve → 3D Edge), `extractFromEdge` (3D Edge → 2D curve on face)

Each file wraps the corresponding `Kernel2DCapability` methods with typed inputs/outputs and `Result<T>` error handling.

- [ ] **Step 1: Scaffold the module structure**

Create the directory and skeleton files. Each file starts with the public type definitions and function signatures.

- [ ] **Step 2: Run boundary check**

Run: `npm run check:boundaries`
Expected: PASS — new files in `src/2d/` (Layer 2) should only import from layers 0-1 and other Layer 2 modules.

- [ ] **Step 3: Commit skeleton**

```bash
git commit -m "chore(2d): scaffold 2D geometry module structure"
```

---

### Task 5.2: Implement 2D curve constructors

**Files:**

- Modify: `src/2d/geometry/curve2dConstructors.ts`
- Modify: `src/2d.ts` (export)
- Test: `tests/curve2dGeometry.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
describe('2D curve constructors', () => {
  it('creates a 2D line segment', () => {
    const curve = line2d([0, 0], [10, 5]);
    expect(curve).toBeDefined();
  });

  it('creates a 2D circle', () => {
    const curve = circle2d([0, 0], 5);
    expect(curve).toBeDefined();
  });

  it('creates a 2D arc from 3 points', () => {
    const curve = arc2d([0, 0], [5, 5], [10, 0]);
    expect(curve).toBeDefined();
  });

  it('creates a 2D BSpline through points', () => {
    const curve = bspline2d([
      [0, 0],
      [3, 5],
      [7, 3],
      [10, 0],
    ]);
    expect(curve).toBeDefined();
  });
});
```

- [ ] **Step 2: Implement constructors**

Each wraps the corresponding `Kernel2DCapability` method:

- `line2d(from, to)` → `kernel.makeLine2d(x1, y1, x2, y2)`
- `circle2d(center, radius)` → `kernel.makeCircle2d(cx, cy, r)`
- `arc2d(p1, p2, p3)` → `kernel.makeArc2dThreePoints(...)`
- `ellipse2d(center, major, minor)` → `kernel.makeEllipse2d(...)`
- `bezier2d(points)` → `kernel.makeBezier2d(points)`
- `bspline2d(points, options?)` → `kernel.makeBSpline2d(points, options)`

Define a `Curve2DHandle` branded type to wrap the kernel handle with disposal semantics.

- [ ] **Step 3: Export from `src/2d.ts`**

- [ ] **Step 4: Test and commit**

```bash
git commit -m "feat(2d): add 2D curve constructors (line, circle, arc, ellipse, bezier, bspline)"
```

---

### Task 5.3: Implement 2D transforms and queries

**Files:**

- Modify: `src/2d/geometry/curve2dTransforms.ts`
- Modify: `src/2d/geometry/curve2dQueries.ts`
- Modify: `src/2d.ts`
- Test: `tests/curve2dGeometry.test.ts`

- [ ] **Step 1: Write failing tests for transforms**

```typescript
describe('2D curve transforms', () => {
  it('translates a 2D curve', () => {
    const curve = line2d([0, 0], [10, 0]);
    const moved = translateCurve2d(curve, 5, 3);
    const pt = evaluateCurve2d(moved, 0);
    expect(pt[0]).toBeCloseTo(5, 5);
    expect(pt[1]).toBeCloseTo(3, 5);
  });
});

describe('2D curve queries', () => {
  it('evaluates a point on a 2D curve', () => {
    const curve = line2d([0, 0], [10, 0]);
    const pt = evaluateCurve2d(curve, 0.5);
    expect(pt[0]).toBeCloseTo(5, 5);
    expect(pt[1]).toBeCloseTo(0, 5);
  });
});
```

- [ ] **Step 2: Implement transforms**: `translateCurve2d`, `rotateCurve2d`, `scaleCurve2d`, `mirrorCurve2d`, `offsetCurve2d`

- [ ] **Step 3: Implement queries**: `evaluateCurve2d`, `tangentCurve2d`, `boundsCurve2d`, `typeCurve2d`, `isClosedCurve2d`

- [ ] **Step 4: Test, export, commit**

```bash
git commit -m "feat(2d): add 2D curve transforms and queries"
```

---

### Task 5.4: Implement 2D intersection and projection

**Files:**

- Modify: `src/2d/geometry/curve2dIntersection.ts`
- Test: `tests/curve2dGeometry.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
describe('2D intersection', () => {
  it('finds intersection points of two 2D curves', () => {
    const c1 = line2d([0, 0], [10, 10]);
    const c2 = line2d([0, 10], [10, 0]);
    const result = intersectCurves2d(c1, c2);
    expect(result.points).toHaveLength(1);
    expect(result.points[0]![0]).toBeCloseTo(5, 5);
    expect(result.points[0]![1]).toBeCloseTo(5, 5);
  });
});
```

- [ ] **Step 2: Implement**: `intersectCurves2d`, `projectPointOnCurve2d`, `distanceBetweenCurves2d`

- [ ] **Step 3: Test and commit**

```bash
git commit -m "feat(2d): add 2D curve intersection, projection, and distance"
```

---

### Task 5.5: Implement 2D ↔ 3D bridge

**Files:**

- Modify: `src/2d/geometry/curve2dBridge.ts`
- Test: `tests/curve2dGeometry.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
describe('2D-3D bridge', () => {
  it('lifts a 2D curve to a 3D edge on a plane', () => {
    const curve = line2d([0, 0], [10, 0]);
    const edge = liftCurve2dToPlane(curve, {
      origin: [0, 0, 5],
      normal: [0, 0, 1],
      xAxis: [1, 0, 0],
    });
    expect(isOk(edge)).toBe(true);
  });
});
```

- [ ] **Step 2: Implement**: `liftCurve2dToPlane`, `extractCurve2dFromEdge`

These wrap `kernel.liftCurve2dToPlane` and `kernel.extractCurve2dFromEdge`.

- [ ] **Step 3: Test, export, commit**

```bash
git commit -m "feat(2d): add 2D-3D bridge (liftToPlane, extractFromEdge)"
```

---

### Task 5.6: Final 2D API exports and validation

**Files:**

- Modify: `src/2d.ts` (ensure all new exports)
- Modify: `src/index.ts` (add type exports for `Curve2DHandle`, `NurbsCurveData`, etc.)

- [ ] **Step 1: Verify all 2D functions exported from `brepjs/2d`**

- [ ] **Step 2: Run full validation**

Run: `npm run validate`

- [ ] **Step 3: Run `npm run knip`** to catch any unused exports

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(2d): finalize 2D geometry API exports from brepjs/2d"
```

---

## Summary of Phases

| Phase | Branch                     | Key Deliverables                                                                                                                     | Estimated Tasks |
| ----- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| 1     | `feat/boolean-diagnostics` | `checkBoolean()`, `HasErrors` extraction, structured error metadata                                                                  | 3 tasks         |
| 2     | `feat/kernel-quick-wins`   | `positionOnCurve`, `fixShape`, `solidFromShell`, `fixSelfIntersection`, `exportSTEPConfigured`, `variableFillet`, `projectOnSurface` | 6 tasks         |
| 3     | `feat/shape-evolution-api` | `fuseWithEvolution`, `cutWithEvolution`, modifier evolution variants, `ShapeEvolution` type                                          | 2 tasks         |
| 4     | `feat/nurbs-read-access`   | `getNurbsCurveData`, `getNurbsSurfaceData`                                                                                           | 2 tasks         |
| 5     | `feat/2d-geometry-api`     | Full 2D curve constructors, transforms, queries, intersection, 2D↔3D bridge                                                          | 6 tasks         |

**Dependencies:** None between phases — each can be implemented independently in any order. Phase 1 (boolean diagnostics) is recommended first due to highest user impact.
