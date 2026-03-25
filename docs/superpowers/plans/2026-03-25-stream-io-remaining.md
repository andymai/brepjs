# Stream I/O for Remaining Formats Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the STEP stream I/O pattern to STL, OBJ, and IGES — bypass Emscripten FS for all file-based I/O operations.

**Architecture:** New `StlStreamIO` and `IgesStreamIO` C++ classes write directly to `std::ostringstream` / read from `std::istringstream`, avoiding the `FS.writeFile` → `writer.Write(filename)` → `FS.readFile` round-trip. OBJ export already uses mesh data (no OCCT writer), so it doesn't need a stream wrapper.

**Tech Stack:** C++ (StlAPI, IGESControl), TypeScript

**Docker Rebuild:** Task 1 requires `brepjs.yml` changes. Batch with Plans A and B.

---

## File Structure

| File                                                  | Purpose                                                    |
| ----------------------------------------------------- | ---------------------------------------------------------- |
| `packages/brepjs-opencascade/build-config/brepjs.yml` | Add `StlStreamIO` + `IgesStreamIO` C++ classes             |
| `src/kernel/occt/ioOps.ts`                            | Refactor `exportSTL`/`importSTL`/`exportIGES`/`importIGES` |
| `tests/import-export.test.ts`                         | Verify roundtrip still works                               |

---

### Task 1: C++ stream wrappers

**Files:**

- Modify: `packages/brepjs-opencascade/build-config/brepjs.yml`

- [ ] **Step 1: Investigate STL/IGES stream APIs in V8**

```bash
distrobox-host-exec docker run --rm --entrypoint bash ghcr.io/andymai/opencascade.js:v8 -c '
grep -r "WriteStream\|ReadStream\|std::ostream\|std::istream" \
  /occt/src/DataExchange/TKDESTL/StlAPI/ \
  /occt/src/DataExchange/TKDEIGES/IGESControl/ \
  --include="*.hxx" | head -20
'
```

Check whether `StlAPI_Writer` and `IGESControl_Writer` have stream overloads in V8. If they do, the wrappers are straightforward. If not, use the `BRepTools::Write(shape, ostream)` approach for STL (binary format) and keep FS path for IGES.

- [ ] **Step 2: Add C++ wrappers based on investigation**

If stream APIs exist, add wrappers similar to `StepStreamIO`. If not, document which formats are blocked and skip.

- [ ] **Step 3: Add symbols and commit**

```bash
git add packages/brepjs-opencascade/build-config/brepjs.yml
git commit -m "feat(opencascade): add STL/IGES stream I/O wrappers"
```

---

### Task 2: Wire TS adapters

**Files:**

- Modify: `src/kernel/occt/ioOps.ts`

- [ ] **Step 1: Refactor exportSTL/importSTL with stream detection**

Same pattern as STEP: check for `oc.StlStreamIO?.exportSTL`, fall back to FS path.

- [ ] **Step 2: Refactor exportIGES/importIGES similarly**

- [ ] **Step 3: Run existing I/O tests**

Run: `npx vitest run tests/import-export.test.ts tests/exporterFns.test.ts tests/meshFns.test.ts`
Expected: All pass (fallback paths work)

- [ ] **Step 4: Commit**

```bash
git add src/kernel/occt/ioOps.ts
git commit -m "feat(io): stream-based STL/IGES I/O with FS fallback"
```

---

### Task 3: Update STEP I/O benchmark

- [ ] **Step 1: Extend step-io.bench.test.ts with STL/IGES benchmarks**

Add STL export/import and IGES export benchmarks to measure the stream I/O improvement.

- [ ] **Step 2: Run benchmark**

- [ ] **Step 3: Commit**

```bash
git add benchmarks/step-io.bench.test.ts
git commit -m "test: add STL/IGES to I/O benchmarks"
```
