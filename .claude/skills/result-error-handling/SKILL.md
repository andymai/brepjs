---
name: result-error-handling
description: This skill should be used when working with Result<T,E>, BrepError, or error paths in brepjs — deciding whether to throw or return a Result, constructing errors with codes, or handling failures. Trigger phrases include "should this throw or return err", "Called unwrap() on an Err", "add a new error code", "BrepErrorCode", "kernelCall", "unsupportedError", "BrepWrapperError", "the operation failed silently", "error was swallowed", "how do I unwrap this Result", or writing a new *Fns.ts function that can fail.
---

# Result types and error handling

Every fallible operation in brepjs returns `Result<T, BrepError>` instead of throwing. The type, all combinators, and the extraction helpers live in `src/core/result.ts` (zero internal imports — a pure foundation module). Error kinds, the code catalog, and per-kind constructors live in `src/core/errors.ts`.

## The two failure channels

Pick the channel before writing any error-handling code:

| Situation                                                                                | Channel  | Mechanism                                                                                          |
| ---------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------- |
| Expected failure (bad input, kernel op failed, unsupported capability, file won't parse) | `Result` | `err(validationError(...))`, `kernelCall(...)`, etc.                                               |
| Programmer bug / broken invariant ("this can never happen")                              | Throw    | `bug(location, message)` from `src/utils/bug.ts` — throws `BrepBugError`, never meant to be caught |
| Out-of-bounds index that is valid by construction (under `noUncheckedIndexedAccess`)     | Throw    | `safeIndex(arr, i, context)` in `src/core/errors.ts` — the sanctioned `arr[i]!` replacement        |
| Cooperative cancellation                                                                 | Throw    | `if (signal?.aborted) throw signal.reason` (see `src/topology/booleanFns.ts`)                      |

The rule for Layers 2–3 (`.claude/commands/new-operation.md`, CLAUDE.md): **never throw for expected failures — return `ok(...)` or `err(...)`**. No ESLint rule enforces this mechanically, so it must be applied by discipline in every new `*Fns.ts` function. The exceptions above (`bug()`, `safeIndex()`, abort rethrows) are the only tolerated throws.

The one sanctioned Result→throw boundary is the fluent `shape()` facade in `src/topology/wrapperFns.ts`: every chainable method funnels through an internal `unwrapOrThrow` that throws `BrepWrapperError` on `Err`. See "The throwing boundary" below.

## Constructing errors

### Prefer `kernelCall` for kernel operations

`src/core/kernelCall.ts` is the standard error-construction path in `*Fns.ts` files. It wraps try/catch, casts the result, translates cryptic OCCT messages, and auto-attaches a `suggestion`:

```ts
// src/topology/shapeFns.ts
return kernelCall(
  () => getKernel().downcast(shape.wrapped),
  BrepErrorCode.CLONE_FAILED,
  'Failed to clone shape'
) as Result<T>;
```

Three variants:

| Helper                                       | Returns            | Use when                                                                                                                                       |
| -------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `kernelCall(fn, code, message, kind?)`       | `Result<AnyShape>` | Kernel call returns a `KernelShape`; auto-runs `castShape()`                                                                                   |
| `kernelCallRaw<T>(fn, code, message, kind?)` | `Result<T>`        | Kernel call returns anything else (string, number, array)                                                                                      |
| `kernelCallScoped(fn, code, message, kind?)` | `Result<AnyShape>` | `fn(scope)` needs intermediate kernel allocations — the `DisposalScope` is disposed even on the error path (see the memory-and-disposal skill) |

On exception, the error message becomes `` `${message}: ${translated}` `` where `translateKernelError()` (`src/core/kernelErrorTranslation.ts`) maps ~12 cryptic OCCT patterns (BRepAlgoAPI failures, fillet radius too large, degenerate geometry, ...) into actionable text with the original appended as `(kernel: ...)`. Translation applies only when `kind` is `'KERNEL_OPERATION'` (the default). `ERROR_CODE_SUGGESTIONS` in the same file maps a dozen codes (`FUSE_FAILED`, `CUT_FAILED`, `*_NOT_3D`, `SWEEP_FAILED`, `LOFT_FAILED`, `DRAFT_FAILED`, ...) to `suggestion` strings that ride along automatically.

### Manual construction: pick the kind-matching constructor

`BrepError` is a plain object: `{ kind, code, message, suggestion?, cause?, metadata? }` (`src/core/errors.ts`). There are 9 kinds, each with a constructor sharing the signature `(code, message, cause?, metadata?, suggestion?)`:

| Kind               | Constructor          | Use for                                                                                      |
| ------------------ | -------------------- | -------------------------------------------------------------------------------------------- |
| `VALIDATION`       | `validationError`    | Bad input parameters (check these first, before touching the kernel)                         |
| `KERNEL_OPERATION` | `kernelError`        | Kernel op failed (prefer `kernelCall` unless building the error by hand)                     |
| `TYPE_CAST`        | `typeCastError`      | Result was not the expected shape type (e.g. boolean returned non-3D)                        |
| `COMPUTATION`      | `computationError`   | Geometric computation failed (intersection, skeleton, center of mass)                        |
| `IO`               | `ioError`            | Import/export failure                                                                        |
| `QUERY`            | `queryError`         | Shape query failure (e.g. finder not unique)                                                 |
| `MODULE_INIT`      | `moduleInitError`    | Initialisation failure                                                                       |
| `UNSUPPORTED`      | `unsupportedError`   | Capability not supported by the current kernel (ADR-0006) — see the kernel-abstraction skill |
| `SKETCHER_STATE`   | `sketcherStateError` | Currently unused in src; exists for sketcher state transitions                               |

Always thread context through:

- **`cause`**: the original exception. Dropping it destroys kernel diagnostics.
- **`metadata`**: structured context. Real example from `src/topology/modifierFns.ts`:

```ts
return err(
  kernelError('FILLET_FAILED', `Fillet operation failed: ${raw}`, e, {
    operation: 'fillet',
    edgeCount: selectedCount,
    radius,
  })
);
```

- **`suggestion`**: a recovery hint. The `shape()` wrapper folds it into the thrown message (`"...\nSuggestion: ..."`), so it reaches users.

## Error codes

`BrepErrorCode` (`src/core/errors.ts`) is an `as const` catalog of ~124 codes grouped by category, with a matching literal-union type. Use `BrepErrorCode.X` instead of a raw string whenever the code exists — but know two caveats:

1. `BrepError.code` is typed **`string`**, not the union — a raw-string typo compiles fine. The catalog is advisory; checking it is on the author.
2. The catalog is **incomplete**: dozens of codes exist in src only as raw string literals (`FILLET_FAILED`, `WIRE_NOT_CLOSED`, `THREAD_INVALID_PITCH`, and whole families). Grep before assuming a code is new.

To add a new code:

1. Add the constant to `BrepErrorCode` in `src/core/errors.ts` under its category group (kernel-op, validation, IO, ...).
2. Use it via the kind-matching constructor, or pass it to `kernelCall`.
3. Optionally add an entry to `ERROR_CODE_SUGGESTIONS` in `src/core/kernelErrorTranslation.ts` so `kernelCall` auto-attaches a recovery hint.
4. Optionally add a row to the tables in `docs/errors.md` (hand-maintained, no CI check — see the staleness warning below).

## Consuming Results

| Need                              | Use                                                                        | Notes                                                                                             |
| --------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Branch on outcome                 | `isOk(r)` / `isErr(r)`                                                     | Type guards; narrow to `Ok<T>` / `Err<E>`                                                         |
| Handle both arms as an expression | `match(r, { ok: v => ..., err: e => ... })`                                |                                                                                                   |
| Extract in a test or script       | `unwrap(r)`                                                                | Throws with `[kind] CODE: message` formatting on `Err`                                            |
| Extract with fallback             | `unwrapOr(r, default)` / `unwrapOrElse(r, fn)`                             | Never use to paper over failures the caller should see                                            |
| Chain fallible steps              | `andThen` (alias `flatMap`), or `pipeline(input).then(fn).then(fn).result` | Both short-circuit on first `Err`                                                                 |
| Transform value / error           | `map` / `mapErr` / `mapBoth`                                               |                                                                                                   |
| Combine many                      | `collect(results)` (alias `all`), `zip(a, b)`                              | `collect` short-circuits on first `Err`; `zip` is re-exported from `src/index.ts` as `zipResults` |
| Side-effect without consuming     | `tap` / `tapErr`                                                           | `tapErr` is the idiomatic "log and pass through"                                                  |
| Wrap throwing code                | `tryCatch(fn, mapError)` / `tryCatchAsync`                                 | Use at boundaries with throwing third-party code                                                  |
| Void success                      | `OK` constant (`Ok<Unit>`)                                                 | For operations with nothing to return                                                             |
| Nullable → Result                 | `fromNullable(value, errorFn)`                                             |                                                                                                   |

The `unwrap()` policy (CLAUDE.md, `docs/getting-started.md`): sanctioned in **tests** (the standard extractor), **scripts/examples**, and internal calls that are **infallible by construction** — e.g. `unwrap(resolvePlane('XY', origin))` in `src/core/planeOps.ts`, where the input is a known-valid literal. Never use it on a user-facing fallible path in production code; use `isOk()`/`match()` there.

Note the kernel-free subpath `brepjs/core` (`src/core.ts`) exports only a subset of combinators — no `pipeline`, `mapBoth`, `tap`/`tapErr`, `fromNullable`, `or`/`orElse`, `zip`. The full set is on the main `brepjs` entry.

For Results inside disposal scopes, `withScopeResult` / `withScopeResultAsync` in `src/core/disposal.ts` combine `DisposalScope` cleanup with a Result-returning body (documented in `src/core/README.md`).

## The throwing boundary: `shape()` and `BrepWrapperError`

The fluent `shape()` wrapper (`src/topology/wrapperFns.ts`) auto-unwraps every `Result` and throws `BrepWrapperError` on `Err`. The class carries `code`, `kind`, `suggestion?`, `metadata?`, and its message includes the suggestion when present. Gotcha: `error.name` is set to `'BrepError'` even though the class is `BrepWrapperError` — match with `instanceof BrepWrapperError` (exported from `src/index.ts`), not by name. The catch pattern is shown in `docs/cheat-sheet.md`.

Escape hatches on the wrapper: `.applyResult(fn)` unwraps a user-supplied Result-returning function; `.done()` / `.val` exit back to plain handles. `docs/which-api.md` frames the fluent-vs-functional trade-off around exactly this Result-handling difference.

## Silent failures: symptom → cause → fix

| Symptom                                                         | Likely cause                                                                                              | Fix                                                                                                                     |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Operation "succeeds" but geometry is missing/wrong downstream   | An `Err` was discarded (result assigned, never checked)                                                   | Check every `Result`; use `tapErr` to log, `match` to handle, or propagate with early `return` on `isErr`               |
| Failure invisible until far away                                | `unwrapOr(r, fallback)` masking a real error                                                              | Reserve `unwrapOr` for genuinely optional values; otherwise propagate the `Err`                                         |
| `Called unwrap() on an Err: [KERNEL_OPERATION] ...`             | `unwrap()` on a fallible path                                                                             | Read the formatted `[kind] CODE: message`; handle with `isOk`/`match` at that call site                                 |
| Error message is cryptic OCCT text with no context              | Hand-rolled try/catch instead of `kernelCall`, or `cause` dropped                                         | Route kernel calls through `kernelCall`/`kernelCallRaw`/`kernelCallScoped`; always pass the caught exception as `cause` |
| Plain `Error` thrown from a `*Fns.ts` function                  | Layer 2+ rule violated                                                                                    | Convert to `err(<kind>Error(code, message, cause))`; reserve throws for `bug()`                                         |
| Typo'd error code compiles and ships                            | `code` is typed `string`                                                                                  | Use `BrepErrorCode.X`; add the constant if it does not exist                                                            |
| Async code fails against the wrong kernel with confusing errors | `withKernel(id, fn)` is sync-only — after the first `await` the callback silently uses the default kernel | Use `getKernel(id)` directly in async code (CLAUDE.md gotcha)                                                           |
| Bad geometry with an `Ok` result                                | Not an error-channel problem — the kernel produced a valid-but-wrong shape                                | See the debugging-geometry skill                                                                                        |

## Additional resources

- `src/core/result.ts` — the full Result API; short and readable, treat it as the reference.
- `src/core/errors.ts` — kinds, catalog, constructors, `safeIndex`; ground truth for codes.
- `src/core/kernelCall.ts` and `src/core/kernelErrorTranslation.ts` — the standard construction path and translation/suggestion tables.
- `docs/errors.md` — user-facing per-code reference with recovery advice. **Partially stale**: its kind list omits `UNSUPPORTED`, and its code tables drift from `errors.ts` in both directions. When they disagree, `src/core/errors.ts` wins.
- The `adding-operations` skill — the full recipe for a new `*Fns.ts` operation (validate → `err(validationError(...))` → `kernelCall` → `ok`).
- The `writing-tests` skill — asserting on `Err` results and using `unwrap` in tests.
