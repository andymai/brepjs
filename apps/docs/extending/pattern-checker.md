---
title: Pattern Checker Rules
description: "AST-based linter rules that catch issues ESLint can't: kernel routing, memory cleanup, code-quality thresholds. The catalog and fix recipes."
---

# Pattern Checker Rules

`npm run check:patterns` runs `scripts/check-patterns.ts`, an AST-based linter that catches structural issues ESLint can't. The rules protect invariants the architecture depends on — kernel-routing, memory cleanup, code-quality thresholds. This chapter is the rule catalog: what each rule prevents, why, and how to fix or disable a violation.

## Running the checker

```bash
npm run check:patterns
```

Failures are listed with file:line:col, the rule ID, and a short explanation. The pre-commit hook runs the checker on staged files; CI runs it on the full tree.

To regenerate the baseline (after fixing existing violations or accepting them):

```bash
npm run check:patterns:baseline
```

The baseline is `scripts/.patterns-baseline.json`. New violations beyond the baseline fail the build; baselined violations are recorded as known.

## The rules

### `async-with-kernel`

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

**Inline disable**: `// brepjs-patterns-disable: async-with-kernel`. Required only when the async callback is genuinely synchronous in effect (rare).

### `wrapped-method-call`

**What it catches**: `shape.wrapped.someMethod(...)` in Layer 2+ code.

```typescript
// ❌ (in Layer 2 file)
const v = solid.wrapped.Volume();
```

**Why**: Layer 2+ must route through `getKernel()` so the kernel is swappable. Direct `.wrapped` calls break dual-kernel testing.

**Fix**:

```typescript
// ✓
import { getKernel } from '@/kernel/index.js';

const v = getKernel().measureVolume(solid.wrapped);
```

**Layer 0 exception**: kernel adapters are allowed to call `.wrapped` methods because that's what they do. The checker scopes this rule to layers 1+.

### `double-cast`

**What it catches**: `x as unknown as T`.

```typescript
// ❌
const wireHandle = rawHandle as unknown as Wire;
```

**Why**: Double-casting bypasses TypeScript's type system entirely. Almost always a sign that the type chain has a real gap that should be fixed at the source.

**Fix**: Add the missing type; use `assertWire(handle)` runtime check; or use `@ts-expect-error -- reason` for the genuinely intractable cases.

**Inline disable**: `// brepjs-patterns-disable: double-cast` with a comment explaining why.

### `missing-using-on-handle`

**What it catches**: Allocations of disposable handles without `using` or `withScope` tracking, in functions that are likely to leak.

```typescript
// ❌
function leaky() {
  const temp = box(10, 10, 10);
  return measureVolume(temp); // temp not disposed
}
```

**Why**: WASM handles aren't GC'd. Functions that allocate without tracking leak the handle into the kernel's heap.

**Fix**:

```typescript
// ✓
function clean() {
  using temp = box(10, 10, 10);
  return measureVolume(temp);
}
```

The rule is heuristic — it can produce false positives when the handle is intentionally returned (in which case the _caller_ is responsible). Use `// brepjs-patterns-disable: missing-using-on-handle` when the lifetime escapes the function.

### `function-too-long`

**What it catches**: Function bodies over 60 lines (configurable threshold).

**Why**: Long functions are harder to test, harder to review, harder to refactor. The threshold is a discussion-starter, not a hard rule.

**Fix**: Extract sub-functions. The 60-line threshold is empirically the line above which function comprehension drops sharply.

### `nesting-too-deep`

**What it catches**: Code with more than 4 levels of indentation (configurable).

```typescript
// ❌
function deep() {
  if (x) {
    if (y) {
      for (const item of items) {
        if (item.condition) {
          // 5 levels deep
        }
      }
    }
  }
}
```

**Why**: Deep nesting indicates control flow that's hard to follow. Usually splittable into early returns or helper functions.

**Fix**: Early returns, guard clauses, extract loops to functions.

### `export-let`

**What it catches**: `export let foo = ...` (ESLint also bans this; the pattern checker is a backup).

**Why**: Mutable module-level exports break tree-shaking and create hidden global state.

**Fix**: Use `export const` with an internal mutable variable, exposed via a setter function if needed.

### `oc-access`

**What it catches**: Direct access to `.oc` (the raw OpenCascade module).

**Why**: Bypasses the kernel abstraction. `.oc` is private to the OpenCascade adapter.

**Fix**: Add the operation you need to `KernelInterface` and call it via `getKernel().method(...)`.

## Inline disables

For each rule, the comment-disable syntax is:

<!-- @no-test -->

```typescript
// brepjs-patterns-disable: <rule-id>
const violatesRule = ...; // disable applies to the next line

const inline = ...; // brepjs-patterns-disable: <rule-id> (inline)
```

Use these sparingly. Each disable should have a comment explaining _why_ the rule doesn't apply — "this is a kernel adapter, .wrapped access is fine here", "the lifetime escapes via the return value", etc.

## When the rules are wrong

Sometimes a rule is over-eager:

- **`missing-using-on-handle` on test setup**: tests often allocate without scoping because the test process exits after.
- **`function-too-long` on switch statements**: a long `switch` with many cases is sometimes the right shape.
- **`double-cast` in WASM bindings**: occasional unavoidable casts when wrapping untyped C APIs.

For these, inline-disable with a clear reason. If the same disable appears in many places, consider whether the rule needs adjustment — open an issue.

## Adding a rule

The checker is in `scripts/check-patterns.ts`. Each rule is a function that walks the TypeScript AST and reports findings. To add a new rule:

1. Implement the visitor function.
2. Add it to the rule registry at the top of the file.
3. Run `npm run check:patterns:baseline` to capture the current state.
4. Document the rule here.

Most useful new rules detect class-of-bug, not single instances. If a recent bug fix had a clear pattern that an AST check could prevent, that's a good candidate rule.

## Why these and not ESLint?

ESLint runs at parse-tree level — fast, but limited. The pattern checker runs at the type-checked AST level using the TypeScript compiler API, so it knows the actual types and can make decisions ESLint can't. The trade-off: it's slower (typecheck-then-walk vs. parse-then-walk).

In brepjs, ESLint covers the syntax-level rules (`no-explicit-any`, `prefer-const`, `import-extensions`) and the pattern checker covers the semantic-level rules (`wrapped-method-call`, `async-with-kernel`).

## Next steps

- [Architecture & Layers](./architecture) — the rules the checker protects
- [Writing Custom Operations](./custom-ops) — building code that passes the checks
- [Kernel Conformance Suite](./conformance) — the test suite that complements the checks
