# Utils

Low-level helper functions with no internal imports (Layer 0 foundation).

## Key Files

| File                | Purpose                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| `bug.ts`            | `BrepBugError` class and `bug(location, message): never` for invariant violations (like Rust's `panic!`) |
| `uuid.ts`           | `uuidv()` generates UUID v4 via Web Crypto API                                                           |
| `precisionRound.ts` | `precisionRound(number, precision)` with epsilon adjustment for floating-point edge cases                |
| `round2.ts`         | `round2(v)` rounds to 2 decimal places                                                                   |
| `round5.ts`         | `round5(v)` rounds to 5 decimal places                                                                   |
| `range.ts`          | `range(len)` generates `[0, 1, ..., len-1]`                                                              |
| `zip.ts`            | Type-safe array transpose, stops at shortest array length                                                |

## Gotchas

1. **Never catch bug()** — `bug()` should never be caught, it signals programmer errors (invariant violations), not recoverable failures
2. **Single dependency** — `zip` imports from `range.js` (only inter-file dependency in utils)
3. **Export patterns** — All files use default exports except `bug.ts` and `uuid.ts` which use named exports
