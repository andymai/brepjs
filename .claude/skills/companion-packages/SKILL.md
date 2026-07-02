---
name: companion-packages
description: This skill should be used when orienting in the brepjs monorepo's packages/ and apps/ directories — answering "what is brepjs-viewer / brepjs-cad / brepjs-voxel", "is package X published", "which workspace do I edit", "why does npm ci fail with ETARGET on a workspace version-range", "playground shows stale behavior from brepjs-bim/sheetmetal", "in what order do I build the packages", "Dependabot flags a workspace `*` dependency", "add a new workspace package", or deciding how a change in one package ripples into its consumers.
---

# Monorepo companion packages

The root `package.json` `workspaces` field is the source of truth for the monorepo layout: 9 packages under `packages/` plus `apps/playground` and `apps/docs`. The `## Packages` list in `CLAUDE.md` is a curated subset — when it disagrees with the manifests, trust the manifests.

## Package map

| Workspace                     | Purpose                                                          | npm status                                                                                           |
| ----------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `brepjs` (root)               | Core CAD library                                                 | Published; auto-released via release-please                                                          |
| `packages/brepjs-opencascade` | Custom OpenCascade WASM build (fallback kernel)                  | Published; **manual publish only** (`publish-opencascade.yml` — expensive WASM build)                |
| `packages/brepjs-bim`         | IFC4 parametric building elements + IFC import/export            | Published, experimental; auto-released                                                               |
| `packages/brepjs-sheetmetal`  | Flange authoring, fold/unfold flat patterns, DXF/STEP            | Published, experimental; auto-released                                                               |
| `packages/brepjs-cad`         | Agent skill pipeline + `brep`/`brep-mcp` CLI bins + WASM viewer  | Published; auto-released                                                                             |
| `packages/brepjs-viewer`      | Shared React/R3F renderer (playground + brepjs-cad)              | Published; **manual publish, deliberately unmanaged by release-please**                              |
| `packages/brepjs-manifold`    | Manifold mesh/CSG preview kernel adapter                         | Unpublished, source-shipped (`exports` → `./src/index.ts`, no build)                                 |
| `packages/brepjs-voxel-wasm`  | Rust→WASM voxel/SDF engine (`wasm-pack` build, committed `pkg/`) | Versioned/tagged by release-please but **no publish workflow — not on npm**                          |
| `packages/brepjs-voxel`       | TS loader for brepjs-voxel-wasm                                  | Unpublished, source-shipped                                                                          |
| `packages/brepjs-vscode`      | VS Code extension: live 3D preview for `.brep.ts`                | `private: true` — the only `packages/` workspace that is private (not published, not source-shipped) |
| `apps/playground`             | Interactive docs playground (Vercel)                             | `private: true`                                                                                      |
| `apps/docs`                   | VitePress docs site                                              | `private: true`                                                                                      |

Three tiers, and the rules differ per tier:

1. **Published satellites** (opencascade, bim, sheetmetal, cad, viewer): consumers may resolve them from the npm registry, so their manifests must always describe an installable package.
2. **Source-shipped internals** (manifold, voxel, voxel-wasm): resolved only through workspace symlinks; manifold and voxel have no build step at all — editing their `src/` is immediately live for consumers.
3. **Private** (vscode, playground, docs): never published; playground and docs deploy via Vercel/Pages instead.

READMEs exist only for bim, sheetmetal, cad, and viewer — point users there for per-package API detail rather than restating it.

## Workspace dependency rules

- **Satellites depend on `brepjs` as a floor-ranged peerDependency**: `"brepjs": ">=18.0.0"` in `packages/brepjs-bim/package.json` and `packages/brepjs-sheetmetal/package.json`. Exception: `brepjs-cad` takes brepjs as a real dependency (`">=18.117.1"`) because its CLI must run standalone.
- **Root brepjs's kernel packages are optional peers**: `brepjs-manifold`, `brepjs-opencascade`, `brepkit-wasm`, `occt-wasm` are all `optional: true` under `peerDependenciesMeta` in the root `package.json`. Never promote one to a hard dependency — consumers pick exactly one kernel.
- **Internal cross-references use `"*"`** (e.g. `"brepjs-viewer": "*"` in `apps/playground` and in brepjs-cad's devDependencies). npm workspaces symlink these locally. Gotcha: Dependabot scans each sub-manifest without a co-located lockfile, so an unconstrained `"*"` on an _external_ dev tool reads as permitting every vulnerable version. Fix by constraining a floor on the flagged spec (`"vite": "^8.0.0"`, `"vitest": "^4.0.0"` — see `packages/brepjs-viewer/package.json`), not by lockfile churn.
- **`brepjs-viewer` role differs per consumer**: runtime `dependency` of the playground; build-time `devDependency` of brepjs-cad (its viewer bundle inlines it — see the `packages-verify` comment in `.github/workflows/ci.yml`). Viewer declares its react/three/fiber/drei peers as floor ranges (`>=19`, `>=0.184`, etc.) compatible with the playground's versions, so npm dedups to one copy monorepo-wide; rationale in `packages/brepjs-viewer/README.md`.
- **npm overrides use nested-object syntax**: `"vitepress": { "vite": "6.4.3" }` in root `package.json` `overrides`, plus scoped-range keys like `"esbuild@<0.25.0": "^0.25.0"`. There is no pnpm-style `parent>dep` separator in npm.
- **Never regenerate `package-lock.json` from scratch.** For security floors, edit the spec then run `npm install --package-lock-only` (no re-resolution, no churn). Full regeneration has historically dropped required `@emnapi/*` peer entries and broken CI.
- **0.x caret hazard**: `brepjs-voxel` pins `"brepjs-voxel-wasm": ">=0.2.0"` as a plain range, not `^0.x` — a `^0.1.0` caret excludes `0.2.0`, and an internal 0.x bump once left consumers pointing at a version that was never published, 404-ing `npm ci` repo-wide. Use `>=` floors for unpublished internal 0.x packages.

## Build order

Workspace symlinks resolve _manifests_ instantly, but built packages resolve through their `dist/` — a stale or missing dist fails typecheck or, worse, silently runs old code.

Three ordered chains, all encoded in scripts (prefer running the script over hand-ordering):

1. **Playground** — `build:deps` in `apps/playground/package.json` builds brepjs-bim, brepjs-sheetmetal, and brepjs-viewer, and runs automatically as `predev`/`prebuild`. If playground behavior looks stale after editing a companion package, this chain (or a manual `npm run build --workspace=<pkg>`) is the fix.
2. **Full site** — root `build:site`: provision-fonts → root build → brepjs-bim → brepjs-sheetmetal → apps/playground → apps/docs → copy playground dist into the docs dist.
3. **brepjs-cad** — root `npm run build` → `npm run build --workspace=brepjs-viewer` → `npm run build --workspace=brepjs-cad`. The cad viewer worker imports `brepjs` and bundles `brepjs-viewer`, so both dists must exist first; CI's `packages-verify` job and `publish-brepjs-cad.yml` both follow this order.

**WASM bootstrap**: the OpenCascade runtime files (`brepjs_single.js`/`.wasm`) are gitignored. Root `prepare` runs `scripts/ensure-wasm.sh`, which downloads them from the published `brepjs-opencascade` npm package into `packages/brepjs-opencascade/src`, keyed by a `.wasm-version` marker. Corollary: `npm ci --ignore-scripts` skips the download — fine when WASM is not needed (`publish-brepjs-viewer.yml` does this deliberately), otherwise re-run `bash scripts/ensure-wasm.sh` manually (`publish-brepjs-cad.yml` does, with retries).

## Release and publish (summary)

The package topology that shapes the pipeline lives in [references/publish-pipeline.md](references/publish-pipeline.md); the operator mechanics live in the **release-publishing** skill. The shape:

- `release-please-config.json` manages 6 components: root, opencascade, voxel-wasm, cad, bim, sheetmetal — with the `node-workspace` plugin and separate PRs per component. Viewer and voxel are deliberately excluded.
- Leaf release PRs are **held until the root brepjs release merges** — merging a leaf first pins it to an unpublished brepjs version and breaks `npm ci` with ETARGET.
- npm OIDC trusted publishers are bound to specific workflow **filenames**, so release-please _dispatches_ each `publish-brepjs-*.yml` rather than inlining `npm publish`.
- Every `publish-*.yml` is `workflow_dispatch` with `dry_run` defaulting to **true** — a bare manual dispatch is a safe dry run; pass `dry_run=false` to actually publish.

See the **release-publishing** skill for the operator playbook on cutting and recovering releases; this skill covers only how the package topology shapes that pipeline.

## CI coverage per package

| Workspace                                         | CI gate (`.github/workflows/ci.yml`)                                                      |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| root                                              | typecheck/lint/boundaries/patterns + 4-way sharded tests                                  |
| brepjs-viewer                                     | `packages-viewer`: typecheck, lint, test, build                                           |
| brepjs-cad                                        | `packages-verify`: typecheck, lint, test, build, eval, smoke, smoke:standalone            |
| brepjs-sheetmetal                                 | `packages-sheetmetal`: typecheck, lint, test, build                                       |
| brepjs-bim                                        | `packages-bim`: typecheck, lint, test, build                                              |
| brepjs-voxel-wasm                                 | `voxel-wasm-rust`: cargo test + clippy (path-filtered on `packages/brepjs-voxel-wasm/**`) |
| apps/playground                                   | `playground-build` (path-filtered; mirrors the Vercel build)                              |
| brepjs-vscode, brepjs-manifold, brepjs-voxel (TS) | **no CI job** — changes here are ungated; run their checks manually                       |

Two consequences worth internalizing: root `npm run validate` does **not** cover satellites (run `npm run <script> --workspace=<name>` directly when touching one), and the ungated packages rot silently — verify manually before relying on them.

## Symptom → cause → fix

| Symptom                                                               | Cause                                                                                                | Fix                                                                                                                   |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `npm ci`/Vercel fails with ETARGET on a `brepjs` or workspace version | A manifest pins a version not yet on npm (leaf merged before root, or 0.x caret on an internal bump) | Merge/publish the root release first, or widen the internal range to a `>=` floor; see references/publish-pipeline.md |
| Playground ignores an edit in brepjs-bim/sheetmetal/viewer            | Playground worker runs the companion's built `dist`, which is stale                                  | `npm run build:deps` in `apps/playground` (automatic on `predev`/`prebuild`)                                          |
| brepjs-cad typecheck/build fails on missing `brepjs` or viewer types  | Root or viewer dist missing                                                                          | Build in order: root → viewer → cad                                                                                   |
| Kernel init fails locally with missing `brepjs_single.js`             | Gitignored WASM never downloaded (`--ignore-scripts`, fresh clone glitch)                            | `bash scripts/ensure-wasm.sh`                                                                                         |
| Dependabot alert on a workspace `"*"` dev-dep                         | Sub-manifest scanned without lockfile context                                                        | Constrain a floor version on the spec; `npm install --package-lock-only`                                              |
| Manual publish dispatch "succeeded" but nothing on npm                | `dry_run` defaults to true                                                                           | Re-dispatch with `dry_run=false`                                                                                      |
| A satellite change passed root `validate` but fails CI                | Root validate does not run satellite gates                                                           | Run `typecheck`/`lint`/`test`/`build` with `--workspace=<name>` before pushing                                        |

## Adding a new workspace package — checklist

1. Add the directory to root `package.json` `workspaces`.
2. Decide the tier: published (needs build, `files`, exports to `dist/`, a `publish-<name>.yml` workflow, and an npm trusted-publisher entry bound to that filename), source-shipped (`exports` → `./src/index.ts`, no build — copy `packages/brepjs-voxel/package.json`), or `private: true`.
3. Dependency shape: `brepjs` as `">=18.0.0"` peerDependency for library satellites; internal siblings as `"*"`; floor-constrain any external dev tool that Dependabot might flag.
4. If published: add entries to `release-please-config.json` and `.release-please-manifest.json`, and a dispatch job in `release-please.yml` (mirror `publish-brepjs-bim`). If it must not auto-release (like viewer), leave it out of the config _and_ add it to the root component's `exclude-paths`.
5. Add a CI job in `ci.yml` modeled on `packages-bim` (build root first if the package imports `brepjs` through dist exports).
6. If the playground consumes it, append it to `build:deps` in `apps/playground/package.json`.
7. `npm install` from the repo root to register the workspace in the lockfile — never regenerate the lockfile wholesale.

## Additional resources

- [references/publish-pipeline.md](references/publish-pipeline.md) — release topology: which packages release-please manages/excludes and why, and the build order baked into each publish workflow (operator mechanics live in the **release-publishing** skill)
- `packages/brepjs-cad/README.md` — the two-rail distribution model: skills install via the repo's Claude plugin marketplace (`.claude-plugin/marketplace.json` → `packages/brepjs-cad`), runtime via `npm i -D brepjs-cad brepjs occt-wasm`
- `packages/brepjs-viewer/README.md` — exports and peer-pinning rationale
- Workflow comments in `.github/workflows/release-please.yml` and `ci.yml` — the best inline docs for release mechanics and per-package build-order rationale
- Sibling skills: `release-publishing` (operating the release pipeline), `ci-triage` (diagnosing red CI), `playground-examples` (adding examples inside `apps/playground`), `quality-gates` (root repo gates), `wasm-interop` (kernel WASM behavior beyond the bootstrap covered here)
