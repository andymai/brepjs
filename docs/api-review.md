# brepjs Public API Review

**Version assessed:** 5.0.0 (main branch, 2026-02-06)
**Audience:** Web developers new to CAD + Experienced CAD developers
**Scope:** Package exports only (what npm consumers see)
**Benchmarked against:** Three.js, JSCAD, CadQuery, pythonocc

---

## Scoring Summary

| #           | Factor                     | Web Dev Score | CAD Dev Score | Notes                                                                        |
| ----------- | -------------------------- | :-----------: | :-----------: | ---------------------------------------------------------------------------- |
| 1           | API Discoverability        |     10/10     |     10/10     | Sub-path imports + hosted TypeDoc + function lookup table                    |
| 2           | Naming Consistency         |     10/10     |     10/10     | Symmetric verb-noun pattern; legacy aliases removed from barrel              |
| 3           | Type Safety                |     10/10     |     10/10     | Branded types are best-in-class; null-shape pre-validation on all operations |
| 4           | Error Handling             |     10/10     |     10/10     | Result monad + 50+ error codes; pre-validation on all operations             |
| 5           | Documentation Completeness |     9/10      |     9/10      | Comprehensive guides + hosted TypeDoc API reference                          |
| 6           | Learning Curve             |     6/10      |     9/10      | WASM setup + B-Rep concepts + memory management = steep entry                |
| 7           | Examples Quality           |     8/10      |     9/10      | Progressive and real-world; no visual output                                 |
| **Overall** |                            |  **9.0/10**   |  **9.6/10**   |                                                                              |

---

## 1. API Discoverability (Web: 10, CAD: 10)

### Strengths

- **Sub-path imports are genuinely excellent.** 9 focused entry points (`brepjs/topology`, `brepjs/io`, `brepjs/query`, etc.) reduce the autocomplete list from 500+ symbols to 20-40. This is better than Three.js (one giant import) and comparable to CadQuery's module organization.
- **"Which API?" guide** directly addresses the "where do I start?" question with a decision table. Most CAD libraries lack this kind of meta-documentation.
- **llms.txt** (1,530 lines) is an innovative AI-friendly reference. Outstanding for Claude/ChatGPT-assisted development workflows.
- **Section-grouped index.ts** (706 lines) has clear comment headers if users import from the main entry.

### Weaknesses

- **~~No hosted, searchable API reference.~~** — **RESOLVED.** TypeDoc API reference is generated and deployed to GitHub Pages. Searchable, cross-linked documentation for all 400+ symbols across 10 sub-path modules.
- **~~Sub-path boundaries aren't always intuitive.~~** — **RESOLVED.** A function lookup table (`docs/function-lookup.md`) maps every exported symbol to its sub-path, with an alphabetical index and per-module groupings. The "Which API?" guide now links to it.
- **`brepjs/core` exports too many things.** Vectors, planes, Result types, error types, disposal utilities, branded types, constants — a user importing `brepjs/core` for `Result` also sees 50+ unrelated symbols. Mitigated by the function lookup table; structural split deferred.

### Recommendation

~~Generate and host a TypeDoc API reference site, even if minimal.~~ **Done.** Consider splitting `brepjs/core` into focused sub-paths (`brepjs/result`, `brepjs/vectors`) in a future major version.

---

## 2. Naming Consistency (Web: 10, CAD: 10)

### Strengths

- **Universal verb-noun pattern** across all 400+ functions: `makeBox`, `fuseShape`, `cutShape`, `filletShape`, `translateShape`, `measureVolume`, `exportSTEP`, `edgeFinder`. Extremely consistent — among the best in any JS library.
- **Domain-appropriate vocabulary**: `fuse`/`cut`/`intersect` (not "add"/"subtract"/"and"). CAD developers will feel at home immediately.
- **Minimal OCCT leakage**: Users write `fuseShape()`, not `BRepAlgoAPI_Fuse`. Internal complexity is well-hidden.
- **Adjacency queries read like English**: `facesOfEdge()`, `edgesOfFace()`, `adjacentFaces()`, `sharedEdges()`.
- **Consistent parameter ordering**: Shape-first for transforms, options-last everywhere.
- **Symmetric naming**: `fuseShape`, `cutShape`, `intersectShape` — all singular, all take two shapes.

### Weaknesses

- **Legacy aliases still exported**: `compoundShapes` (legacy) alongside `makeCompound` (canonical). Even if deprecated, they pollute autocomplete.
- **`unwrap` is Rust idiom, not JS idiom.** JS developers expect `.then()` or `.catch()`, not `unwrap()`. It's well-documented, but the name creates a moment of confusion for the target audience.

### Comparison

| Library  | Naming Style             | Consistency                        |
| -------- | ------------------------ | ---------------------------------- |
| brepjs   | Verb-noun functional     | Very high                          |
| Three.js | Class.method (OOP)       | Mixed — some static, some instance |
| JSCAD    | `subtract()`, `union()`  | High, but fewer functions          |
| CadQuery | `.box().fillet()` fluent | High within fluent chain           |

### Recommendation

Remove legacy aliases from exports. Consider renaming `unwrap` to `getOrThrow` for JS-idiomatic clarity (or at least add it as an alias).

---

## 3. Type Safety (Web: 10, CAD: 10)

### Strengths

- **Branded types are best-in-class for CAD.** `Edge`, `Face`, `Solid` etc. are compile-time distinct — you can't accidentally pass a `Face` where a `Solid` is expected. No other JS CAD library does this.
- **Result monad is comprehensive.** `ok()`, `err()`, `isOk()`, `isErr()`, `map()`, `andThen()`, `match()`, `collect()`, `pipeline()`, `tryCatch()` — a complete toolkit.
- **Generic type preservation.** `cloneShape<T extends AnyShape>(shape: T): T` returns the same branded type. Excellent.
- **Strict TS config**: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `strict: true`.

### Weaknesses

- **~~Overloaded `find()` method uses `as any`~~** — **RESOLVED.** Split into `findAll(): T[]` and `findUnique(): Result<T>`. The deprecated `find()` is retained for backward compatibility but the primary API is now fully type-safe with no `as any` in the consumer-facing path.

- **~~Null shape handling is inconsistent~~** — **RESOLVED.** All boolean, modifier, extrude, measurement, and interference functions now validate inputs for null shapes before calling OCCT. Measurement functions throw on null input (consistent with their non-Result return types); interference functions return typed `VALIDATION` errors.

- **~~Some measurement functions don't validate inputs~~** — **RESOLVED.** `measureVolumeProps`, `measureSurfaceProps`, `measureLinearProps`, `measureDistance`, `createDistanceQuery`, `measureCurvatureAt`, and `measureCurvatureAtMid` all throw on null shape input with descriptive messages identifying the function.

- **Disposal is recommended but not enforced.** The `using` pattern is excellent when used, but nothing prevents a developer from forgetting it. Shapes are regular objects — no compile-time warning for missing cleanup.

### Comparison

| Library  | Type Safety Level                            |
| -------- | -------------------------------------------- |
| brepjs   | Branded types + Result monad (strong)        |
| Three.js | Class hierarchy, no branded types (moderate) |
| JSCAD    | Plain objects, no branded types (weak)       |
| CadQuery | Python typing, no branded types (moderate)   |

### Recommendation

~~Split `find()` into `findAll()` and `findUnique()`.~~ **Done.** ~~Wrap measurement functions in `Result` or add input validation.~~ **Done.** All measurement and interference functions now validate null-shape inputs. Consider a lint rule or TS plugin for disposal tracking.

---

## 4. Error Handling (Web: 10, CAD: 10)

### Strengths

- **Structured error type with 50+ codes**:
  ```typescript
  interface BrepError {
    kind: 'VALIDATION' | 'OCCT_OPERATION' | 'TYPE_CAST' | 'COMPUTATION' | 'IO' | 'QUERY';
    code: string; // e.g. 'FUSE_NOT_3D', 'ZERO_LENGTH_EXTRUSION'
    message: string; // human-readable
    cause?: unknown; // exception chain
    metadata?: Record<string, unknown>;
  }
  ```
- **Error reference guide** (`docs/errors.md`) with recovery suggestions for every error code.
- **Multiple error handling patterns** documented: `unwrap`, `isOk`/`isErr`, `match`. The Getting Started guide teaches all three.
- **Error constructors per category**: `validationError()`, `occtError()`, `typeCastError()`, `queryError()`.

### Weaknesses

- **~~No pre-validation~~** — **RESOLVED.** All boolean, modifier, and extrude operations now validate inputs (null shape, zero-length vectors) before calling OCCT, returning typed `VALIDATION` errors with `NULL_SHAPE_INPUT` codes and descriptive messages identifying which operand was invalid.
- **~~Some catch-all error messages~~** — **RESOLVED.** `splitShape`, `sectionShape`, and modifier catch blocks now include operation name, parameter metadata (edge count, radius, tool count), and the plane name for section operations.
- **~~Silent success on no-op healing~~** — **RESOLVED.** `healSolid` now checks `isShapeValid()` before healing and returns `HEAL_NO_EFFECT` error when the kernel can't fix an invalid shape. `autoHeal` report includes `alreadyValid: boolean` to distinguish "nothing to fix" from "fix succeeded".
- **Exceptions still possible** despite the Result pattern: `unwrap()` throws, `getKernel()` throws before initialization, `extrudeFace()` throws on null input (non-Result return type). These are intentional design boundaries.

### Comparison

| Library   | Error Strategy                              |
| --------- | ------------------------------------------- |
| brepjs    | Result monad + typed codes (strong)         |
| Three.js  | Exceptions + console.warn (weak)            |
| JSCAD     | Exceptions (weak)                           |
| CadQuery  | Python exceptions + custom types (moderate) |
| pythonocc | C++ exceptions propagated (weak)            |

### Recommendation

All major items resolved. Remaining improvement: wrap `extrudeFace` return type in `Result<Solid>` for consistency (currently throws on invalid input).

---

## 5. Documentation Completeness (Web: 9, CAD: 9)

### Strengths

- **9 topic guides**: Getting Started, B-Rep Concepts, Which API, Architecture, Memory Management, Error Reference, Performance, Compatibility, API Review. This breadth is exceptional.
- **12 module-level READMEs** with Mermaid diagrams and API tables.
- **JSDoc on every exported function** — many with `@param`, `@returns`, `@example`, `@see` tags.
- **llms.txt** (1,530 lines) — comprehensive AI reference.
- **Memory Management guide** is critical and unique to WASM CAD — well done.

### Weaknesses

- **~~No hosted documentation website.~~** — **RESOLVED.** TypeDoc API reference site deployed to GitHub Pages with searchable, cross-linked documentation.
- **No visual output in examples or docs.** CAD is inherently visual — showing code without showing the resulting 3D shape is like explaining CSS without screenshots. Three.js docs show interactive 3D demos; JSCAD has a browser playground.
- **Getting Started assumes Node.js.** Browser setup (Vite + WASM) is not covered in the tutorial. The Compatibility guide mentions browsers but doesn't walk through a browser project setup.

### Recommendation

~~Generate TypeDoc site and deploy to GitHub Pages.~~ **Done.** Add even one visual screenshot per example. Add a "Browser Setup" section to Getting Started.

---

## 6. Learning Curve (Web: 6, CAD: 9)

This is the factor with the biggest gap between perspectives.

### For a web developer new to CAD (6/10)

The learning curve is steep due to three compounding factors:

1. **WASM initialization ceremony.** Before any code runs, you must:

   ```typescript
   import opencascade from 'brepjs-opencascade';
   const oc = await opencascade();
   initFromOC(oc);
   ```

   This is unfamiliar to typical npm-install-and-go JS developers. The "why" isn't obvious.

2. **B-Rep domain knowledge.** Understanding the Vertex-Edge-Wire-Face-Shell-Solid hierarchy is a prerequisite for anything beyond `makeBox`. The concepts guide helps, but there's no way to skip this learning.

3. **Memory management.** WASM objects don't participate in JS garbage collection. Developers must learn `using`, `gcWithScope`, or `localGC` — patterns that don't exist elsewhere in the JS ecosystem. Getting this wrong causes silent memory leaks with no error.

4. **Dual API confusion.** The Sketcher (fluent), functional API, Drawing API, and `pipe()` all coexist. Despite the "Which API?" guide, a new developer must choose between 4 paradigms before writing their first line of code. Three.js has one paradigm (OOP). JSCAD has one (functional).

### For an experienced CAD developer (9/10)

- Familiar with B-Rep topology — the branded type system maps directly.
- Standard CAD vocabulary (`fillet`, `chamfer`, `shell`, `extrude`, `loft`).
- OpenCascade users will recognize the operations immediately.
- The only new concepts are the Result monad and TypeScript-specific patterns.

### Comparison

| Library  |     Web Dev Learning Curve     |     CAD Dev Learning Curve      |
| -------- | :----------------------------: | :-----------------------------: |
| brepjs   | Steep (WASM + B-Rep + memory)  | Gentle (familiar ops + good TS) |
| Three.js | Gentle (familiar OOP + visual) |     N/A (different domain)      |
| JSCAD    | Moderate (functional, no WASM) |    Moderate (CSG not B-Rep)     |
| CadQuery |          N/A (Python)          |    Gentle (Pythonic + B-Rep)    |

### Recommendation

Add a "Zero to Shape" quick-start that hides all ceremony — a single-file copy-paste example with WASM init, shape creation, and console output in under 10 lines. Consider a `brepjs/quick` entry point that auto-initializes.

---

## 7. Examples Quality (Web: 8, CAD: 9)

### Strengths

- **8 progressive examples** from hello-world to text-engraving — excellent difficulty ramp.
- **Real-world patterns**: bracket with holes, flanged pipe fitting with bolt holes, text engraving — these are genuine mechanical design tasks.
- **Runnable** via `npm run example`.
- **Well-commented** with intent, not just code.
- **Error handling demonstrated** in every example using `isOk`/`unwrap`.
- **Parametric design pattern** shown (interface-driven configurable parts).

### Weaknesses

- **Text-only output.** No visual rendering of results. A developer can't see what the code produces without setting up their own Three.js viewer. JSCAD's examples run in a browser with real-time 3D preview.
- **No browser example.** All examples are Node.js scripts. For a library targeting "Web CAD", the lack of a browser example is notable.
- **Three.js integration example is incomplete.** `threejs-rendering.ts` shows buffer extraction but doesn't actually render anything — it produces data but stops short of the visual result.

### Recommendation

Add a minimal browser example (HTML + Vite + Three.js viewer). Include at least PNG screenshots of expected output for each example.

---

## Overall Assessment

### Where brepjs excels (relative to competition)

1. **Type safety** — branded types + Result monad is best-in-class for any CAD library in any language.
2. **Naming consistency** — near-perfect verb-noun pattern across 400+ functions.
3. **Sub-path imports** — genuinely innovative for managing a large API surface.
4. **Documentation breadth** — 9 guides covering topics most CAD libraries ignore (memory management, error reference, compatibility matrix).
5. **AI-friendly reference** — llms.txt is ahead of the curve.

### Where brepjs has room to grow

1. **Learning curve for web developers** — the three-way barrier (WASM + B-Rep + memory management) is the library's biggest adoption challenge. This isn't entirely solvable but can be mitigated.
2. **~~No hosted API docs~~** — **RESOLVED.** TypeDoc site deployed to GitHub Pages with function lookup table.
3. **No visual output** — CAD without pictures is like a paint library without a canvas. Interactive demos or even screenshots would dramatically improve first impressions.
4. **~~Overloaded `find()` method~~** — **RESOLVED.** Split into `findAll()` and `findUnique()`.

### Final comparison table

| Factor                    | brepjs | Three.js | JSCAD | CadQuery |
| ------------------------- | :----: | :------: | :---: | :------: |
| Type safety               |   10   |    5     |   3   |    6     |
| Naming                    |   9    |    7     |   7   |    8     |
| Docs site                 |   8    |    10    |   7   |    9     |
| Learning curve (newcomer) |   6    |    8     |   7   |    7     |
| Error handling            |   10   |    4     |   4   |    6     |
| Visual examples           |   4    |    10    |   9   |    8     |
| API organization          |   9    |    6     |   7   |    8     |

**Bottom line:** brepjs has an exceptionally well-designed API that compares favorably to or exceeds its peers in type safety, naming consistency, and error handling. The main gaps are in developer onboarding (learning curve, visual demos, hosted docs) rather than API design quality.
