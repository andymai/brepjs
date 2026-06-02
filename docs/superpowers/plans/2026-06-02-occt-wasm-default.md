# occt-wasm Default Kernel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `occt-wasm` brepjs's default kernel across the library, test gate, docs, playground, and agent viewer, keeping `brepjs-opencascade` as a silent runtime fallback.

**Architecture:** Reorder `init()`'s 3-tier auto-detect (occt-wasm → occt → brepkit); flip the literal `--project occt` test gate and root coverage denominator to occt-wasm; rewrite the two OCCT-hardcoded web workers to boot `OcctKernel.init()`; sweep all narrative docs so `brepjs-opencascade` survives only as the npm package. A `default` field on `KernelConfig` becomes the single source of truth for the _test_ side (runtime `init()` keeps its own order — `src/` Layer 0 cannot import a test helper).

**Tech Stack:** TypeScript (ESM, `.js` import extensions, `@/` alias), Vitest (multi-project, per-kernel), Vite (library + playground + viewer), occt-wasm@3.2.0 (`OcctKernel.init`/`OcctWasmAdapter.fromKernel`).

**Spec:** `docs/superpowers/specs/2026-06-02-occt-wasm-default-design.md`

**Branch:** `feat/occt-wasm-default` (already created; design committed)

---

## File Structure

**Library (Phase A):**

- `src/kernel/index.ts` — `init()` reorder + docstring.
- `src/quick.ts` — dynamic-import fallback init.
- `scripts/build-quick.js` — generated `dist/quick.js` string.
- `tests/helpers/kernelRegistry.ts` — `default` field + `defaultKernelId()` + corrected capability flags.

**Test gate (Phase B):**

- `package.json` — `--project occt` → `occt-wasm` in 5 scripts + new `test:occt`.
- `tests/setup-kernel.ts`, `tests/helpers/kernelInit.ts` — `?? defaultKernelId()`; modernize occt-wasm loader.
- `vitest.config.ts` — root coverage exclude + thresholds.
- `tests/helpers/kernelRegistry.test.ts` — assertion updates.

**Docs (Phase C):** README + `apps/docs/**` + `docs/**` + `llms*.txt` + `context7.json` + agent/skill docs + regenerated conformance/compat matrices.

**Playground + viewer (Phase D):**

- `apps/playground/src/workers/cad.worker.ts`, `apps/playground/src/lib/wasmConfig.ts`, `apps/playground/vite.config.ts`, `apps/playground/src/types/brepjs-ambient.d.ts` (regenerated).
- `packages/brepjs-agent/viewer/src/kernelWorker.ts`, `packages/brepjs-agent/viewer/vite.config.ts`, `packages/brepjs-agent/README.md`.

---

## Phase A — Library code

### Task A1: Correct & extend the kernel registry

**Files:**

- Modify: `tests/helpers/kernelRegistry.ts`
- Modify: `tests/helpers/kernelRegistry.test.ts`

- [ ] **Step 1: Add `default` to the `KernelConfig` type and the occt-wasm entry**

In `tests/helpers/kernelRegistry.ts`, add an optional field to the `KernelConfig` interface (next to `adapterDir`):

```ts
  /** Marks the auto-selected default kernel for the test gate. Exactly one config sets this. */
  readonly default?: boolean | undefined;
```

On the `occt-wasm` entry add `default: true,` (top of the object, after `id`). Leave every other entry without the field.

- [ ] **Step 2: Correct the capability flags to match the adapters**

In the same file: on the `occt` entry set `variableFillet: false` (its `filletVariable` is a throwing stub). On the `occt-wasm` entry set `variableFillet: true` (it implements `filletVariable`). Leave `constraintSketch: false` on both OCCT kernels (occt currently says `true` — change occt's `constraintSketch` to `false`).

- [ ] **Step 3: Add a `defaultKernelId()` helper**

At the end of `tests/helpers/kernelRegistry.ts` (pure data, no imports — keep it import-free):

```ts
/** The id of the default kernel for the test gate (single source of truth). */
export function defaultKernelId(): string {
  const found = kernelConfigs.find((k) => k.default);
  if (!found) throw new Error('kernelRegistry: no kernel marked default');
  return found.id;
}
```

- [ ] **Step 4: Update the registry self-test**

In `tests/helpers/kernelRegistry.test.ts`, find the assertion `expect(caps.variableFillet).toBe(true);` (the occt block) and change it to `toBe(false)`. Find any occt `constraintSketch` assertion and set to `false`. Add a test:

```ts
import { defaultKernelId } from './kernelRegistry.js';

it('marks occt-wasm as the default kernel', () => {
  expect(defaultKernelId()).toBe('occt-wasm');
});
```

- [ ] **Step 5: Run the registry test (still on occt project — gate not flipped yet)**

Run: `npx vitest run --project occt tests/helpers/kernelRegistry.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/helpers/kernelRegistry.ts tests/helpers/kernelRegistry.test.ts
git commit -m "feat(kernel): mark occt-wasm default + correct capability flags in registry"
```

### Task A2: Reorder `init()` auto-detect

**Files:**

- Modify: `src/kernel/index.ts:177-213` (the `init()` function + trailing comment)

- [ ] **Step 1: Replace the `init()` body**

Replace the OCCT-first try/catch sequence (currently OpenCascade → brepkit) with occt-wasm-first. The new ordered body:

```ts
export async function init(): Promise<string> {
  if (_defaultKernelId) return _defaultKernelId;

  // Try occt-wasm first (the default kernel). Browser-safe: OcctKernel.init()
  // auto-locates its .wasm via import.meta.url.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic import
    const { OcctKernel } = (await import(/* @vite-ignore */ 'occt-wasm')) as any;
    const kernel = await OcctKernel.init();
    registerKernel('occt-wasm', OcctWasmAdapter.fromKernel(kernel));
    return 'occt-wasm';
  } catch {
    // occt-wasm not available, try brepjs-opencascade
  }

  // Fallback: brepjs-opencascade (legacy default kernel)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic import
    const mod = (await import(/* @vite-ignore */ 'brepjs-opencascade')) as any;
    const oc = await mod.default();
    initFromOC(oc);
    return 'occt';
  } catch {
    // OCCT not available, try brepkit
  }

  // Fallback: brepkit
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic import
    const bk = (await import(/* @vite-ignore */ 'brepkit-wasm')) as any;
    if (typeof bk.default === 'function') await bk.default();
    registerKernel('brepkit', new BrepkitAdapter(new bk.BrepKernel()));
    return 'brepkit';
  } catch {
    // brepkit not available either
  }

  throw new Error(
    'brepjs: no kernel package found. Install one of:\n' +
      '  npm install occt-wasm            (recommended, default)\n' +
      '  npm install brepjs-opencascade\n' +
      '  npm install brepkit-wasm'
  );
}
```

`OcctWasmAdapter` is already imported/exported in this file (line ~260). Confirm the import is in scope at the top of `init()`'s module (it is re-exported, so add a top-of-file `import { OcctWasmAdapter } from './occtWasm/occtWasmAdapter.js';` if not already imported for use — check; the file currently only re-exports it).

- [ ] **Step 2: Update the docstring + remove the stale manual-registration note**

Replace the `@example`/prose above `init()` so it states occt-wasm is the default, and DELETE the comment block that says "occt-wasm is supported but requires explicit registration via registerKernel() because its WASM loading uses Node.js APIs (import.meta.resolve, node:path)". Update the prose "Tries `brepjs-opencascade` (OCCT) first, then falls back to `brepkit-wasm`" → "Tries `occt-wasm` first, then `brepjs-opencascade`, then `brepkit-wasm`."

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors).

- [ ] **Step 4: Commit**

```bash
git add src/kernel/index.ts
git commit -m "feat(kernel): default init() to occt-wasm with opencascade fallback"
```

### Task A3: `brepjs/quick` dynamic-import fallback (source + generator)

**Files:**

- Modify: `src/quick.ts`
- Modify: `scripts/build-quick.js:18-23`

- [ ] **Step 1: Rewrite `src/quick.ts`**

Both imports MUST be dynamic so an install with only one package doesn't fail at module load:

```ts
import { initFromOC, registerKernel, OcctWasmAdapter } from './kernel/index.js';

// occt-wasm first (default); fall back to brepjs-opencascade.
try {
  const { OcctKernel } = await import('occt-wasm');
  const kernel = await OcctKernel.init();
  registerKernel('occt-wasm', OcctWasmAdapter.fromKernel(kernel));
} catch {
  const { default: opencascade } = await import('brepjs-opencascade');
  const oc = await opencascade();
  initFromOC(oc);
}

export * from './index.js';
```

- [ ] **Step 2: Rewrite the generated string in `scripts/build-quick.js`**

Replace the `quickJs` template (lines 18-23) so `dist/quick.js` re-exports from `./brepjs.js` and uses the same dynamic fallback:

```js
const quickJs = `import { initFromOC, registerKernel, OcctWasmAdapter } from './brepjs.js';
try {
  const { OcctKernel } = await import('occt-wasm');
  const kernel = await OcctKernel.init();
  registerKernel('occt-wasm', OcctWasmAdapter.fromKernel(kernel));
} catch {
  const { default: opencascade } = await import('brepjs-opencascade');
  const oc = await opencascade();
  initFromOC(oc);
}
export * from './brepjs.js';
`;
```

Confirm `OcctWasmAdapter` is a named export of the built `dist/brepjs.js` (it is re-exported from `src/kernel/index.ts:260`, which flows into the package entry — verify `src/index.ts` re-exports it; if not, add `export { OcctWasmAdapter } from './kernel/index.js';` to `src/index.ts`).

- [ ] **Step 3: Typecheck + verify quick still builds**

Run: `npm run typecheck`
Expected: PASS.
Run: `npm run build` then check `dist/quick.js` contains the new fallback (the build runs `build-quick.js`).
Expected: `dist/quick.js` shows the occt-wasm-first try/catch.

- [ ] **Step 4: Commit**

```bash
git add src/quick.ts scripts/build-quick.js src/index.ts
git commit -m "feat(kernel): quick entry boots occt-wasm with opencascade fallback"
```

---

## Phase B — Test gate

### Task B1: Flip the project flags and env defaults

**Files:**

- Modify: `package.json:220-223,245`
- Modify: `tests/setup-kernel.ts:11` (+ docstring lines 4-5,10)
- Modify: `tests/helpers/kernelInit.ts:27`

- [ ] **Step 1: Flip the `--project occt` scripts and add `test:occt`**

In `package.json`, change:

- `"test": "vitest run --project occt --changed"` → `--project occt-wasm --changed`
- `"test:full": "vitest run --project occt --coverage"` → `--project occt-wasm --coverage`
- `"test:ci": "vitest run --project occt"` → `--project occt-wasm`
- `"test:watch": "vitest --project occt"` → `--project occt-wasm`
- `"test:docs": "... vitest run --project occt tests/docs"` → `--project occt-wasm tests/docs`

Add a new script (next to `test:brepkit`):

```json
    "test:occt": "vitest run --project occt",
```

- [ ] **Step 2: Derive the env default from `defaultKernelId()`**

In `tests/setup-kernel.ts`, change line 11:

```ts
import { defaultKernelId } from './helpers/kernelRegistry.js';
export const currentKernel: string = process.env['TEST_KERNEL'] ?? defaultKernelId();
```

Update the docstring (lines 4-5,10) to say default `"occt-wasm"`.

In `tests/helpers/kernelInit.ts:27`, change:

```ts
const kernel = id ?? process.env['TEST_KERNEL'] ?? defaultKernelId();
```

Add the import: `import { kernelConfigs, defaultKernelId } from './kernelRegistry.js';`

- [ ] **Step 3: Verify the default project now selects occt-wasm**

Run: `npx vitest run --project occt-wasm tests/init.test.ts`
Expected: PASS (`currentKernel` resolves to `occt-wasm`).
Run: `npm run test:occt -- tests/init.test.ts`
Expected: PASS (opt-in occt path still works).

- [ ] **Step 4: Commit**

```bash
git add package.json tests/setup-kernel.ts tests/helpers/kernelInit.ts
git commit -m "test(kernel): flip default test project + env default to occt-wasm"
```

### Task B2: Modernize the occt-wasm test loader

**Files:**

- Modify: `tests/helpers/kernelInit.ts:43-53` (the `occt-wasm` branch)

- [ ] **Step 1: Replace the low-level loader with `OcctKernel.init()`**

Replace the `else if (kernel === 'occt-wasm') { ... }` body with:

```ts
  } else if (kernel === 'occt-wasm') {
    if (_occtWasmInitialized) return;
    _occtWasmInitialized = true;
    const { OcctKernel } = await import('occt-wasm');
    const k = await OcctKernel.init();
    registerKernel('occt-wasm', OcctWasmAdapter.fromKernel(k));
    _available.push('occt-wasm');
```

Remove the now-unused `node:path`/`node:url`/`import.meta.resolve` lines in that branch. Keep the `OcctWasmAdapter` import already at the top of the file.

- [ ] **Step 2: Run a slice of the occt-wasm suite to prove the loader works**

Run: `npx vitest run --project occt-wasm tests/init.test.ts tests/apiSmoke.test.ts`
(substitute any small existing smoke file if `apiSmoke` doesn't exist — pick one fast file)
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/helpers/kernelInit.ts
git commit -m "test(kernel): load occt-wasm via OcctKernel.init in test helper"
```

### Task B3: Flip the coverage denominator and re-floor thresholds

**Files:**

- Modify: `vitest.config.ts:67-75`
- Possibly: `tests/helpers/kernelRegistry.ts` (occt-wasm `extraCoverageExcludes`)

- [ ] **Step 1: Point the root coverage exclude at the default kernel**

In `vitest.config.ts`, change line 67:

```ts
      exclude: ['src/**/*.d.ts', 'src/**/index.ts', ...coverageExcludesFor(defaultKernelId())],
```

Add `defaultKernelId` to the import on line 3: `import { kernelConfigs, coverageExcludesFor, defaultKernelId } from './tests/helpers/kernelRegistry.js';`

- [ ] **Step 2: Decide the geometry2d exclude**

Check whether the occt-wasm adapter loads `src/kernel/geometry2d.ts` (occt excludes it via `extraCoverageExcludes`). Grep: `grep -rn "geometry2d" src/kernel/occtWasm/`. If occt-wasm does NOT use it, add `extraCoverageExcludes: ['src/kernel/geometry2d.ts']` to the occt-wasm registry entry. If it DOES use it, leave it included.

- [ ] **Step 3: Measure occt-wasm coverage**

Run: `npm run test:full 2>&1 | tail -30`
(now runs `--project occt-wasm --coverage`)
Record the four reported numbers (statements / branches / functions / lines) from the coverage summary.

- [ ] **Step 4: Floor the thresholds per-metric**

In `vitest.config.ts:68-75`, set each threshold to the measured value rounded DOWN to the nearest whole percent (or 1 below if it sits exactly on a boundary, to avoid flake). Replace the occt-calibrated `84/74/90/84` with the occt-wasm-measured floor. Update the inline comment that references "V8 RC4 regressions" if no longer accurate.

- [ ] **Step 5: Re-run coverage to confirm the gate passes at the new floor**

Run: `npm run test:full 2>&1 | tail -15`
Expected: coverage thresholds met; exit 0.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts tests/helpers/kernelRegistry.ts
git commit -m "test(kernel): gate coverage on occt-wasm denominator with measured floor"
```

### Task B4: Full occt-wasm suite green + audit excluded files

**Files:** none (verification) — possibly `tests/helpers/kernelRegistry.ts` excludeTests note.

- [ ] **Step 1: Run the full default suite**

Run: `npm run test:ci 2>&1 | tail -20`
Expected: all pass / skip, 0 fail (matches the 3687-pass baseline).

- [ ] **Step 2: Note the changed-file feedback gap**

The occt-wasm `excludeTests` (`tests/brepkitExtended.test.ts`, `brepkitAdapter.test.ts`, `brepkitSketchArc.test.ts`, `brepkitOffsetV2.test.ts`, `gltfRoundTrip.test.ts`) get no pre-commit `--changed` feedback now. Confirm each is genuinely brepkit-only or gltf-specific (not exercising occt-wasm) — they are, by name. No action beyond confirming; leave a one-line comment above `excludeTests` in `kernelRegistry.ts` documenting why these stay excluded as the default project.

- [ ] **Step 3: Commit (if comment added)**

```bash
git add tests/helpers/kernelRegistry.ts
git commit -m "test(kernel): document occt-wasm default-project test exclusions"
```

---

## Phase C — Docs / narrative sweep

> Mechanical but precise. For each file: replace narrative that names `brepjs-opencascade`/OpenCascade as **the default kernel** or teaches `initFromOC(await opencascade())` as the canonical init with the occt-wasm equivalent. Keep `brepjs-opencascade` only as a literal install/peer-dep/alternate. After edits, run `npm run validate` (format/lint) and the docs-link checks.

### Task C1: README + canonical chapter site

**Files:**

- Modify: `README.md` (install line 60, Status line 55, manual-init block 65-75)
- Modify: `apps/docs/getting-started/install.md`, `apps/docs/concepts/kernels.md`, `apps/docs/integration/frameworks.md`, `apps/docs/introduction/stability.md`, `apps/docs/reference/glossary.md`, `apps/docs/advanced/workers.md`, `apps/docs/index.md`, `apps/docs/getting-started/cheat-sheet.md`, `apps/docs/getting-started/first-solid.md`, `apps/docs/reference/errors.md`

- [ ] **Step 1: README**

- Install: `npm install brepjs brepjs-opencascade` → `npm install brepjs occt-wasm`.
- Status (line 55): "The OpenCascade kernel is the current default." → "occt-wasm (OpenCascade compiled to WebAssembly) is the default kernel. brepkit, a Rust-based kernel, is in active development as a faster replacement."
- Manual-setup block (lines 70-74): replace the `import opencascade from 'brepjs-opencascade'; initFromOC(oc)` example with:

```typescript
// Or manual setup
import { OcctKernel } from 'occt-wasm';
import { registerKernel, OcctWasmAdapter } from 'brepjs';
const kernel = await OcctKernel.init();
registerKernel('occt-wasm', OcctWasmAdapter.fromKernel(kernel));
```

- [ ] **Step 2: Canonical site pages**

For each `apps/docs/**` file above: change install commands to `occt-wasm`, change "default kernel is OpenCascade" prose to occt-wasm, and replace `await opencascade(); initFromOC(oc)` recipes (cheat-sheet ~line 16, errors.md 38/257, first-solid ~203) with the `OcctKernel.init()` + `registerKernel` recipe. Update the `apps/docs/index.md` landing card (~line 31) "OpenCascade WASM ships today" to name occt-wasm as default. In `advanced/workers.md`, update the worker init example to occt-wasm (it ships a `./worker` comlink export).

- [ ] **Step 3: Verify docs build/link checks**

Run: `npm run validate 2>&1 | tail -20`
Expected: format + lint pass. (If the docs site has a link check script, run it.)

- [ ] **Step 4: Commit**

```bash
git add README.md apps/docs
git commit -m "docs: present occt-wasm as the default kernel (README + chapter site)"
```

### Task C2: Legacy docs + llms + context7 + src/kernel README

**Files:**

- Modify: `docs/getting-started.md`, `docs/cheat-sheet.md`, `docs/architecture.md`, `docs/threejs-integration.md`, `docs/codebase-map.md`, `docs/decisions/0013-voxel-domain.md`, `docs/kernel-swap.md`
- Modify: `src/kernel/README.md`, `llms.txt`, `llms-full.txt`, `context7.json`

- [ ] **Step 1: Legacy `docs/**`\*\*

Same narrative swaps. Special attention to `docs/kernel-swap.md` — it contains claims that become **false**: line 5 "the default, most mature kernel" (occt), line 16 "occt-wasm requires manual registration", line 59 "Tries brepjs-opencascade first… occt-wasm is not auto-detected." Rewrite these to match the new `init()` (occt-wasm auto-detected first, then opencascade fallback). `docs/codebase-map.md` lines 30/32: keep `DefaultAdapter` description factual (it IS the opencascade adapter) but adjust any "default kernel" framing. `docs/decisions/0013` references the #1136 migration — update to past tense / "now default".

- [ ] **Step 2: llms + context7 + src/kernel README**

`llms.txt`/`llms-full.txt`: swap install + default-kernel narrative. `context7.json`: update the library description and the canonical install/init snippet strings to occt-wasm. `src/kernel/README.md`: default-kernel framing.

- [ ] **Step 3: Lint/format**

Run: `npm run format && npm run lint 2>&1 | tail -10`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add docs src/kernel/README.md llms.txt llms-full.txt context7.json
git commit -m "docs: occt-wasm default across legacy docs, llms, context7"
```

### Task C3: Regenerate the conformance + compatibility matrices

**Files:**

- Regenerate: `docs/kernel-conformance.md`
- Modify: `apps/docs/integration/compatibility.md`, `docs/compatibility.md`

- [ ] **Step 1: Regenerate the conformance matrix**

Run: `npm run conformance:generate`
This rebuilds `docs/kernel-conformance.md` from the corrected registry capability flags (Task A1). Verify the occt variable-fillet row and occt-wasm rows now reflect reality.

- [ ] **Step 2: Rebuild the compatibility matrices verified-accurate**

In `apps/docs/integration/compatibility.md` and `docs/compatibility.md`: mark occt-wasm as the default; correct the occt variable-fillet entry (it's a throwing stub); note constraintSketch is brepkit-only. Cross-check each capability row against the adapters before publishing.

- [ ] **Step 3: Verify no stale generated diff**

Run: `git diff --stat docs/kernel-conformance.md`
Expected: shows the regenerated content; confirm it's the generator output (don't hand-edit it).

- [ ] **Step 4: Commit**

```bash
git add docs/kernel-conformance.md apps/docs/integration/compatibility.md docs/compatibility.md
git commit -m "docs: regenerate conformance + rebuild compatibility matrix for occt-wasm default"
```

### Task C4: Agent skill getting-started

**Files:**

- Modify: `packages/brepjs-agent/skill/references/getting-started.md`, `.claude/skills/brepjs-cad/references/getting-started.md`

- [ ] **Step 1: Swap default-kernel narrative + install**

In both skill getting-started files, change install to `occt-wasm` and the init recipe to `OcctKernel.init()` + `registerKernel`. (The agent README install is handled in Phase D Task D4 alongside the viewer flip.)

- [ ] **Step 2: Lint/format + commit**

Run: `npm run format`

```bash
git add packages/brepjs-agent/skill .claude/skills/brepjs-cad
git commit -m "docs(agent): occt-wasm default in skill getting-started"
```

---

## Phase D — Playground + agent viewer runtime

> This is the load-bearing runtime change: a dep swap alone leaves the workers booting OCCT. occt-wasm ships `dist/occt-wasm.{js,wasm}` and `OcctKernel` (`occt-wasm` package). `OcctKernel.init({ wasm })` accepts a URL/string/ArrayBuffer for the binary and works in Web Workers (verified in the package types). brepjs re-exports `OcctWasmAdapter`.

### Task D1: Provision the occt-wasm binary in the playground build

**Files:**

- Modify: `apps/playground/vite.config.ts:20` (`WASM_FILES`) + the `opencascadeWasm()` plugin
- Modify: `apps/playground/src/lib/wasmConfig.ts:9` (`WASM_FILES`)
- Modify: `apps/playground/package.json` (dep: ensure `occt-wasm` present; `optimizeDeps`)

- [ ] **Step 1: Update both `WASM_FILES` constants**

There are TWO independent arrays. In `apps/playground/src/lib/wasmConfig.ts:9` and in `apps/playground/vite.config.ts:20`, change:

```ts
const WASM_FILES = ['occt-wasm.js', 'occt-wasm.wasm'];
```

- [ ] **Step 2: Repoint the copy plugin source**

In `apps/playground/vite.config.ts`, the `opencascadeWasm()` plugin resolves `wasmDir` from `packages/brepjs-opencascade/src`. Change the source resolution to occt-wasm's dist (resolve `occt-wasm/dist/occt-wasm.js` / `.wasm` via `node:path` + `import.meta.resolve` or `require.resolve('occt-wasm/dist/occt-wasm.wasm')`). The plugin should copy these into `public/wasm/` (or the build `out` dir) exactly as before. Rename the plugin to `occtWasm()` for clarity.

- [ ] **Step 3: Ensure dep + optimizeDeps**

Confirm `apps/playground/package.json` has `occt-wasm` as a dependency (add if missing, matching root version `^3.0.0`). Add `occt-wasm` to `optimizeDeps.exclude` if `brepjs-opencascade` was there; remove the old entry.

- [ ] **Step 4: Verify the binary is copied**

Run: `cd apps/playground && npm run build 2>&1 | tail -20`
Expected: build succeeds and `occt-wasm.wasm` lands in the output `wasm/` dir. (If the dynamic import of occt-wasm's glue fails to bundle, see Task D2 — the worker may import the glue directly rather than via `public/`.)

- [ ] **Step 5: Commit**

```bash
git add apps/playground/vite.config.ts apps/playground/src/lib/wasmConfig.ts apps/playground/package.json
git commit -m "build(playground): provision occt-wasm binary in place of opencascade"
```

### Task D2: Rewrite the playground worker to boot occt-wasm

**Files:**

- Modify: `apps/playground/src/workers/cad.worker.ts:63-96,140-170`

- [ ] **Step 1: Replace `loadWasmBuild()` + the init call**

Replace `loadWasmBuild()` and the `const oc = await loadWasmBuild(); brepjs = await import('brepjs'); brepjs.initFromOC(oc);` sequence in `handleInit()` with an occt-wasm boot. New `handleInit()` core:

```ts
const base = import.meta.env.BASE_URL;
const { OcctKernel } = await import('occt-wasm');
const kernel = await OcctKernel.init({ wasm: `${base}wasm/occt-wasm.wasm` });

post({ type: 'init-progress', stage: 'Loading brepjs...', progress: 0.7 });

brepjs = await import('brepjs');
brepjs.registerKernel('occt-wasm', brepjs.OcctWasmAdapter.fromKernel(kernel));
```

Delete the now-unused `loadWasmBuild` helper. Keep the cache-warming behavior if desired (occt-wasm's glue is bundled by Vite; only the `.wasm` is fetched from `wasm/`). Keep the rest of `handleInit()` (wrapper-URL build, progress posts, idempotency guard) unchanged.

- [ ] **Step 2: Typecheck the playground**

Run: `cd apps/playground && npx tsc --noEmit 2>&1 | tail -20`
Expected: PASS (`brepjs.OcctWasmAdapter` / `registerKernel` resolve via the ambient/types — regenerate types in D3 if missing).

- [ ] **Step 3: Build + worker smoke**

Run: `cd apps/playground && npm run build 2>&1 | tail -20`
Expected: build green. Then load the built site (or `npm run preview`) and confirm a simple model evaluates — the worker boots occt-wasm (check devtools: the `.wasm` fetched is `occt-wasm.wasm`, not `brepjs_single.wasm`).

- [ ] **Step 4: Commit**

```bash
git add apps/playground/src/workers/cad.worker.ts
git commit -m "feat(playground): boot occt-wasm kernel in the cad worker"
```

### Task D3: Regenerate playground ambient types

**Files:**

- Regenerate: `apps/playground/src/types/brepjs-ambient.d.ts`
- Possibly: `apps/playground/scripts/generate-ambient-types.ts`

- [ ] **Step 1: Regenerate**

Run: `cd apps/playground && npm run generate-types`
Expected: `brepjs-ambient.d.ts` regenerated. Do NOT hand-edit it.

- [ ] **Step 2: Confirm `OcctWasmAdapter`/`registerKernel` are surfaced**

If the worker references `brepjs.OcctWasmAdapter`/`registerKernel` and typecheck failed in D2, ensure the generator allowlist (`generate-ambient-types.ts`, around the `OpenCascadeInstance`/`OpenCascadeType` entries) includes the symbols the worker now uses, then regenerate.

- [ ] **Step 3: Typecheck + commit**

Run: `cd apps/playground && npx tsc --noEmit 2>&1 | tail -10`
Expected: PASS.

```bash
git add apps/playground/src/types/brepjs-ambient.d.ts apps/playground/scripts/generate-ambient-types.ts
git commit -m "build(playground): regenerate ambient types for occt-wasm"
```

### Task D4: Flip the agent viewer worker + README

**Files:**

- Modify: `packages/brepjs-agent/viewer/src/kernelWorker.ts:5,45-66`
- Modify: `packages/brepjs-agent/viewer/vite.config.ts` (wasm-copy plugin)
- Modify: `packages/brepjs-agent/README.md:21`

- [ ] **Step 1: Rewrite `bootKernel()`**

Replace the OCCT fetch/blob/initFromOC body (lines 46-65) with occt-wasm:

```ts
type BrepjsKernel = BrepjsForLoad & {
  registerKernel: (id: string, adapter: unknown) => void;
  OcctWasmAdapter: { fromKernel: (k: unknown) => unknown };
};

async function bootKernel(): Promise<BrepjsKernel> {
  const base = new URL(import.meta.env.BASE_URL, self.location.origin).href;
  const { OcctKernel } = await import('occt-wasm');
  const kernel = await OcctKernel.init({ wasm: `${base}wasm/occt-wasm.wasm` });
  const mod = (await import('brepjs')) as unknown as BrepjsKernel;
  mod.registerKernel('occt-wasm', mod.OcctWasmAdapter.fromKernel(kernel));
  return mod;
}
```

Update the `BrepjsKernel` type (line 5) accordingly (drop `initFromOC`, add `registerKernel`/`OcctWasmAdapter`).

- [ ] **Step 2: Repoint the viewer's wasm-copy plugin**

In `packages/brepjs-agent/viewer/vite.config.ts`, change the wasm-copy source from `brepjs_single.*` (brepjs-opencascade) to `occt-wasm/dist/occt-wasm.{js,wasm}`, copying into the viewer's `wasm/` output (same pattern as D1).

- [ ] **Step 3: Update the agent README install**

`packages/brepjs-agent/README.md:21`: `npm i -D brepjs-agent brepjs brepjs-opencascade` → `npm i -D brepjs-agent brepjs occt-wasm`.

- [ ] **Step 4: Build the viewer + smoke**

Run: `cd packages/brepjs-agent/viewer && npm run build 2>&1 | tail -20`
Expected: green; `occt-wasm.wasm` copied. Smoke: load a STEP/GLB in the viewer and confirm it renders (worker boots occt-wasm).

- [ ] **Step 5: Commit**

```bash
git add packages/brepjs-agent/viewer packages/brepjs-agent/README.md
git commit -m "feat(agent): boot occt-wasm in the viewer worker + install docs"
```

---

## Phase E — Full verification & PR

### Task E1: Repo-wide validation

- [ ] **Step 1: Full validate**

Run: `npm run validate 2>&1 | tail -30`
Expected: typecheck + lint + boundaries + format + changed tests all pass.

- [ ] **Step 2: Full default suite + coverage**

Run: `npm run test:ci 2>&1 | tail -15` then `npm run test:full 2>&1 | tail -15`
Expected: 0 fail; coverage meets the new occt-wasm floor.

- [ ] **Step 3: Fallback path opt-in run**

Run: `npm run test:occt 2>&1 | tail -15`
Expected: occt project still green (fallback kernel not broken).

- [ ] **Step 4: Residual brepjs-opencascade narrative scan**

Run:

```bash
grep -rln "brepjs-opencascade\|initFromOC\|OpenCascade" . \
  | grep -vE "node_modules|/dist/|/build/|package-lock|packages/brepjs-opencascade/|benchmarks/|\.github/|release-please|knip\.config|scripts/(ensure-wasm|publish-all)|vite\.config\.ts$|package\.json"
```

Review each remaining hit: it must be a legitimate npm-package/type-name reference (`OpenCascadeInstance`/`OpenCascadeType`, peer dep) — not narrative. Fix any stray narrative.

- [ ] **Step 5: Build everything**

Run: `npm run build && cd apps/playground && npm run build && cd ../../packages/brepjs-agent/viewer && npm run build`
Expected: all green.

### Task E2: Open the PR

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/occt-wasm-default
```

- [ ] **Step 2: Open the PR (no automerge)**

```bash
gh pr create --base main --title "feat(kernel): make occt-wasm the default kernel" --body "$(cat <<'EOF'
Closes #1136.

Flips the default kernel from brepjs-opencascade (`occt`) to `occt-wasm` across
the library, test gate, docs, playground, and agent viewer. brepjs-opencascade
remains a supported, installable kernel and a silent runtime fallback.

## Verified
- occt-wasm conformance suite green (3687 pass / 0 fail).
- No real capability regression: occt's filletVariable is a throwing stub;
  occt-wasm implements it. constraintSketch is brepkit-only on both OCCT kernels.
- Playground + agent viewer now boot occt-wasm at runtime (not just config).

## Changes
- init()/quick: occt-wasm-first with opencascade fallback (dynamic imports).
- Test gate flipped to occt-wasm; coverage re-floored on the occt-wasm denominator;
  occt kept as opt-in `test:occt`.
- Registry capability flags corrected; conformance + compatibility matrices rebuilt.
- Full docs/site sweep — brepjs-opencascade now only appears as the npm package.

Spec: docs/superpowers/specs/2026-06-02-occt-wasm-default-design.md
EOF
)"
```

- [ ] **Step 3: Comment the verified findings on the issue**

```bash
gh issue comment 1136 --body "Implemented on \`feat/occt-wasm-default\` (PR linked). Re-verified before the flip: occt-wasm conformance suite is green (3687 pass / 0 fail), and the gap audit's \"loses constraintSketch/variableFillet\" concern does not hold at runtime — occt's filletVariable is a throwing brepkit-only stub while occt-wasm implements it, and constraintSketch is brepkit-only on both OCCT kernels. Playground + agent viewer workers were migrated too (they previously hardcoded the OCCT build)."
```

- [ ] **Step 4: Report PR URL to the user. Do NOT merge (no automerge).**

---

## Self-Review notes

- **Spec coverage:** Phases A-E map 1:1 to spec Phases A-E. Every spec `[review]` item has a task (SSOT field A1; dynamic-import fallback A3; the 5 `--project` flags B1; coverage denominator B3; excluded-files audit B4; missed docs C1/C2; generated matrices C3; duplicate `WASM_FILES` D1; ambient regen D3; agent viewer D4).
- **Measured values:** B3 thresholds are intentionally resolved at execution (measure-then-floor) — not a placeholder; the step specifies exactly how to derive them.
- **Type consistency:** `defaultKernelId()` (A1) used in B1/B3; `OcctWasmAdapter.fromKernel()` used in A2/A3/B2/D2/D4; `registerKernel('occt-wasm', …)` consistent across runtime + workers.
- **Known execution-time discovery:** D1/D2 Vite bundling of occt-wasm's glue + 21MB `.wasm` may need iteration (noted inline); the verification gates (worker fetches `occt-wasm.wasm`) catch a wrong-kernel result.
