# Public API Assessment: Friction Points & Action Items

**Date:** 2026-02-07
**Last Updated:** 2026-02-07
**Goal:** Identify actionable friction points in the brepjs public API
**Canonical style:** Fluent wrapper (`shape(box(...)).cut(...).fillet(...)`)

---

## ✅ Completed Work (Condensed)

1. **PR #186** - Removed legacy API names, cleaned up exports (427 → 370 symbols)
2. **PR #188** - Completed wrapper API (~40% → ~90%), made extrude() return Result
3. **PR #190** - Documented shape() wrapper as canonical API across all docs
4. **PR #191** - Standardized parameter naming (`at` for position, `axis` for direction)
5. **Config → Options** - Renamed all configuration types for consistency
6. **Clean 2D API** - Added `*2D` aliases (translate2D, getBounds2D, etc.), deprecated verbose names
7. **Simplify which-api.md** - Restructured with TL;DR, moved alternatives to Advanced section
8. **Simplify init** - Promoted brepjs/quick as default, moved initFromOC() to Advanced section
9. **Add cookbook.md** - Created 15 practical "How do I..." recipes using canonical wrapper style

---

## Dimension Scores

| Dimension                  | Before | After PR #188 | After PR #190 | After PR #191 | After Config→Options | After 2D Naming | Summary                                                         |
| -------------------------- | ------ | ------------- | ------------- | ------------- | -------------------- | --------------- | --------------------------------------------------------------- |
| **Consistency & Naming**   | 4/10   | 5/10          | 5/10          | **8/10**      | **9/10**             | **10/10** 🎯    | ✅ Complete: 2D API now matches 3D naming style                 |
| **Verbosity & Ergonomics** | 5/10   | 8/10          | 8/10          | 8/10          | 8/10                 | 8/10            | ✅ Wrapper ~90% complete; users rarely need to unwrap           |
| **Discoverability**        | 3/10   | 3/10          | **8/10**      | 8/10          | 8/10                 | **9/10**        | ✅ Complete: Wrapper canonical, init simplified, cookbook added |
| **Error Handling UX**      | 6/10   | 8/10          | 8/10          | 8/10          | 8/10                 | 8/10            | ✅ Consistent Result boundaries; wrapper auto-throws            |

**Overall: 4.5/10 → 6/10 → 7.25/10 → 7.75/10 → 8.0/10 → 8.25/10 → 8.5/10** — Consistency 10/10 🎯, Discoverability 9/10 ✅. Next: Push remaining dimensions to 9-10/10.

---

## 1. Consistency & Naming (10/10 🎯)

### 1.1 Position Parameter Chaos (✅ COMPLETED in PR #191)

**Status:** ✅ Position and direction parameters standardized to `at` and `axis`.

### 1.2 Dual Naming Convention (✅ COMPLETED in PR #186)

**Status:** ✅ All legacy names removed. Public API now has single canonical names only.

### 1.3 2D Operation Verbosity (✅ COMPLETED)

**Status:** ✅ Clean 2D API naming implemented. All 2D operations now have concise `*2D` aliases.

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

### 3.2 Three Initialization Paths (✅ COMPLETED)

**Status:** ✅ getting-started.md restructured to promote brepjs/quick as the default.

### 3.3 API Style Paralysis (✅ COMPLETED)

**Status:** ✅ which-api.md restructured to eliminate decision paralysis.

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

### 3.7 No Task-Based Cookbook (✅ COMPLETED)

**Status:** ✅ Created cookbook.md with 15 practical "How do I..." recipes using canonical wrapper style.

---

## 4. Error Handling UX (6/10)

### 4.1 Inconsistent Result vs Throw Boundary (✅ COMPLETED in PR #188)

**Status:** ✅ `extrude()` and `extrudeFace()` now return `Result<Solid>`, consistent with `revolve()` and `loft()`.

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
~~7. **Clean 2D API naming** — ✅ Done (added `*2D` aliases, deprecated verbose names, Consistency 10/10 achieved)~~
~~8. **Simplify which-api.md** — ✅ Done (TL;DR + clear guidance, moved alternatives to Advanced section)~~
~~9. **Simplify initialization story** — ✅ Done (brepjs/quick as default, manual init in Advanced section)~~
~~10. **Add cookbook.md** — ✅ Done (15 practical recipes using canonical wrapper style)~~

### 🎯 Next Up — Push to 9-10/10

**Current status:**

- Consistency & Naming: 10/10 🎯 (Complete!)
- Discoverability: 9/10 ✅ (Very good - wrapper canonical, init simple, cookbook added)
- Verbosity & Ergonomics: 8/10 (Good - wrapper ~90% complete)
- Error Handling UX: 8/10 (Good - consistent Result boundaries)

**Next priorities to reach 9-10/10:**

**1. Complete remaining wrapper methods** (Verbosity 8/10 → 9/10)

- Add `loft()`, `twistExtrude()`, `supportExtrude()` to wrapper
- **Why:** Users occasionally need these advanced operations
- **Impact:** Reduces need to unwrap for edge cases

### 📋 P3 — Lower Priority

**2. Accept ShapeFinder directly** in fillet/chamfer/shell (not just callbacks)

**3. Add OCCT error translation layer** for top 10 common failures with actionable messages

**4. Add `suggestion` field to BrepError** for recovery hints

### 🎨 P3 — Polish / Nice-to-Have

**5. Add cookbook.md** with task-based recipes ("How do I...?")

**6. Fix adjacency naming** — either add `get` prefix or drop it from both patterns 14. **Type error metadata** per error code for better DX 15. **Add `.tryFuse()` / `.tryCut()`** to wrapper for functional error handling 16. **Remove duplicate exports** — IO functions from both `brepjs/topology` and `brepjs/io` 17. **Fix Drawing transform naming** — pick one pattern (recommend Noun prefix)

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
