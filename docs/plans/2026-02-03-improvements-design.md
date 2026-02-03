# brepjs Focused Improvement Sprint

**Created:** 2026-02-03
**Status:** Complete
**Branch:** `improvements/focused-sprint`
**Delivery:** Single PR with atomic commits

## Overview

23 improvements across 5 phases targeting: Developer Experience, Code Quality & Coverage, Performance & Observability, and Production Readiness.

## Phases

### Phase 1: Complete Functional API Migration

Finish the 5 remaining TODOs in `core/geometry.ts` to stabilize the API before documentation.

| #   | Item                        | Description                                    |
| --- | --------------------------- | ---------------------------------------------- |
| 1   | Replace Vector class        | Migrate to `Vec3` tuples + `vecOps` functions  |
| 2   | Replace transform functions | Consolidate into functional pattern            |
| 3   | Replace PlaneData           | Use functional `planeOps` pattern              |
| 4   | Replace BoundingBox class   | Use functional shape query functions           |
| 5   | Clean up exports            | Remove deprecated exports, update barrel files |

**Approach:** Add deprecation warnings to legacy APIs rather than removing (backward compatibility). Follow existing patterns in `vecOps.ts` and `planeOps.ts`.

---

### Phase 2: Code Quality & Coverage

Push test coverage from 73% to 80%+ and reduce technical debt.

| #   | Item                          | Description                                                 |
| --- | ----------------------------- | ----------------------------------------------------------- |
| 6   | Boolean operation edge cases  | Tests for degenerate inputs, empty shapes, coincident faces |
| 7   | I/O error path tests          | Malformed files, unsupported formats, permission errors     |
| 8   | Functional API tests          | Coverage for Phase 1 replacements                           |
| 9   | Audit eslint-disable comments | Remove unnecessary, improve justifications                  |
| 10  | Fix .gitignore                | Add build artifact patterns for packages/                   |
| 11  | Add knip to CI                | Surface unused code detection in CI output                  |

**Target:** 80% statements, 70% branches, 85% functions, 80% lines.

---

### Phase 3: Performance & Observability

Establish infrastructure for tracking performance and detecting regressions.

| #   | Item               | Description                                                     |
| --- | ------------------ | --------------------------------------------------------------- |
| 12  | Benchmark baseline | Run benchmarks, capture results in `benchmarks/baseline.json`   |
| 13  | Comparison script  | `scripts/compare-benchmarks.sh` — flag regressions >10%         |
| 14  | CI benchmark step  | Run on PRs, output comparison as artifact                       |
| 15  | Performance docs   | `docs/performance.md` — gcWithScope, batching, caching patterns |

**Approach:** Build on existing Vitest bench infrastructure. CI tracks relative changes, not absolute numbers.

---

### Phase 4: Production Readiness

Update security policy, document error handling, improve resilience guidance.

| #   | Item                   | Description                                                        |
| --- | ---------------------- | ------------------------------------------------------------------ |
| 16  | Update SECURITY.md     | Change to v2.x support, clarify process                            |
| 17  | Error code reference   | `docs/errors.md` — all Result error types with recovery strategies |
| 18  | GC/disposal edge cases | `docs/memory-management.md` — Symbol.dispose, fallbacks            |
| 19  | Compatibility matrix   | Tested environments (Node, browsers, bundlers)                     |

**Scope:** Documentation only — no new polyfills or fallback code.

---

### Phase 5: Developer Experience

Create examples, improve API documentation, help new users succeed.

| #   | Item                  | Description                                                       |
| --- | --------------------- | ----------------------------------------------------------------- |
| 20  | Examples directory    | 5 complete workflows (primitives, mechanical, 2d-to-3d, io, text) |
| 21  | TypeDoc API reference | Generate to `docs/api/`, add script to package.json               |
| 22  | Architecture diagram  | Mermaid diagram of layers and data flow                           |
| 23  | README improvements   | Expand quick-start, link to examples and API docs                 |

**Approach:** Examples use functional API exclusively. TypeDoc excludes internal/deprecated APIs.

---

## Dependencies

```
Phase 1 ─────┬──── Phase 2 (tests use new APIs)
             │
             ├──── Phase 4 (docs reflect final API)
             │
             └──── Phase 5 (examples use final API)

Phase 3 ────────── (independent, can parallel with Phase 2)
```

## Progress Tracking

- [x] **Phase 1:** Functional API Migration (items 1-5)
- [x] **Phase 2:** Code Quality & Coverage (items 6-11)
- [x] **Phase 3:** Performance & Observability (items 12-15)
- [x] **Phase 4:** Production Readiness (items 16-19)
- [x] **Phase 5:** Developer Experience (items 20-23)

## Commit Convention

Each item gets an atomic commit:

- `feat(core): replace Vector class with Vec3 + vecOps`
- `test(operations): add boolean edge case coverage`
- `docs: create performance optimization guide`
- `ci: add benchmark comparison to PR workflow`

## Resuming Work

To resume this work in a new session:

1. Check out branch `improvements/focused-sprint`
2. Review commit history to see completed items
3. Find next unchecked item in Progress Tracking above
4. Continue from that item

## Notes

- Owner is sole consumer — no migration guide needed
- Legacy APIs get deprecation warnings, not removal
- Benchmark CI won't block PRs, just surfaces regressions
