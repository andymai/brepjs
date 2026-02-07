# brepjs Public API Review

**Version assessed:** 5.0.0 (main branch, 2026-02-06)
**Audience:** New users/adopters, CAD developers, general JS developers
**Scope:** Exported functions from package entry point, all documentation artifacts
**CAD complexity allowance:** Moderate (CAD is inherently complex, but good API design still expected)

---

## Scoring Summary

| Dimension                 |   Score    | Verdict                                                        |
| ------------------------- | :--------: | -------------------------------------------------------------- |
| 1. Discoverability        |    7/10    | Good docs structure, but overwhelming export surface           |
| 2. Naming & Clarity       |    8/10    | Consistent, descriptive, minimal OCCT leakage                  |
| 3. Consistency            |    7/10    | Strong patterns with notable exceptions                        |
| 4. Type Safety            |   10/10    | Branded types, Result monad, strict TS config, narrowed inputs |
| 5. Documentation Coverage |    8/10    | Excellent llms.txt and JSDoc; gaps in guides                   |
| 6. Error Handling         |    8/10    | Rust-inspired Result with typed codes; some inconsistency      |
| 7. Learning Curve         |    6/10    | Steep for JS devs; WASM init + memory management barrier       |
| 8. Examples & Tutorials   |    7/10    | Good examples exist but lack progressive difficulty            |
| **Overall**               | **7.6/10** | **Strong technical foundation; onboarding is the main gap**    |

---

## 1. Discoverability (7/10)

### What works

- **Well-organized index.ts** (702 lines): Exports are grouped by layer with clear section headers (`// ── Layer 2: topology ──`). A developer scanning the barrel file can quickly find what they need.
- **README links to docs/**: Architecture, performance, memory management, errors, compatibility — all discoverable from the landing page.
- **llms.txt** (1,522 lines): Comprehensive machine-readable API reference. Outstanding for AI-assisted development and a major differentiator vs. competitors.
- **5 example files**: basic-primitives, mechanical-part, 2d-to-3d, import-export, text-engraving cover primary workflows.

### What hurts

- **~300+ exported symbols** from a single entry point. No sub-path exports (e.g., `brepjs/topology`, `brepjs/2d`). A new user importing from `brepjs` gets an autocomplete wall of hundreds of items.
- **No API reference website**. No TypeDoc/TSDoc generation. The llms.txt is great for AI but not for human browsing.
- **Dual API surface**: OOP classes (Sketcher, Drawing, Blueprint) coexist with functional equivalents (sketchExtrude, drawingFuse, blueprintFns). Both are exported. It's unclear which to prefer.
- **No "cookbook" or "how-to" index**. Docs cover architecture deeply but don't answer "how do I make a box with a hole?" without reading examples.

### Comparison

- **Three.js**: Extensive docs site, categorized API, searchable. brepjs lacks this entirely.
- **JSCAD**: Smaller API surface, single paradigm. Easier to orient.
- **CadQuery**: Fluent chaining with excellent discoverability. brepjs's `pipe()` is similar but not the primary API.

---

## 2. Naming & Clarity (8/10)

### What works

- **Consistent verb-noun pattern**: `makeBox`, `makeCylinder`, `fuseShapes`, `cutShape`, `filletShape`, `shellShape`, `translateShape`, `rotateShape`. Highly readable and self-documenting.
- **Descriptive suffixes**: `*Fns.ts` for functional modules, `*Ops.ts` for kernel operations. Clear file-level organization.
- **Domain-appropriate vocabulary**: `fuse`/`cut`/`intersect` (not "add"/"subtract"/"and"). `extrude`/`revolve`/`loft`/`sweep` — standard CAD terms that CAD developers expect.
- **Minimal OCCT leakage**: Internal code references `BRepAlgoAPI_Fuse`, but the public API says `fuseShapes`. `gcWithScope` abstracts `FinalizationRegistry`. Users rarely encounter raw OCCT names.
- **Adjacency queries are natural language**: `facesOfEdge`, `edgesOfFace`, `adjacentFaces`, `sharedEdges`. Reads like English.
- **Assembly tree operations**: `addChild`, `removeChild`, `findNode`, `walkAssembly` — immediately understandable.

### What hurts

- **`castShape`**: Required boilerplate for primitives — `castShape(makeBox(...).wrapped)`. The `.wrapped` accessor leaking into user code is a paper cut. Compare: `makeBox(...)` in JSCAD just returns the shape.
- **`unwrap`**: While idiomatic for Rust, it's unfamiliar to most JS developers. Name doesn't suggest "extract value or throw".
- **Dual naming for the same concept**: `buildCompound` vs `makeCompound` vs `compoundShapes` — three exported functions for similar operations.
- **`getSingleFace`** in query helpers — vague. Single face of what?
- **`toOcVec`/`fromOcVec`**: Exposed publicly despite being low-level OCCT interop. These names leak the abstraction.
- **`isNumber`/`isChamferRadius`/`isFilletRadius`**: Generic-sounding type guards exported at the top level.

### Comparison

- **CadQuery**: `box().fillet(2)` — cleaner fluent API for common operations.
- **JSCAD**: `subtract(cube(...), cylinder(...))` — similar verb-first pattern but fewer wrapper concerns.

---

## 3. Consistency (7/10)

### What works

- **Parameter ordering is consistent**: Shape-first for transforms (`translateShape(shape, vec)`), consistent across `rotateShape`, `mirrorShape`, `scaleShape`.
- **Options-last pattern**: `fuseShapes(a, b, options?)`, `meshShape(shape, options?)`, `exportSTL(shape, options?)` — universally applied.
- **Return type convention**: Fallible operations return `Result<T>`, infallible ones return the value directly. This is mostly consistent.
- **Immutability guarantee**: All transform functions documented as "returns new shape, doesn't dispose inputs." Consistent across the entire API.
- **Generic shape preservation**: `translateShape<T extends AnyShape>(shape: T): T` — preserves the specific branded type through transforms.

### What hurts

- **Return type inconsistency across related functions**:
  - `extrudeFace` returns `Solid` (direct)
  - `revolveFace` returns `Result<Shape3D>`
  - `meshShape` returns `ShapeMesh` (direct, can throw)
  - `exportSTEP` returns `Result<Blob>`

  Similar operations have different error handling strategies. Why does extrude never fail but revolve can?

- **Measurement functions bypass Result**: `measureVolume`, `measureArea`, `measureLength` return plain `number`. They can theoretically fail on invalid shapes but throw instead of returning `Result`.

- **Mixed paradigms exported side-by-side**:
  - OOP: `new Sketcher('XY').lineTo(...).close().extrude(10)`
  - Functional: `sketchExtrude(sketch, 10)`
  - Both are public. No guidance on which to use.

- **Finder inconsistency**: `EdgeFinder` (class, mutable) vs `edgeFinder()` (factory, immutable). Both exported. The class versions use `.find(shape)` and mutate internal state; the functional ones are composable.

- **`chamferDistAngleShape` returns `AnyShape`** (not `Result`) while `chamferShape` returns `Result<Shape3D>`. Sibling functions with different contracts.

### Comparison

- **Lodash/date-fns**: Uniform signatures, one paradigm. brepjs's dual paradigm adds cognitive load.

---

## 4. Type Safety (10/10)

### What works

- **Branded types** (`Vertex`, `Edge`, `Wire`, `Face`, `Shell`, `Solid`, `Compound`): Prevent mixing shape types at compile time. `filletShape` requires `Shape3D`, not `AnyShape` — the compiler catches wrong usage.
- **Strict TypeScript config**: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `strict: true`. The codebase practices what it preaches.
- **Result<T, BrepError>**: Algebraic error type forces explicit handling. `unwrap` is available for quick scripts but the type system nudges you toward `isOk`/`isErr`/`match`.
- **Typed error codes**: `BrepErrorCode` as const object — typos in error codes caught at compile time.
- **Type guards for shapes**: `isVertex()`, `isEdge()`, `isFace()`, `isSolid()`, `isShape3D()` — proper TypeScript narrowing.
- **Generic transforms preserve types**: `translateShape<T extends AnyShape>(shape: T): T` — a `Solid` stays `Solid` after translation.
- **Narrowed input/output types**: `thickenSurface` accepts `Face | Shell` and returns `Result<Solid>`, `offsetShape` accepts `Shape3D` and returns `Result<Shape3D>`, `intersectShapes` requires `Shape3D` for both operands. The type system catches semantically invalid usage at compile time.

### Minor caveats (not scored against)

- **`OcType = any`**: Internal OCCT types are `any`. This is documented and unavoidable (WASM bindings don't provide types), but it means bugs at the kernel boundary aren't caught. This is a limitation of the WASM toolchain, not the library's type design.

### Comparison

- **Three.js**: Excellent TS types, but no branded types. brepjs is stronger here.
- **JSCAD**: Weak TS support. brepjs wins decisively.
- **CadQuery (Python)**: No comparable type safety. brepjs has a major advantage.

---

## 5. Documentation Coverage (8/10)

### What works

- **llms.txt** (1,522 lines): Exhaustive. Every public function is documented with signature, parameters, return type, and usage examples. This is an outstanding resource — few libraries provide anything comparable.
- **JSDoc on public functions**: Sampled across `shapeFns.ts`, `booleanFns.ts`, `extrudeFns.ts`, `measureFns.ts`, `importFns.ts`, `patternFns.ts` — every exported function has at least a one-line JSDoc comment. Key functions (`fuseShapes`, `extrudeFace`, `revolveFace`) have full `@param`, `@returns`, `@example` tags.
- **docs/errors.md**: Complete error code reference with categorization, descriptions, and recovery suggestions.
- **docs/memory-management.md**: Thorough guide covering `using`, `gcWithScope`, `localGC`, `FinalizationRegistry`, environment compatibility matrix, common leak patterns, and debugging tips.
- **docs/architecture.md**: Mermaid diagrams, layer table, data flow sequence diagram, key patterns explained.
- **CONTRIBUTING.md**: Clear development workflow, commit conventions, architecture overview.
- **src/core/README.md**: Documented Result type patterns.

### What hurts

- **No API reference website**: All docs are Markdown files in the repo. No generated TypeDoc, no searchable web docs. For a library with 300+ exports, this is a significant gap.
- **No "Getting Started" tutorial**: README shows a quick start snippet, but there's no step-by-step walkthrough. A new user must piece together knowledge from examples and llms.txt.
- **No migration guide**: v5.0.0 removed deprecated code and migrated to functional API. No docs explain how to migrate from v4.
- **docs/performance.md** and **docs/compatibility.md** exist but weren't examined deeply — their presence is positive.
- **No conceptual guide**: "What is B-rep?" "What is a Wire vs Edge vs Face?" For JS developers with no CAD background, the domain concepts are unexplained.

### Comparison

- **Three.js**: Extensive manual, migration guides, fundamentals section. brepjs needs this.
- **CadQuery**: Interactive Jupyter examples with visual output. brepjs examples are text-only (no visualizations).

---

## 6. Error Handling (8/10)

### What works

- **Rust-inspired Result monad**: `Result<T, BrepError>` with `ok()`, `err()`, `isOk()`, `isErr()`, `unwrap()`, `unwrapOr()`, `match()`, `map()`, `andThen()`, `collect()`, `pipeline()`. Comprehensive and well-designed.
- **Structured BrepError**: `{ kind, code, message, cause?, metadata? }`. Machine-readable `kind` (8 categories), human-readable `message`, exception chain via `cause`.
- **40+ typed error codes**: `BrepErrorCode.FUSE_FAILED`, `BrepErrorCode.ZERO_LENGTH_EXTRUSION`, etc. Compile-time checked.
- **Error constructors per category**: `occtError()`, `validationError()`, `typeCastError()`, `ioError()`, `computationError()`, `queryError()`. Clean factory pattern.
- **Input validation**: Zero-length vectors, empty arrays, null shapes, geometry type mismatches — all caught with descriptive error messages.
- **docs/errors.md**: Recovery suggestions for every error code.

### What hurts

- **Inconsistency across modules**:
  - Boolean, extrude, loft, healing, IO → `Result<T>` (good)
  - Measurement, meshing → plain values that throw (inconsistent)
  - Sketcher methods → delegate, mixed patterns
- **Some OCCT errors are opaque**: "Loft operation failed" without explaining _why_. OCCT itself is often unhelpful, but the library could add more diagnostic context.
- **`metadata` field rarely populated**: Available on `BrepError` but most errors only set `kind`, `code`, and `message`. Could include failing parameter values, shape descriptions, etc.
- **No error recovery utilities**: No `retry()`, no `fallback()` pattern. Users must build their own.

### Comparison

- **Zod**: Gold standard for structured errors in JS. brepjs's approach is solid but less mature.
- **CadQuery/JSCAD**: Both use plain exceptions. brepjs's Result type is significantly better.

---

## 7. Learning Curve (6/10)

### Full journey: npm install to first solid

**Step 1 — Install** (Easy): `npm install brepjs brepjs-opencascade`. Two packages, clearly documented. Minor friction: user must know they need the WASM package separately.

**Step 2 — Initialize WASM** (Moderate): `const oc = await opencascade(); initFromOC(oc);`. Async initialization that must happen before any API use. Not obvious from types alone — you'll get a runtime error if you forget. The README covers this, but it's a potential "why doesn't this work?" moment.

**Step 3 — Create first shape** (Confusing):

```typescript
// README example:
const box = castShape(makeBox([0, 0, 0], [50, 30, 20]).wrapped);
```

New users will ask: Why `castShape`? What is `.wrapped`? Why can't `makeBox` just return a `Solid`? This is the biggest onboarding friction point. The answer (OCCT legacy, kernel abstraction) is architectural, but the user just wants a box.

Alternative path via Sketcher is cleaner but not shown first:

```typescript
const box = sketchRectangle(20, 10).extrude(10);
```

**Step 4 — Boolean operations** (Moderate): `unwrap(cutShape(box, hole))`. User must understand `Result<T>` and `unwrap()`. If they're from Rust, this is natural. If they're a typical JS developer, they need to learn a new pattern. The learning material exists (llms.txt, errors.md) but isn't presented as a tutorial.

**Step 5 — Memory management** (Hard): WASM objects need cleanup. The docs explain `using`, `gcWithScope`, `localGC` — but the concept of manual memory management is alien to most JS developers. This is the steepest part of the curve.

**Step 6 — Export** (Easy): `unwrap(exportSTEP(shape))` — straightforward.

### Barriers by audience

| Audience           | Primary barrier                                | Secondary barrier                          |
| ------------------ | ---------------------------------------------- | ------------------------------------------ |
| General JS devs    | WASM memory management, `castShape`/`.wrapped` | B-rep domain concepts                      |
| CAD developers     | JS/TS ecosystem (npm, ESM, bundlers)           | Result type (if not from Rust)             |
| New users/adopters | No tutorial, overwhelming API surface          | Which paradigm (OOP vs functional) to use? |

### Comparison

- **Three.js**: Dozens of official examples with live demos. Gentle on-ramp.
- **JSCAD**: `cube({size: 10})` — zero ceremony for first shape. Dramatically lower barrier.
- **CadQuery**: `cq.Workplane("XY").box(1, 1, 1)` — one line, one concept.

---

## 8. Examples & Tutorials (7/10)

### What works

- **5 dedicated example files** covering distinct workflows: primitives/booleans, mechanical parts, 2D-to-3D, import/export, text engraving.
- **llms.txt advanced examples** (lines 1278-1522): Flanged pipe fitting, enclosure with snap-fits, parametric spring, multi-format export, functional pipeline with healing. These are production-realistic and demonstrate composing many API features.
- **Examples use proper error handling**: `isOk()` checks, `unwrap()` where appropriate. Good modeling of real-world patterns.
- **Examples demonstrate the primary workflow**: Sketch → Extrude → Boolean → Fillet → Shell → Export.

### What hurts

- **Examples aren't runnable out of the box**: No `tsconfig.json` for examples, no `npm run example:basic` script. Users can't just clone and run.
- **No progressive complexity**: basic-primitives.ts jumps straight to boolean operations. There's no "absolute beginner" example that just creates and exports a single box.
- **No visual output**: Every example produces console.log output or STEP blobs. No rendering integration example (Three.js, Babylon.js). For a web CAD library, this is a significant gap.
- **No interactive playground**: No CodeSandbox/StackBlitz template. Users can't experiment without local setup.
- **llms.txt examples not separately runnable**: The best examples are embedded in a 1,500-line reference file, not standalone files.

### Comparison

- **Three.js**: Hundreds of live examples with source. Gold standard.
- **JSCAD**: Browser-based playground at openjscad.xyz. Instant feedback.
- **CadQuery**: CQ-editor with live 3D preview. Immediate visual gratification.

---

## Prioritized Recommendations

### High Impact, Low Effort

| #   | Recommendation                                                                                                                                                | Impact | Effort |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ |
| 1   | **Add sub-path exports** (`brepjs/topology`, `brepjs/2d`, `brepjs/io`). Reduces autocomplete noise and lets users import only what they need.                 | High   | Low    |
| 2   | **Make `makeBox`, `makeCylinder`, `makeSphere` return branded types directly** (no `castShape(x.wrapped)` ceremony). Biggest quick-win for first impressions. | High   | Medium |
| 3   | **Add a "Which API?" guide** in README explaining when to use Sketcher (most users) vs functional API (advanced/composable) vs low-level helpers.             | High   | Low    |
| 4   | **Make examples runnable**: Add `examples/tsconfig.json` and `npm run example` script.                                                                        | Medium | Low    |

### High Impact, Medium Effort

| #   | Recommendation                                                                                                                                                      | Impact | Effort |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ |
| 5   | **Write a "Getting Started" tutorial**: Step-by-step from install to rendered 3D part, with a Three.js rendering example at the end.                                | High   | Medium |
| 6   | **Standardize return types**: `meshShape` and measurement functions should return `Result<T>` for consistency. `chamferDistAngleShape` should match `chamferShape`. | Medium | Medium |
| 7   | **Add a Three.js rendering example**: Users of a web CAD library expect to see shapes on screen.                                                                    | High   | Medium |
| 8   | **Generate TypeDoc API reference**: Even a basic hosted site would massively improve discoverability.                                                               | High   | Medium |

### Medium Impact, Medium Effort

| #   | Recommendation                                                                                                                                                                                  | Impact | Effort |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ |
| 9   | **Deprecate mutable Finder classes** (`EdgeFinder`, `FaceFinder`) in favor of the immutable `edgeFinder()` / `faceFinder()` factory functions. Reduces API surface by ~50% in the query module. | Medium | Medium |
| 10  | **Consolidate compound helpers**: `buildCompound` vs `makeCompound` vs `compoundShapes` — keep one, alias or deprecate the rest.                                                                | Low    | Low    |
| 11  | **Add a "B-Rep Concepts" page** for JS developers: What are vertices, edges, wires, faces, shells, solids? When do you need each?                                                               | Medium | Medium |
| 12  | **Populate BrepError metadata**: Include failing parameter values, shape types, and tolerances in error metadata for better debugging.                                                          | Medium | Medium |

### Lower Priority

| #   | Recommendation                                                                                                               | Impact | Effort |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ------ | ------ |
| 13  | Create an interactive playground (StackBlitz/CodeSandbox template)                                                           | Medium | High   |
| 14  | Add v4→v5 migration guide                                                                                                    | Low    | Low    |
| 15  | Add `Result.retry()` / recovery utilities                                                                                    | Low    | Medium |
| 16  | Remove low-level OCCT interop (`toOcVec`, `fromOcVec`) from default exports; move to a sub-path export like `brepjs/interop` | Low    | Low    |

---

## Comparison Matrix vs. Similar Libraries

| Feature                    | brepjs | Three.js | JSCAD | CadQuery |
| -------------------------- | :----: | :------: | :---: | :------: |
| Type safety                | ★★★★★  |   ★★★★   |  ★★   |    ★★    |
| Error handling             |  ★★★★  |    ★★    |  ★★   |    ★★    |
| Documentation              |  ★★★   |  ★★★★★   |  ★★★  |   ★★★★   |
| Learning curve             |   ★★   |   ★★★★   | ★★★★★ |   ★★★★   |
| API consistency            |  ★★★   |   ★★★★   | ★★★★★ |   ★★★★   |
| First-run experience       |   ★★   |  ★★★★★   | ★★★★  |   ★★★★   |
| CAD feature depth          | ★★★★★  |    ★     |  ★★★  |  ★★★★★   |
| Format support             | ★★★★★  |   ★★★    |  ★★   |   ★★★★   |
| AI-assisted dev (llms.txt) | ★★★★★  |    ★     |   ★   |    ★     |

**Key takeaway**: brepjs excels in type safety, error handling, CAD depth, and AI-friendliness. Its weakest areas — learning curve, first-run experience, documentation accessibility — are all solvable without architectural changes.

---

## Conclusion

brepjs v5.0.0 has a **technically excellent foundation**: branded types, Result monads, layered architecture, comprehensive WASM abstraction, and a rich functional API. The error handling system is among the best in the CAD library space. The llms.txt file is a standout asset for modern AI-assisted development.

The primary weakness is **onboarding friction**. The `castShape(x.wrapped)` ceremony, WASM memory management, overwhelming export surface, lack of a tutorial, and dual OOP/functional paradigm create a steep initial learning curve — especially for JavaScript developers without CAD experience.

The good news: these are documentation and API ergonomics issues, not architectural ones. The recommendations above are ordered by impact/effort ratio and could transform the developer experience without requiring major internal changes.

**Overall Score: 7.6/10** — Strong internals, needs polish on the front door.
