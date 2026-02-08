# Public API Assessment: Friction Points & Action Items

**Date:** 2026-02-07
**Last Updated:** 2026-02-07 (after PR #186)
**Goal:** Identify actionable friction points in the brepjs public API
**Canonical style:** Fluent wrapper (`shape(box(...)).cut(...).fillet(...)`)
**Audience:** Both web developers new to CAD and experienced CAD engineers

**Status:** v5.0.0 shipped with clean API names. Legacy names removed in PR #186.

---

## ✅ Completed in PR #186

**What was accomplished:**

- ✅ All legacy API names removed from barrel exports (makeBox, fuseShape, translateShape, etc.)
- ✅ pipe() fluent wrapper removed (use shape() instead)
- ✅ Public API reduced from 427 to 370 symbols (13% reduction)
- ✅ All documentation updated to use clean API names consistently
- ✅ function-lookup.md regenerated
- ✅ All 1568 tests passing with clean API

**Immediate impact:**

- Users now see only one name per operation in autocomplete
- Documentation and examples are consistent
- Migration path is clear (legacy → clean)

---

## Dimension Scores

| Dimension                  | Score | Summary                                                                                  |
| -------------------------- | ----- | ---------------------------------------------------------------------------------------- |
| **Consistency & Naming**   | 4/10  | Multiple naming conventions coexist; parameter names vary for identical concepts         |
| **Verbosity & Ergonomics** | 5/10  | Clean v5 and wrapper are good, but wrapper is ~40% incomplete, forcing unwrap escapes    |
| **Discoverability**        | 3/10  | Fluent wrapper is undocumented; docs use legacy style; three init paths create confusion |
| **Error Handling UX**      | 6/10  | Structured errors with metadata are solid; inconsistent Result/throw boundary hurts      |

**Overall: 4.5/10** — Strong foundations, but the API surface is fractured across styles, the canonical wrapper is incomplete, and documentation doesn't match actual usage.

---

## 1. Consistency & Naming (4/10)

### 1.1 Position Parameter Chaos (Critical)

Five different names for "where to put/pivot this thing":

| Parameter  | Used in                                        |
| ---------- | ---------------------------------------------- |
| `at`       | cylinder, sphere, cone, torus, circle, ellipse |
| `around`   | rotate (pivot point)                           |
| `origin`   | mirror, scale                                  |
| `center`   | box (when `true` or Vec3), scale options       |
| `position` | rotateShape                                    |

Three names for "which way it points": `axis`, `direction`, `normal`.

**Action:** Standardize on `at` for position and `axis` for direction across all primitives and transforms. Deprecate the others.

### 1.2 Dual Naming Convention (✅ COMPLETED in PR #186)

**Status:** ✅ All legacy names removed. Public API now has single canonical names only.

**What was done:**

- Removed all legacy exports: `makeBox`, `fuseShape`, `filletShape`, `translateShape`, etc.
- Removed `pipe()` fluent wrapper
- Updated all tests to use clean API
- Updated all documentation to use clean API consistently
- Reduced from 427 to 370 exported symbols

**Remaining work:** None for this item.

### 1.3 2D Operation Verbosity (High)

2D operations are needlessly verbose compared to 3D:

| 3D                | 2D                         |
| ----------------- | -------------------------- |
| `fuse(a, b)`      | `fuseBlueprint2D(a, b)`    |
| `translate(s, v)` | `translateBlueprint(s, v)` |
| `getBounds(s)`    | `blueprintBoundingBox(s)`  |

The `Blueprint2D` / `Blueprint` suffixes are redundant — the type system already distinguishes them.

**Action:** Create clean 2D aliases: `fuse2d`, `cut2d`, `intersect2d` (or overload the clean API functions to accept Blueprint types).

### 1.4 Drawing Transform Inconsistency (Medium)

Drawing operations mix naming patterns within the same module:

- Transforms: `translateDrawing()`, `rotateDrawing()` — verb + Noun
- Booleans: `drawingFuse()`, `drawingCut()` — Noun + verb

**Action:** Pick one pattern. Recommend `drawingTranslate`, `drawingFuse` (Noun prefix) for consistency with `sketch*` functions.

### 1.5 Adjacency vs Extraction Naming (Medium)

Two different patterns for "get related sub-shapes":

- Extraction: `getEdges(shape)`, `getFaces(shape)` — get + Plural
- Adjacency: `facesOfEdge(shape, edge)`, `edgesOfFace(shape, face)` — plural + Of + Singular (no `get`)

**Action:** Add `get` prefix to adjacency: `getFacesOfEdge`, `getEdgesOfFace`. Or drop `get` from extractions: `edges(shape)`, `faces(shape)`.

### 1.6 Options vs Config (Low)

Mixed suffixes: `BooleanOptions`, `MeshOptions` vs `LoftConfig`, `SweepConfig`.

**Action:** Standardize on `Options` everywhere. Rename `LoftConfig` → `LoftOptions`, `SweepConfig` → `SweepOptions`.

### 1.7 Outliers (Low)

- `thickenSurface` is the only modifier with a noun suffix instead of `Shape` — should be `thickenShape` or just `thicken` (v5 already has this)
- `bsplineApprox` feels abbreviated — but keeping it is fine as technical jargon
- `offsetFace` in primitiveFns sounds like a modifier, not a constructor

---

## 2. Verbosity & Ergonomics (5/10)

### 2.1 Wrapper API is ~40% Incomplete (Critical)

The canonical `shape()` wrapper is missing major operation categories:

| Category    | Coverage | Key Gaps                                                        |
| ----------- | -------- | --------------------------------------------------------------- |
| Booleans    | 60%      | `section`, `split`, `slice`, `fuseAll`, `cutAll`                |
| 3D Ops      | 40%      | `loft`, `twistExtrude`, `supportExtrude`, `complexExtrude`      |
| Utilities   | 20%      | `heal`, `simplify`, `isValid`, `isEmpty`, `toBREP`, `fromBREP`  |
| Measurement | 50%      | `volumeProps`, `surfaceProps`, `checkInterference`, `curvature` |
| Meshing     | 0%       | `mesh`, `meshEdges` — required for rendering                    |
| Adjacency   | 0%       | `edgesOfFace`, `facesOfEdge` etc.                               |
| IO/Export   | 0%       | `exportGltf`, `exportOBJ`, `exportDXF`, `exportThreeMF`         |
| 2D          | 0%       | All blueprint operations                                        |

**Showstoppers** that force every user out of the fluent API:

1. No `mesh()` — can't render shapes without unwrapping
2. No `isValid()` / `heal()` — can't validate/fix shapes in-chain
3. No `toBREP()` — can't serialize shapes
4. No `section()` / `slice()` — common CAD operations missing
5. No `loft()` — multi-profile sweeps require unwrapping

**Mitigating factor:** The wrapper has `apply(fn)` and `applyResult(fn)` escape hatches (lines 155-156 of wrapperFns.ts) that allow calling any arbitrary function without leaving the chain: `shape(x).applyResult(s => loft([s, otherWire]))`. This works but is less discoverable and ergonomic than native methods.

**Action:** Add at minimum: `mesh`, `meshEdges`, `isValid`, `heal`, `simplify`, `toBREP`, `section`, `split`, `slice`, `loft`, `fuseAll`, `cutAll`, `thicken`.

### 2.2 Result Unwrapping Burden (High)

Functional API happy-path requires 3 lines instead of 1:

```ts
const result = fuseShape(a, b);
expect(isOk(result)).toBe(true);
const shape = unwrap(result);
```

**Action:** This is inherent to the functional style and acceptable. The wrapper is the answer — but it needs to be complete (see 2.1).

### 2.3 pipe() vs shape() Confusion (✅ COMPLETED in PR #186)

**Status:** ✅ The `pipe()` API has been removed. Only `shape()` wrapper remains.

**What was done:**

- Deleted `src/topology/pipeFns.ts`
- Deleted `tests/fn-pipeFns.test.ts`
- Removed all pipe exports from barrels

**Remaining work:** Document the `shape()` wrapper (see P0 action item #1).

### 2.4 Finder Integration Awkwardness (Medium)

Pre-built finders can't be passed directly:

```ts
const zEdges = edgeFinder().inDirection('Z');
shape(box).fillet(zEdges, 2); // Type error
shape(box).fillet(() => zEdges, 2); // Awkward workaround
```

**Action:** Accept `ShapeFinder<T>` directly in addition to `FinderFn<T>` callback.

### 2.5 No .unwrap() Method on Wrapper (Low)

`shape()` uses `.val` property, but `pipe()` uses `.done()`. Neither has `.unwrap()`.

**Action:** Add `.done()` to `shape()` wrapper. Keep `.val` as property shorthand.

---

## 3. Discoverability (3/10)

### 3.1 Fluent Wrapper is Undocumented (Critical)

The `shape()` wrapper is:

- Used in ALL site playground examples
- Exported from main entry
- The declared "canonical" API

But has **zero prose documentation** in:

- `getting-started.md` — uses `unwrap(cutShape(box, hole))`
- `which-api.md` — doesn't mention `shape()` at all
- `cheat-sheet.md` — uses `unwrap(fuseShape(a, b))`

Users learning from docs never discover it. Users learning from playground can't find docs for it.

**Action:** Rewrite getting-started.md and cheat-sheet.md to use `shape()` as the primary API. Add "Fluent Wrapper" section to which-api.md.

### 3.2 Three Initialization Paths (High)

1. `brepjs/quick` with auto-init (zero-to-shape.md)
2. Standard `initFromOC()` (getting-started.md)
3. Hidden `_setup.js` (examples)

**Action:** Promote `brepjs/quick` as the default. Show standard init only in "Advanced" section.

### 3.3 API Style Paralysis (High)

`which-api.md` presents 4+ styles before the user creates a single shape:

1. Sketcher (fluent chaining)
2. Functional API (standalone functions)
3. Pipeline style (pipe wrapper)
4. Drawing API (2D profiles)

**Action:** Restructure to: "Use `shape()` wrapper. For 2D profiles, use Sketcher. That's it." Move other styles to an "Advanced: Alternative Styles" section.

### 3.4 Sub-Path Groupings Not Intuitive (Medium)

- `filletShape` is in `brepjs/topology` not `brepjs/operations`
- `getEdges` is in `brepjs/topology` but `edgeFinder` is in `brepjs/query`
- Booleans are in `brepjs/topology` (not where operations/modifiers users look)

**Action:** Consider a "which sub-path?" quick reference table at the top of which-api.md. Or: stop promoting sub-paths for beginners — just use main entry.

### 3.5 Export Count Reduction (✅ IMPROVED in PR #186)

**Before:** 427 symbols (confusing autocomplete with both `fillet` and `filletShape`)
**After:** 370 symbols (13% reduction)

**What was done:**

- Removed 57 legacy name exports
- Typing "fillet" now shows only: `fillet`, `drawingFillet`, `FilletRadius`
- function-lookup.md regenerated to reflect new exports

**Remaining:** Still a large API surface. Consider promoting sub-path imports in documentation (e.g., `import { fillet } from 'brepjs/topology'` instead of main barrel).

### 3.6 Docs and Examples Consistency (✅ PARTIALLY COMPLETED in PR #186)

**What was done:**

- ✅ All docs now use clean API names (box, fuse, translate)
- ✅ llms.txt updated with clean API throughout
- ✅ function-lookup.md regenerated
- ✅ All code examples use clean names

**Remaining:** Docs still use functional style (`unwrap(fuse(a, b))`) instead of wrapper style (`shape(a).fuse(b).val`). The wrapper is the canonical API but not promoted in prose documentation. See P0 action item #1.

### 3.7 No Task-Based Cookbook (Low)

Missing "I want to..." recipes:

- "Make a box with rounded corners and a hole" → direct recipe
- "Import STL and measure volume" → direct recipe
- "Create a parametric bracket" → direct recipe

**Action:** Add a `docs/cookbook.md` with 10-15 common task recipes using the canonical wrapper style.

---

## 4. Error Handling UX (6/10)

### 4.1 Inconsistent Result vs Throw Boundary (High)

| Pattern             | Functions                                                        |
| ------------------- | ---------------------------------------------------------------- |
| Returns `Result<T>` | Booleans, modifiers, revolve, loft, sweep, healing, IO           |
| Throws              | `extrudeFace` (zero-length vector), transforms (OCCT exceptions) |
| Returns raw value   | Transforms, `getEdges`, `meshShape`, simple primitives           |

`extrudeFace` throws while `revolveFace` returns `Result` — in the **same file**.

**Action:** Make `extrudeFace` return `Result<Solid>`. Wrap all OCCT calls in transforms with `tryCatch` so they never throw unexpectedly.

### 4.2 OCCT Error Messages Are Opaque (Medium)

When OCCT throws "Invalid edge configuration", users get that verbatim. No interpretation, no hints.

**Action:** Add an OCCT error translation layer that maps common OCCT exceptions to actionable messages:

- "Invalid edge configuration" → "The edges may not form a continuous loop. Check that edges connect end-to-end."
- "BRepAlgoAPI: operation failed" → "Boolean operation failed. Common causes: overlapping faces, zero-thickness geometry, or degenerate shapes."

### 4.3 Wrapper Loses Result Ergonomics (Medium)

`shape()` throws `BrepWrapperError` on failure. No way to use `Result` combinators:

```ts
// Can't do this:
const result = shape(a).fuse(b).orElse(() => a);

// Forced to do this:
try { shape(a).fuse(b); } catch (e) { ... }
```

**Action:** Consider adding `.tryFuse()` / `.tryCut()` that return `Result<Wrapped<T>>`. Or add `.mapErr()` for custom error handling without throwing.

### 4.4 No Recovery Suggestions in Errors (Medium)

Error messages describe the failure but not how to fix it:

```
"Fillet operation failed"
// Missing: "Try reducing the radius or check that selected edges have enough room for the fillet."
```

**Action:** Add `suggestion?: string` field to `BrepError`. Populate for the top 10 most common failures.

### 4.5 No Partial Results (Low)

If step 3 of a 5-step chain fails, all intermediate shapes are lost.

**Action:** Consider a debug mode or `.checkpoint()` method that saves intermediate results. Low priority — only matters for complex workflows.

### 4.6 Untyped Error Metadata (Low)

`metadata` is `Record<string, unknown>` — users can't rely on specific fields.

**Action:** Type metadata per error code (e.g., `FilletErrorMetadata { edgeCount: number; radius: number }`).

---

## Prioritized Action Items

### 🎯 Next Up — P0 Critical

1. **Document the `shape()` wrapper** (High Impact)
   - Rewrite getting-started.md to use `shape()` as primary API
   - Add "Fluent Wrapper" section to which-api.md
   - Update cheat-sheet.md examples to use wrapper style
   - **Why:** Wrapper is the canonical API but has zero prose documentation

2. **Complete the wrapper** (Critical Gaps)
   - Add `mesh`, `meshEdges` — can't render without these
   - Add `isValid`, `heal`, `simplify` — can't validate/fix in-chain
   - Add `toBREP`, `fromBREP` — can't serialize
   - Add `section`, `split`, `slice` — common CAD operations
   - Add `loft`, `fuseAll`, `cutAll`, `thicken`
   - **Why:** Users forced out of fluent API for basic operations

### 🔥 P1 — High Priority

3. **Standardize position/direction params**
   - Use `at` everywhere for position (currently: at, around, origin, center, position)
   - Use `axis` everywhere for direction (currently: axis, direction, normal)
   - Add deprecated overloads for old params
   - **Why:** Inconsistent parameter names create confusion

4. **Simplify initialization story**
   - Promote `brepjs/quick` as the default in docs
   - Move standard `initFromOC()` to "Advanced" section
   - Remove confusing third path (`_setup.js`)
   - **Why:** Three init paths create choice paralysis

5. **Make `extrudeFace` return Result**
   - Fix inconsistency: `revolveFace` returns `Result`, `extrudeFace` throws
   - Wrap all transforms in `tryCatch` for predictable errors
   - **Why:** Inconsistent error boundaries are confusing

6. **Simplify which-api.md**
   - Lead with: "Use `shape()` wrapper for 3D, Sketcher for 2D profiles"
   - Move other styles to "Advanced: Alternative Styles" section
   - **Why:** Presenting 4+ styles upfront creates decision paralysis

### 📋 P2 — Medium Priority

7. **Clean 2D naming** — Add `fuse2d`, `cut2d`, `intersect2d` or overload main functions
8. **Accept ShapeFinder directly** in fillet/chamfer/shell (not just callbacks)
9. **Add OCCT error translation layer** for top 10 common failures with actionable messages
10. **Add `suggestion` field to BrepError** for recovery hints
11. **Standardize on `Options` suffix** — rename `LoftConfig`, `SweepConfig` to `LoftOptions`, `SweepOptions`

### 🎨 P3 — Polish / Nice-to-Have

12. **Add cookbook.md** with task-based recipes ("How do I...?")
13. **Fix adjacency naming** — either add `get` prefix or drop it from both patterns
14. **Type error metadata** per error code for better DX
15. **Add `.tryFuse()` / `.tryCut()`** to wrapper for functional error handling
16. **Remove duplicate exports** — IO functions from both `brepjs/topology` and `brepjs/io`
17. **Fix Drawing transform naming** — pick one pattern (recommend Noun prefix)

---

## Appendix: Wrapper Coverage Table

| Operation                     | In Functional API | In Wrapper | Priority to Add |
| ----------------------------- | :---------------: | :--------: | :-------------: |
| mesh / meshEdges              |         Y         |   **N**    |       P0        |
| isValid / isEmpty             |         Y         |   **N**    |       P0        |
| heal / simplify               |         Y         |   **N**    |       P0        |
| toBREP / fromBREP             |         Y         |   **N**    |       P0        |
| section / split / slice       |         Y         |   **N**    |       P0        |
| loft                          |         Y         |   **N**    |       P0        |
| fuseAll / cutAll              |         Y         |   **N**    |       P0        |
| thicken                       |         Y         |   **N**    |       P1        |
| volumeProps / surfaceProps    |         Y         |   **N**    |       P2        |
| checkInterference             |         Y         |   **N**    |       P2        |
| edgesOfFace / facesOfEdge     |         Y         |   **N**    |       P2        |
| twistExtrude / supportExtrude |         Y         |   **N**    |       P3        |
| 2D booleans                   |         Y         |   **N**    |       P3        |
| exportGltf / exportOBJ / etc. |         Y         |   **N**    |       P3        |
| assembly operations           |         Y         |   **N**    |       P3        |
