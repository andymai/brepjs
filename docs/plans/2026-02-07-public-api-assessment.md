# Public API Assessment: Friction Points & Action Items

**Date:** 2026-02-07
**Last Updated:** 2026-02-07 (after Config → Options standardization)
**Goal:** Identify actionable friction points in the brepjs public API
**Canonical style:** Fluent wrapper (`shape(box(...)).cut(...).fillet(...)`)
**Audience:** Both web developers new to CAD and experienced CAD engineers

**Status:** v7.2.0 shipped with parameter naming standardization (PR #191). Config → Options naming standardization completed (direct commit to main).

---

## ✅ Completed in PR #186

**What was accomplished:**

- ✅ All legacy API names removed from barrel exports (makeBox, fuseShape, translateShape, etc.)
- ✅ pipe() fluent wrapper removed (use shape() instead)
- ✅ Public API reduced from 427 to 370 symbols (13% reduction)
- ✅ All documentation updated to use short API names consistently
- ✅ function-lookup.md regenerated
- ✅ All 1568 tests passing with short API names

**Immediate impact:**

- Users now see only one name per operation in autocomplete
- Documentation and examples are consistent
- Migration path is clear (legacy → short names)

---

## ✅ Completed in PR #188

**What was accomplished:**

1. **Completed wrapper API (P0 #2)** - Added 12 critical missing methods:
   - Base wrapper: `mesh()`, `meshEdges()`, `isValid()`, `isEmpty()`, `heal()`, `simplify()`, `toBREP()`
   - 3D wrapper: `cutAll()`, `section()`, `split()`, `slice()`
   - ✅ Users can now render, validate, serialize without unwrapping
   - ✅ Wrapper completion: ~40% → ~90%

2. **Consistent Result handling (P1 #5)** - Made `extrude()` return `Result<Solid>`:
   - Fixed inconsistency where `extrudeFace()` threw but `revolveFace()` returned `Result`
   - ✅ All operation functions now have predictable Result-based error boundaries
   - ✅ Updated compound ops (pocket, boss) to handle Result

3. **Removed "clean API" terminology** - Cleaner naming throughout:
   - Renamed `cleanApi.ts` → `api.ts`, `cleanOpsFns.ts` → `api.ts`
   - Renamed `cleanApi.test.ts` → `api.test.ts`
   - ✅ File naming is now intuitive and consistent

**Impact:**

- ✅ 1584 tests passing (up from 1568)
- ✅ 87.53% function coverage
- ✅ Wrapper is now production-ready for complete workflows
- ✅ No more forced unwrapping for basic operations (mesh, validate, serialize)

---

## ✅ Completed in PR #190

**What was accomplished:**

1. **Documented shape() wrapper as canonical API (P0 #1)** - Complete documentation overhaul:
   - getting-started.md: Complete rewrite with wrapper as primary API throughout
   - which-api.md: New "Fluent Wrapper" section positioned prominently
   - cheat-sheet.md: All examples converted to wrapper style
   - ✅ Wrapper is now the documented, canonical API for brepjs
   - ✅ Functional API positioned as alternative for explicit error handling

**Key changes:**

- **getting-started.md**: Step 4 introduces `shape()` first, shows chaining, demonstrates axis shortcuts
- **which-api.md**: Added comprehensive "Fluent Wrapper" section with benefits table and wrapper types
- **cheat-sheet.md**: Converted all examples (booleans, transforms, fillets, measurement) to wrapper style
- **Error handling**: Documented both `BrepWrapperError` (wrapper) and `Result<T>` (functional) patterns

**Impact:**

- ✅ Wrapper is now documented as the **canonical API** across all major docs
- ✅ Users discovering brepjs immediately see the cleanest, most ergonomic API
- ✅ Discoverability dramatically improved: 3/10 → 8/10
- ✅ Zero friction for new users to discover and use the wrapper

---

## ✅ Completed in PR #191

**What was accomplished:**

1. **Parameter Naming Standardization (P0 #1)** - Consistent position and direction parameters:
   - Position: Standardized to `at` (deprecated `around`, `origin`)
   - Direction: Standardized to `axis` (deprecated `normal` in primitives)
   - Functions updated: `rotate()`, `revolve()`, `mirror()`, `mirrorJoin()`, `circle()`, `ellipse()`, `ellipseArc()`
   - ✅ 100% backward compatible with deprecation warnings
   - ✅ Comprehensive migration guide at docs/migration/v7.2-parameter-naming.md
   - ✅ 22 new tests verifying canonical and deprecated names both work

**Impact:**

- ✅ All 1606 tests passing (1584 + 22 new)
- ✅ 87.53% function coverage maintained
- ✅ Consistency & Naming score: 5/10 → **8/10**
- ✅ Parameter names are now predictable and learnable

---

## ✅ Completed: Config → Options Standardization

**What was accomplished:**

1. **Configuration Type Naming (P0 #1)** - Standardized all configuration types to `Options` suffix:
   - Primary scope: `LoftConfig` → `LoftOptions`, `SweepConfig` → `SweepOptions`, `GenericSweepConfig` → `GenericSweepOptions`, `BSplineApproximationConfig` → `BSplineApproximationOptions`
   - Additional types: `RadiusConfig` → `RadiusOptions`, `ShapeConfig` → `ShapeOptions`, `SplineConfig` → `SplineOptions`
   - ✅ 100% backward compatible with deprecated type aliases
   - ✅ All old names work until v8.0.0 with IDE deprecation warnings
   - ✅ 25 files updated across operations, topology, and sketching

**Impact:**

- ✅ All 1606 tests passing
- ✅ Function coverage: 87.53% maintained
- ✅ Consistency & Naming score: 8/10 → **9/10**
- ✅ Configuration types now have predictable, consistent naming

---

## Dimension Scores

| Dimension                  | Before | After PR #188 | After PR #190 | After PR #191 | After Config→Options | Summary                                                                 |
| -------------------------- | ------ | ------------- | ------------- | ------------- | -------------------- | ----------------------------------------------------------------------- |
| **Consistency & Naming**   | 4/10   | 5/10          | 5/10          | **8/10**      | **9/10**             | ✅ Config→Options standardized; only 2D naming polish remains           |
| **Verbosity & Ergonomics** | 5/10   | 8/10          | 8/10          | 8/10          | 8/10                 | ✅ Wrapper ~90% complete; users rarely need to unwrap                   |
| **Discoverability**        | 3/10   | 3/10          | **8/10**      | 8/10          | 8/10                 | ✅ Wrapper documented as canonical API; needs cookbook and init clarity |
| **Error Handling UX**      | 6/10   | 8/10          | 8/10          | 8/10          | 8/10                 | ✅ Consistent Result boundaries; wrapper auto-throws BrepWrapperError   |

**Overall: 4.5/10 → 6/10 → 7.25/10 → 7.75/10 → 8.0/10** — Config→Options standardized. Next priority: 2D API naming to reach Consistency 10/10.

---

## 1. Consistency & Naming (8/10)

### 1.1 Position Parameter Chaos (✅ COMPLETED in PR #191)

**Status:** ✅ Position and direction parameters standardized to `at` and `axis`.

**What was done:**

- ✅ Standardized position to `at`: Updated `rotate()`, `revolve()`, `mirror()`, `mirrorJoin()`
- ✅ Standardized direction to `axis`: Updated `circle()`, `ellipse()`, `ellipseArc()`
- ✅ Deprecated old names (`around`, `origin`, `normal`) with IDE warnings
- ✅ 100% backward compatible - old names still work until v8.0.0
- ✅ Migration guide created: docs/migration/v7.2-parameter-naming.md
- ✅ 22 new tests verifying both canonical and deprecated names work

**Semantic exceptions preserved:**

- `center` in `scale()` - semantically correct (center of scaling, not a position)
- `center` in `box()` - special ergonomic feature (`center: true | Vec3`)
- `normal` in plane operations (`mirror()`, `createPlane()`) - mathematically correct term

**Remaining work:** None for this item. Score improved from 5/10 → 8/10.

### 1.2 Dual Naming Convention (✅ COMPLETED in PR #186)

**Status:** ✅ All legacy names removed. Public API now has single canonical names only.

**What was done:**

- Removed all legacy exports: `makeBox`, `fuseShape`, `filletShape`, `translateShape`, etc.
- Removed `pipe()` fluent wrapper
- Updated all tests to use short API names
- Updated all documentation to use short API names consistently
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

**Action:** Create 2D aliases: `fuse2d`, `cut2d`, `intersect2d` (or overload the API functions to accept Blueprint types).

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

### 1.6 Options vs Config (✅ COMPLETED)

**Status:** ✅ All configuration types standardized to use `Options` suffix.

**What was done:**

- ✅ Renamed all Config types to Options: `LoftConfig` → `LoftOptions`, `SweepConfig` → `SweepOptions`, `GenericSweepConfig` → `GenericSweepOptions`, `BSplineApproximationConfig` → `BSplineApproximationOptions`, `RadiusConfig` → `RadiusOptions`, `ShapeConfig` → `ShapeOptions`, `SplineConfig` → `SplineOptions`
- ✅ All old names preserved as deprecated type aliases with v8.0.0 removal timeline
- ✅ 100% backward compatible
- ✅ 25 files updated across operations, topology, and sketching layers

**Remaining work:** None for this item. Score improved from 8/10 → 9/10.

### 1.7 Outliers (Low)

- `thickenSurface` is the only modifier with a noun suffix instead of `Shape` — should be `thickenShape` or just `thicken` (v5 already has this)
- `bsplineApprox` feels abbreviated — but keeping it is fine as technical jargon
- `offsetFace` in primitiveFns sounds like a modifier, not a constructor

---

## 2. Verbosity & Ergonomics (5/10)

### 2.1 Wrapper API is ~40% Incomplete (✅ MOSTLY COMPLETED in PR #188)

**Status:** ✅ Wrapper is now ~90% complete. Critical showstoppers resolved.

**What was added in PR #188:**

✅ **Base wrapper (all shapes):**

- `mesh()` / `meshEdges()` — can now render without unwrapping
- `isValid()` / `isEmpty()` — can now validate in-chain
- `heal()` / `simplify()` — can now repair shapes in-chain
- `toBREP()` — can now serialize without unwrapping

✅ **3D wrapper:**

- `cutAll(tools[])` — batch boolean subtraction
- `section(plane)` — cross-section with plane
- `split(tools[])` — split with tool shapes
- `slice(planes[])` — batch cross-sections

**Updated Coverage:**

| Category    | Before | After | Remaining Gaps                                             |
| ----------- | ------ | ----- | ---------------------------------------------------------- |
| Booleans    | 60%    | 90%   | `fuseAll` (batch operation, may not fit wrapper pattern)   |
| Utilities   | 20%    | 90%   | `fromBREP` (factory function, not instance method)         |
| Meshing     | 0%     | 100%  | ✅ Complete                                                |
| Validation  | 0%     | 100%  | ✅ Complete                                                |
| 3D Ops      | 40%    | 50%   | `loft`, `twistExtrude`, `supportExtrude`, `complexExtrude` |
| Measurement | 50%    | 50%   | `volumeProps`, `surfaceProps`, `checkInterference`         |
| Adjacency   | 0%     | 0%    | `edgesOfFace`, `facesOfEdge` etc.                          |
| IO/Export   | 0%     | 0%    | `exportGltf`, `exportOBJ`, `exportDXF`, `exportThreeMF`    |
| 2D          | 0%     | 0%    | All blueprint operations                                   |

**Remaining work (lower priority):**

- Advanced 3D ops: `loft()`, `twistExtrude()`, `supportExtrude()`, `complexExtrude()`
- Measurement details: `volumeProps()`, `surfaceProps()`, `checkInterference()`
- Adjacency queries: `edgesOfFace()`, `facesOfEdge()` (can use escape hatch)
- Export functions: These are better as standalone functions, not instance methods
- 2D blueprint wrapper: Separate concern, may need dedicated 2D wrapper

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

### 3.1 Fluent Wrapper is Undocumented (✅ COMPLETED in PR #190)

**Status:** ✅ The `shape()` wrapper is now comprehensively documented as the canonical API.

**What was done:**

- ✅ getting-started.md: Complete rewrite with wrapper as primary API
- ✅ which-api.md: New "Fluent Wrapper" section with benefits table and wrapper types
- ✅ cheat-sheet.md: All examples converted to wrapper style
- ✅ Wrapper positioned as the recommended starting point throughout
- ✅ Functional API documented as alternative for explicit error handling

**Remaining work:** None for this item. Wrapper is now the documented, canonical API.

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

- ✅ All docs now use short API names (box, fuse, translate)
- ✅ llms.txt updated with short API names throughout
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

### 4.1 Inconsistent Result vs Throw Boundary (✅ COMPLETED in PR #188)

**Status:** ✅ `extrude()` and `extrudeFace()` now return `Result<Solid>`, consistent with `revolve()` and `loft()`.

**What was done:**

- Changed `extrudeFace(face, vec): Solid` → `Result<Solid>`
- Changed `extrude(face, height): Solid` → `Result<Solid>`
- Updated compound operations (pocket, boss) to handle Result
- Updated wrapper to unwrap Result automatically
- All tests updated to handle Result

**Current Pattern:**

| Pattern             | Functions                                               |
| ------------------- | ------------------------------------------------------- |
| Returns `Result<T>` | ✅ Booleans, modifiers, extrude, revolve, loft, healing |
| Returns raw value   | Transforms, `getEdges`, `meshShape`, simple primitives  |

**Remaining work:**

- Wrap OCCT calls in transforms with `tryCatch` to prevent unexpected throws
- This is lower priority since transforms rarely fail in practice

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

### ✅ Completed

~~1. **Complete the wrapper** — ✅ Done in PR #188 (mesh, heal, section, cutAll, etc.)~~
~~2. **Make `extrudeFace` return Result** — ✅ Done in PR #188 (consistent with revolve/loft)~~
~~3. **Remove "clean API" terminology** — ✅ Done in PR #188 (renamed files, updated docs)~~
~~4. **Document the `shape()` wrapper** — ✅ Done in PR #190 (getting-started, which-api, cheat-sheet)~~
~~5. **Standardize parameter naming** — ✅ Done in PR #191 (`at` for position, `axis` for direction)~~
~~6. **Standardize Options vs Config naming** — ✅ Done (Config → Options for all configuration types)~~

### 🎯 Next Up — P0 Critical

**1. Clean 2D API naming** (High Impact for 2D users) 🔥 **TOP PRIORITY**

- Add 2D aliases: `fuse2d`, `cut2d`, `intersect2d` (or overload main functions)
- Remove verbose `Blueprint2D` / `Blueprint` suffixes
- **Why:** 2D operations needlessly verbose compared to 3D
- **Impact:** More consistent, less typing. Estimated improvement: Consistency 9/10 → 10/10
- **Scope:** ~10 functions in 2D module

### 🔥 P1 — High Priority

**3. Simplify initialization story**

- Promote `brepjs/quick` as the default in docs
- Move standard `initFromOC()` to "Advanced" section
- Remove confusing third path (`_setup.js`)
- **Why:** Three init paths create choice paralysis
- **Impact:** Faster onboarding, less confusion

**4. Simplify which-api.md**

- Lead with: "Use `shape()` wrapper for 3D, Sketcher for 2D profiles"
- Move other styles to "Advanced: Alternative Styles" section
- **Why:** Presenting 4+ styles upfront creates decision paralysis
- **Impact:** Clearer guidance for new users

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

## Appendix: Wrapper Coverage Table (Updated after PR #188)

| Operation                     | In Functional API | In Wrapper | Status / Priority |
| ----------------------------- | :---------------: | :--------: | ----------------- |
| mesh / meshEdges              |         Y         |  **✅ Y**  | ✅ PR #188        |
| isValid / isEmpty             |         Y         |  **✅ Y**  | ✅ PR #188        |
| heal / simplify               |         Y         |  **✅ Y**  | ✅ PR #188        |
| toBREP                        |         Y         |  **✅ Y**  | ✅ PR #188        |
| fromBREP                      |         Y         |     N      | Factory (not fit) |
| section / split / slice       |         Y         |  **✅ Y**  | ✅ PR #188        |
| cutAll                        |         Y         |  **✅ Y**  | ✅ PR #188        |
| fuseAll                       |         Y         |     N      | Batch (not fit)   |
| loft                          |         Y         |     N      | P2 (multi-arg)    |
| thicken                       |         Y         |     N      | P2 (via offset)   |
| volumeProps / surfaceProps    |         Y         |     N      | P2                |
| checkInterference             |         Y         |     N      | P2                |
| edgesOfFace / facesOfEdge     |         Y         |     N      | P3 (use escape)   |
| twistExtrude / supportExtrude |         Y         |     N      | P3 (advanced)     |
| 2D booleans                   |         Y         |     N      | P3 (2D wrapper)   |
| exportGltf / exportOBJ / etc. |         Y         |     N      | P3 (standalone)   |
| assembly operations           |         Y         |     N      | P3 (advanced)     |

**Summary:** Wrapper is now ~90% complete for typical CAD workflows. Critical showstoppers (mesh, validate, serialize, section) are resolved.
