---
title: Pattern Checker Rules
description: "AST-based linter rules that catch issues ESLint can't: kernel routing, memory cleanup, code-quality thresholds. The catalog and fix recipes."
---

# Pattern Checker Rules

`npm run check:patterns` runs `scripts/check-patterns.ts`, an AST-based linter that catches structural issues ESLint can't. The rules protect invariants the architecture depends on: kernel-routing, memory cleanup, code-quality thresholds. This chapter is the rule catalog: what each rule prevents, why, and how to fix or disable a violation.

## Running the checker

```bash
npm run check:patterns
```

Failures are listed with file:line:col, the rule ID, and a short explanation. The pre-commit hook runs the checker on staged files; CI runs it on the full tree.

To regenerate the baseline (after fixing existing violations or accepting them):

```bash
npm run check:patterns:baseline
```

The baseline is `.pattern-baseline.json` at the repo root. New violations beyond the baseline fail the build; baselined violations are recorded as known.

## The rules

### `no-async-withkernel`

**What it catches**: `withKernel(id, async () => { ... })`.

```typescript
// ❌
withKernel('brepkit', async () => {
  await someAsyncOp();
});
```

**Why**: `withKernel` is synchronous. After the first `await`, the active kernel reverts. The `async` callback silently runs subsequent operations against the wrong kernel.

**Fix**: For async work, use `getKernel(id)` directly:

```typescript
// ✓
import { getKernel } from 'brepjs';

const k = getKernel('brepkit');
await someAsyncOpWith(k);
```

**Inline disable**: `// brepjs-patterns-disable: no-async-withkernel`. Required only when the async callback is genuinely synchronous in effect (rare).

### `.wrapped` method calls (ESLint)

**What it catches**: `shape.wrapped.someMethod(...)` in Layer 2+ code. ESLint enforces this one via `no-restricted-syntax`, not the pattern checker.

```typescript
// ❌ (in Layer 2 file)
const v = solid.wrapped.Volume();
```

**Why**: Layer 2+ must route through `getKernel()` so the kernel is swappable. Direct `.wrapped` calls break dual-kernel testing.

**Fix**:

```typescript
// ✓
import { getKernel } from '@/kernel/index.js';

const v = getKernel().volume(solid.wrapped);
```

**Layer 0 exception**: kernel adapters are allowed to call `.wrapped` methods because that's what they do. The ESLint config scopes this rule to the Layer 2+ directories.

### `no-double-cast`

**What it catches**: `x as unknown as T` (or `as any as T`).

```typescript
// ❌
const wireHandle = rawHandle as unknown as Wire;
```

**Why**: Double-casting bypasses TypeScript's type system entirely. Almost always a sign that the type chain has a real gap that should be fixed at the source.

**Fix**: Add the missing type; use an `isWire(handle)` type guard; or use `@ts-expect-error -- reason` for the genuinely intractable cases.

**Inline disable**: `// brepjs-patterns-disable: no-double-cast` with a comment explaining why.

### `require-using-for-handles`

**What it catches**: `createHandle(...)` or `createKernelHandle(...)` calls whose result is not bound with `using`.

```typescript
// ❌
function leaky(raw: KernelShape) {
  const temp = createHandle(raw);
  return getKernel().volume(temp.wrapped); // temp not disposed
}
```

**Why**: WASM handles aren't GC'd. Functions that allocate without tracking leak the handle into the kernel's heap.

**Fix**:

```typescript
// ✓
function clean(raw: KernelShape) {
  using temp = createHandle(raw);
  return getKernel().volume(temp.wrapped);
}
```

The rule is heuristic. It already excuses a handle that is returned (the _caller_ is responsible), passed directly as a call argument (`scope.register(createHandle(...))`), or placed in an object or array literal. Use `// brepjs-patterns-disable: require-using-for-handles` when the lifetime escapes the function some other way.

### `max-function-lines`

**What it catches**: Function bodies over 60 effective lines, not counting blanks and comments (configurable threshold).

**Why**: Long functions are harder to test, harder to review, harder to refactor. The threshold is a discussion-starter, not a hard rule.

**Fix**: Extract sub-functions. The 60-line threshold is empirically the line above which function comprehension drops sharply.

### `max-nesting-depth`

**What it catches**: Control-flow statements (`if`, loops, `switch`, `try`) nested more than 4 deep within one function (configurable).

```typescript
// ❌
function deep() {
  if (x) {
    if (y) {
      for (const item of items) {
        if (item.condition) {
          if (item.ready) {
            // 5 levels deep
          }
        }
      }
    }
  }
}
```

**Why**: Deep nesting indicates control flow that's hard to follow. Usually splittable into early returns or helper functions.

**Fix**: Early returns, guard clauses, extract loops to functions.

### `export let` (ESLint)

**What it catches**: `export let foo = ...`. ESLint bans this via `no-restricted-syntax`; the pattern checker does not check it.

**Why**: Mutable module-level exports break tree-shaking and create hidden global state.

**Fix**: Use `export const` with an internal mutable variable, exposed via a setter function if needed.

### `.oc` access (ESLint)

**What it catches**: Direct access to `.oc` (the raw OpenCascade module) in Layer 2+ code. ESLint enforces this via `no-restricted-syntax`.

**Why**: Bypasses the kernel abstraction. `.oc` is private to the OpenCascade adapter.

**Fix**: Add the operation you need to `KernelAdapter` (`src/kernel/interfaces/`) and call it via `getKernel().method(...)`.

## Inline disables

For each rule, the comment-disable syntax is:

<!-- @no-test -->

```typescript
// brepjs-patterns-disable: <rule-id>
const violatesRule = ...; // disable applies to the next line

const inline = ...; // brepjs-patterns-disable: <rule-id> (inline)
```

Use these sparingly. Each disable should have a comment explaining _why_ the rule doesn't apply: "this is a kernel adapter, .wrapped access is fine here", "the lifetime escapes via the return value", etc.

## When the rules are wrong

Sometimes a rule is over-eager:

- **`max-function-lines` on switch statements**: a long `switch` with many cases is sometimes the right shape.
- **`no-double-cast` in WASM bindings**: occasional unavoidable casts when wrapping untyped C APIs.

For these, inline-disable with a clear reason. If the same disable appears in many places, consider whether the rule needs adjustment. Open an issue.

## Adding a rule

The checker is in `scripts/check-patterns.ts`. Each rule is a `Rule` object whose `check` function walks the TypeScript AST and reports findings. To add a new rule:

1. Implement the rule and its visitor function.
2. Add it to the `ALL_RULES` registry.
3. Run `npm run check:patterns:baseline` to capture the current state.
4. Document the rule here.

Most useful new rules detect class-of-bug, not single instances. If a recent bug fix had a clear pattern that an AST check could prevent, that's a good candidate rule.

## Why these and not ESLint?

The pattern checker parses each file with the TypeScript compiler API (`ts.createSourceFile`, syntax only, no type checker) and walks the AST in plain code. It carries its own fingerprinted baseline, so existing violations stand while new ones fail.

In brepjs, ESLint covers `no-explicit-any`, `prefer-const`, and the `.oc` / `.wrapped.method()` / `export let` bans (`no-restricted-syntax`); the pattern checker covers `no-async-withkernel`, `no-double-cast`, `require-using-for-handles`, `max-function-lines`, and `max-nesting-depth`.

## Next steps

- [Architecture & Layers](./architecture): the rules the checker protects
- [Writing Custom Operations](./custom-ops): building code that passes the checks
- [Kernel Conformance Suite](./conformance): the test suite that complements the checks
