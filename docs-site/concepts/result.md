---
title: Result and Errors
---

# Result and Errors

Every fallible operation in brepjs — every boolean, every fillet, every import, every export — returns a `Result<T, BrepError>` instead of throwing. This chapter explains why, how to handle it, and the patterns that keep error handling clean.

## What `Result<T, E>` is

```typescript
type Result<T, E = BrepError> = { ok: true; value: T } | { ok: false; error: E };
```

A discriminated union with two cases. Either the operation succeeded (`ok: true` with a `value`) or it failed (`ok: false` with an `error`). TypeScript narrows the union based on `ok`, so once you check, the value or error is concretely typed.

This is the same pattern used by Rust's `Result`, Haskell's `Either`, and a thousand other type systems that take error handling seriously. brepjs adopts it because boolean operations on B-Rep shapes are _fundamentally_ fallible — they can fail on near-coincident geometry, on invalid inputs, on tolerance issues — and a thrown exception buries the error several stack frames up from where the user can do anything useful with it.

## The four ways to handle a Result

### 1. `unwrap` — for scripts and tests

```typescript
import { box, cylinder, cut, unwrap } from 'brepjs/quick';

const part = unwrap(cut(box(20, 20, 20), cylinder(5, 25)));
console.log('Cut succeeded');
```

`unwrap()` extracts the value or throws on error. Use it in scripts, examples, and tests — places where a thrown exception is the right outcome on failure. **Do not use it in production code paths** where you want to recover or surface an error.

### 2. `isOk` / `isErr` — for control flow

```typescript
import { box, cylinder, cut, isOk } from 'brepjs/quick';

const result = cut(box(20, 20, 20), cylinder(5, 25));

if (isOk(result)) {
  // result is { ok: true, value: Shape3D }
  console.log('Got a solid');
} else {
  // result is { ok: false, error: BrepError }
  console.error('Cut failed:', result.error.code, result.error.message);
}
```

The most common pattern. Read the error fields and decide what to do — fall back, retry with adjusted parameters, surface to the user.

### 3. `match` — for exhaustive both-arms handling

```typescript
import { box, cylinder, cut, match, measureVolume } from 'brepjs/quick';

const summary = match(cut(box(20, 20, 20), cylinder(5, 25)), {
  ok: (s) => `Volume: ${measureVolume(s).toFixed(2)} mm³`,
  err: (e) => `Failed: ${e.code} — ${e.suggestion ?? 'no suggestion'}`,
});
console.log(summary);
```

Equivalent to the `if/else`, but expression-shaped — both arms produce a value of the same type. Useful when you want a single value out of the operation.

### 4. The fluent wrapper — auto-unwrap

```typescript
import { shape, box, cylinder, BrepWrapperError } from 'brepjs/quick';

try {
  const part = shape(box(20, 20, 20)).cut(cylinder(5, 25)).val;
  console.log('Part built');
} catch (err) {
  if (err instanceof BrepWrapperError) {
    console.error(err.code, err.message);
  }
}
```

The `shape()` wrapper automatically unwraps every operation in the chain. Failures throw `BrepWrapperError`, which carries the same `code` / `message` / `suggestion` fields as `BrepError`. Use this in casual code; switch back to the functional API when you need fine-grained recovery between steps.

## What `BrepError` carries

```typescript
type BrepError = {
  code: string; // stable identifier — e.g. 'BOOLEAN_NO_OVERLAP'
  message: string; // human-readable description
  suggestion?: string; // actionable recovery advice when available
  cause?: unknown; // underlying kernel error if applicable
};
```

The most useful fields:

- **`code`** — stable across releases. Switch on this for programmatic recovery (`if (e.code === 'FILLET_TOO_LARGE')`).
- **`suggestion`** — when the kernel returns a known failure mode, brepjs adds a one-line suggestion. Surface this to users when you can.

See [Error Codes](../reference/errors) for the full list.

## Recovery patterns

### Retry with adjusted parameters

```typescript
import { box, cylinder, cut, fillet, edgeFinder, isOk } from 'brepjs/quick';

const part = box(20, 20, 20);
const edges = edgeFinder().inDirection('Z').findAll(part);

const tryFillet = (radius: number) => fillet(part, edges, radius);
let result = tryFillet(3);
if (!isOk(result)) {
  // FILLET_TOO_LARGE? Try a smaller radius.
  result = tryFillet(1);
}
if (isOk(result)) {
  console.log('Filleted');
}
```

### Heal first, then operate

```typescript
import { box, cylinder, cut, autoHeal, isOk, unwrap } from 'brepjs/quick';

const a = box(20, 20, 20);
const b = cylinder(5, 25);

let result = cut(a, b);
if (!isOk(result) && result.error.code === 'INVALID_SHAPE') {
  // Inputs may have minor invalidity. Heal them.
  const healedA = unwrap(autoHeal(a));
  const healedB = unwrap(autoHeal(b));
  result = cut(healedA, healedB);
}
if (isOk(result)) {
  console.log('Cut after heal');
}
```

### Surface to UI

```typescript
import { box, cylinder, cut, match } from 'brepjs/quick';

declare function showError(message: string): void;
declare function showPart(part: import('brepjs').Shape3D): void;

const result = cut(box(20, 20, 20), cylinder(5, 25));
match(result, {
  ok: (part) => showPart(part),
  err: (e) => showError(e.suggestion ?? e.message),
});
```

## Why not exceptions?

Three reasons:

1. **Visibility in signatures.** A function that returns `Result<T, BrepError>` is visibly fallible. A function that returns `T` and might throw is not — you have to read the implementation or remember.
2. **No silent catches.** `try/catch` around a thrown error catches _every_ error, including programmer mistakes. `Result` requires you to handle the named failure mode and lets unexpected errors propagate.
3. **Composition.** Sequencing fallible operations is direct with `Result` (chain `match` calls or use `unwrap` in a script). With exceptions, every step needs a `try/catch` if you want to recover at granularity.

When brepjs _does_ throw, it is for unrecoverable programmer errors: calling a function before `init()` resolved (`KERNEL_NOT_INITIALIZED`), passing a non-shape to a shape parameter, etc. These never appear in `Result`.

## When to mix

A typical pattern: use the wrapper for the easy bits, switch to functional for the parts that need recovery.

```typescript
import { shape, box, cylinder, cut, fillet, edgeFinder, isOk } from 'brepjs/quick';

// Wrapper for primitives + first cut
const drilled = shape(box(20, 20, 20)).cut(cylinder(5, 25)).val;

// Functional for the fillet, because we want to fall back if it fails
const verticals = edgeFinder().inDirection('Z').findAll(drilled);
const filletResult = fillet(drilled, verticals, 2);
const final = isOk(filletResult) ? filletResult.value : drilled;
console.log('Final shape produced');
```

## Next steps

- [Error Codes](../reference/errors) — every error code and its recovery pattern
- [Healing & Sewing](../advanced/healing) — repairing shapes that don't pass `BRepCheck`
- [Boolean Operations](../tasks/booleans) — the most common source of `Result` failures and how to read them
