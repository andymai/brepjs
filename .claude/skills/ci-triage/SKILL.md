---
name: ci-triage
description: This skill should be used when a brepjs GitHub Actions job is red or behaving oddly on github.com (a remote CI run, not a local pre-commit/pre-push hook) — "CI failed", "ci-pass is failing", "npm ci failed with EUSAGE/ETARGET in CI", "test shard timed out", "function-lookup.md diff failed in the build job", "check:patterns fails in CI on code I didn't touch", "npm publish workflow failed", "docs deploy didn't run", "playground smoke is red", "OSV scan is red", "release PR won't auto-merge", or npm ci fails in a CI run after a Dependabot bump on a workspace "*" dependency. Maps each CI job's known failure modes to causes and fixes. For a hook blocking a local commit, use quality-gates or git-pr-workflow instead.
---

# CI failure triage

Diagnose a red or stuck brepjs GitHub Actions run. Triage in two moves: first classify **which workflow and job** failed and **on what event** (PR vs push-to-main vs manual dispatch vs deployment); then match the symptom to the table below.

Most failure modes are documented in inline comments in the workflow files themselves — cite line refs (e.g. `.github/workflows/ci.yml:244-250`) rather than re-deriving. This skill is the index and the recovery recipes.

## Job map — what runs, when

The single required PR check is **`ci-pass`** (`ci.yml:431-459`). It `needs` every gate job and fails if any result is `failure` or `cancelled` (a `skipped` result passes). Its needs-list: `changes, typecheck, lint, quality, build, playground-build, packages-viewer, packages-verify, packages-sheetmetal, packages-bim, voxel-wasm-rust, test, size, benchmark`. Deliberately **not** in the list: `coverage`.

The `changes` job (`ci.yml:18-67`) path-filters into three outputs — `code`, `playground`, `voxel` — that gate the rest. Branches named `release-please--*` skip the filter entirely (`ci.yml:29-36`): release PRs run no code jobs (they touch only CHANGELOG/version/manifest).

| Job                                        | Command(s)                                                                                                   | Event / gate                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| `typecheck`                                | `npm run typecheck`                                                                                          | PR+push, `code`                    |
| `lint`                                     | `npm run lint` + `format:check`                                                                              | PR+push, `code`                    |
| `quality`                                  | `check:boundaries` + `check:patterns` + `knip`                                                               | PR+push, `code`                    |
| `build`                                    | `npm run build` + `docs:api` + function-lookup staleness gate                                                | PR+push, `code`                    |
| `playground-build`                         | build root + brepjs-bim + brepjs-sheetmetal + apps/playground (mirrors Vercel)                               | PR+push, `playground`              |
| `packages-viewer` / `-sheetmetal` / `-bim` | typecheck+lint+test+build per workspace (root `build` first for `-sheetmetal`/`-bim`; viewer builds no root) | PR+push, `code`                    |
| `packages-verify` (brepjs-cad)             | build root+viewer+cad, then `eval`, `smoke`, `smoke:standalone`                                              | PR+push, `code`                    |
| `voxel-wasm-rust`                          | `cargo test` + `cargo clippy -D warnings`                                                                    | PR+push, `voxel` only              |
| `test`                                     | `test:ci --shard=N/4`, matrix `[1,2,3,4]`                                                                    | PR+push, `code`                    |
| `coverage`                                 | `test:full` (maxWorkers=2, timeout 180s)                                                                     | **push-only**, `continue-on-error` |
| `size`                                     | size-limit-action                                                                                            | **PR-only**                        |
| `benchmark`                                | compare vs main, 25% regression threshold                                                                    | **PR-only**                        |

Consequence: a **PR** failure can never come from `coverage` (push-only); a **main-only** failure can never come from `size`/`benchmark` (PR-only).

Concurrency: `ci-${{ github.ref }}`, `cancel-in-progress` on non-main refs only (`ci.yml:10-12`).

## Symptom → cause → fix

Ordered roughly by frequency.

### `npm ci` fails with EUSAGE in every job's setup step

Lock file out of sync with `package.json` ("lock file does not satisfy"). Classic trigger: a Dependabot group bump silently drops the two top-level `@emnapi/*` peer-dep entries (`package-lock.json` `node_modules/@emnapi/core` + `node_modules/@emnapi/runtime`, ~lines 1180-1201) that satisfy `@napi-rs/wasm-runtime`'s `peerDependencies` (~lines 2285-2286). **Fix: surgically restore the dropped entries — never regenerate the lockfile from scratch.** Run `--package-lock-only` from main to reproduce the correct shape. See the `git-pr-workflow` and `companion-packages` skills for lockfile-surgery discipline.

### `npm ci` fails with ETARGET / 404 on an internal package (in a CI run)

An internal workspace package is pinned to a version not yet on npm. Two causes:

1. **release-please re-pin**: the node-workspace plugin repins a leaf's `brepjs` dep to a _pending_ (unmerged) root release version. This is why leaf release PRs are held until root merges+publishes (see auto-merge below).
2. **0.x caret exclusion**: a `^0.<older>` range excludes the next `0.(x+1)` minor, so an internal bump 404s any consumer still on the caret.

**Fix: use an open floor range, not a pin.** Main already does this — `packages/brepjs-cad/package.json:60` (`"brepjs": ">=18.117.1"`) and `packages/brepjs-voxel/package.json:24` (`"brepjs-voxel-wasm": ">=0.2.0"`). Full mechanics in the `release-publishing` skill.

Note: for **internal workspace** devDeps the `"*"` wildcard is intentional (e.g. `brepjs-cad`'s `"brepjs-viewer": "*"`, `package.json:81`) — pinning it to a concrete version is what repeatedly broke `npm ci` when the pin outran what was published. A Dependabot alert on such a `"*"` spec is a false positive: raise the floor (`>=x.y.z`) if it must be cleared, don't pin it or bump the lockfile.

### `build` job fails on `git diff --exit-code docs/function-lookup.md`

A `*Fns.ts` change added/renamed an exported function but `docs/function-lookup.md` wasn't regenerated (the gate at `ci.yml:112-117` runs `docs:generate-lookup` → `prettier --write` → diff; pre-commit only _reminds_, so it's easy to miss locally). **Fix: regenerate + prettier-align + commit the file** — full recipe in the `adding-operations` skill.

### `quality` job fails `check:patterns` on code the PR didn't touch

An unbaselined pattern violation reached main and now fails the `quality` job on _every_ open PR at once. **Fix: land a tiny baseline-bump PR first**, then rebase the others. Mechanism and baseline mechanics live in the `quality-gates` skill.

### `test` shard times out or stalls

OCCT WASM linear memory grows monotonically across tests; a long run over-commits the 16 GB runner into swap and a fork stalls past the 90s per-test timeout (`#1102`, rationale at `ci.yml:244-250`). The 4-way shard exists precisely so each fork exits before accumulation hits that threshold. **Do not "fix" by widening the timeout.** Check whether one shard is genuinely slower (real leak / new heavy test) or just an infra blip — re-run the single shard. Coverage can't shard (vitest `--merge-reports` can't recombine v8 coverage here), which is why the `coverage` job runs single-runner with a raised timeout. Test-authoring details in the `writing-tests` skill.

### `packages-verify` fails on `smoke` or `smoke:standalone`

`smoke` runs the **built** brepjs-cad CLI under plain node (catches bin/TS-load breaks that tsx/vitest hide in-repo). `smoke:standalone` packs the tarball into a clean project with **no brepjs present** (catches bundling / fallback-resolve breaks invisible in-repo). A green in-repo test with a red standalone smoke means a packaging or resolution regression, not a logic bug. See the `companion-packages` skill.

### `playground-build` fails but the library builds fine

Type-resolution or bundler regression scoped to `apps/playground` (this job mirrors what Vercel runs). Historical example: a duplicate `@types/three` install broke `tsc -b` only inside the playground (`#963`, `ci.yml:119-137`). See the `playground-examples` skill.

### `npm publish` failed

Publishes are OIDC-bound to the exact workflow **filename** — inlining `npm publish` elsewhere fails auth. Never re-run the failed push-event job; **re-dispatch the same workflow**. Recovery recipes:

- **Root brepjs**: `gh workflow run release-please.yml -f republish=true` (input at `release-please.yml:6-12`; publish gate at `:146-149`).
- **A satellite** (cad/bim/sheetmetal/viewer/opencascade): `gh workflow run publish-<pkg>.yml -f dry_run=false --ref <release-tag>` — `dry_run` defaults to **true**, and dispatch against the immutable tag, not main.

Full recipe set and the OIDC-binding rationale: the `release-publishing` skill.

### `prepack` fails: "Too many files" or ".d.ts.map"

`scripts/validate-pack.sh` (root `prepack` hook, `package.json:216`) caps the packed tarball at `MAX_FILES=500` and rejects any `.d.ts.map` sidecars (count must be 0). It fires during **pack/publish**, not PR CI. Fix "too many files" by trimming the published set; fix `.d.ts.map` by keeping `declarationMap` off in `vite.config.ts`.

### "Deploy API Docs" didn't run after a main merge

`docs.yml` triggers on `workflow_run` of **CI completing on main with `conclusion == 'success'`**. A red CI on main blocks the docs deploy. This is exactly why `coverage` is `continue-on-error` (`ci.yml:260-266`): an informational threshold dip must not flip CI's conclusion to failure and starve the docs gate. Emergency redeploy: `gh workflow run docs.yml` (`workflow_dispatch` bypasses the CI gate, main-only).

### "Playground Smoke" is red

`playground-smoke.yml` runs on `deployment_status` from Vercel, loads the deployed playground headless, and requires the WASM kernel to reach `Ready` within 60s. A red here is a **CSP / COEP / COOP / asset-path** class regression that blocks engine init — not a build-class failure (the static build already passed).

### "OSV Scan" is red

`osv-scan.yml` scans `package-lock.json` for known-vulnerable versions. It splits by event: **`scan-pr` ("OSV Scan (report-only)")** on pull requests never fails the merge (findings surface in the Security tab only), while **`scan-main` ("OSV Scan (blocking)")** on push-to-main and the weekly cron fails closed. So a red OSV check on a PR is informational; a red one on main is a real gate. Fix a genuine finding by bumping the vulnerable transitive dep (lockfile surgery, see `git-pr-workflow`).

### Dependabot flags a security alert on a workspace `"*"` dependency

False positive. An internal devDep pinned to `"*"` (e.g. `brepjs-cad`'s `"brepjs-viewer": "*"`) is intentional — pinning it to a concrete version is what repeatedly broke `npm ci`. **Fix: raise the spec floor to `>=x.y.z` if the alert must be cleared — do not pin the spec or bump the lockfile.** Mechanism in the `companion-packages` skill.

### A release PR won't auto-merge

Expected during a release train: while the **root** brepjs release PR (branch `release-please--branches--main--components--brepjs`) is open, every **leaf** PR (cad/bim/sheetmetal) is held; leaves auto-merge only after root merges+publishes. `brepjs-opencascade` is held **permanently** (manual, expensive WASM build). Mechanism at `release-please.yml:57-133`; deep dive in the `release-publishing` skill.

## Looks like a failure but isn't

- **`coverage` red on main**: informational only (`continue-on-error`, push-only, out of `ci-pass`). Not a gate.
- **benchmark "main install failed" warning**: `continue-on-error` on the main-baseline install so a broken main can't deadlock the PR that fixes it (`ci.yml:323-330`). The PR's own benchmark still runs; only the comparison is skipped.
- **benchmark shows ±9-15% noise**: shared runners vary run-to-run; the threshold is 25% for that reason (`ci.yml:366`).
- **held release PRs**: opencascade always held; leaves held while root is open. See above.
- **`skipped` jobs**: a skipped `needs` result passes `ci-pass` — only `failure`/`cancelled` fail it.

## Blind spots — things CI never runs

- **`alwaysExclude` tests never execute in any CI project** (`vitest.config.ts`): `tests/brepkit-adapter.test.ts`, `tests/brepkit-validation.test.ts`, `tests/kernel-agreement.test.ts`, `tests/io-stress.test.ts`, plus `benchmarks/`, the cad/viewer packages (own jobs), `apps/`, and worktree dirs. They rot silently — run them locally when touching that code.
- **The brepkit kernel is not a PR gate**: the default gate runs occt-wasm only. Run `npm run test:brepkit` locally for brepkit-affecting changes (see `kernel-abstraction`).
- **apps/playground is outside root lint + vitest**: only `tsc -b` (via `playground-build`) gates it in CI. See `playground-examples`.

## Stale docs — do not inherit

`CONTRIBUTING.md` (~lines 222-235) lists coverage thresholds as **83/73/64/73** and claims "CI runs the full test suite with coverage enforcement." Both are wrong. Actual thresholds (`vitest.config.ts`): **statements 85, branches 71, functions 91, lines 88**. Coverage is main-only, informational, and `continue-on-error` — never a PR gate. Trust `vitest.config.ts`, not `CONTRIBUTING.md`.

## Additional resources

Sibling skills (each fact lives in exactly one — link, don't duplicate):

- `release-publishing` — release-please serialization (root-before-leaves), OIDC filename binding, per-package dispatch recipes, republish recovery, concurrency/label races.
- `quality-gates` — check:patterns / knip / boundary rule details and baseline mechanics.
- `git-pr-workflow` — hooks, conventional commits, worktrees, merge / auto-merge, lockfile surgery.
- `companion-packages` — workspace deps, ETARGET / build order, workspace `"*"` specs.
- `writing-tests` — test skeleton, shard/coverage authoring, kernel divergence skips.
- `adding-operations` — the function-lookup gate and export surfaces.
- `playground-examples` — the three playground gates (types, geometry, thumbnail).
