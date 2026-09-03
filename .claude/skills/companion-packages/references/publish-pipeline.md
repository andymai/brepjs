# Release topology

How the monorepo's package layout shapes what release-please manages and how the publish workflows build each package. This is the topology view only — the operator playbook (auto-merge serialization, OIDC dispatch, `dry_run`, recovery, and the known-failure table) lives in the **release-publishing** skill; do not duplicate it here.

## What release-please manages

Eight components, each with its own release PR (`separate-pull-requests: true`) and no release plugins (`plugins: []`):

| Component            | Path                          | Published by                                                                                                             |
| -------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `brepjs` (root)      | `.`                           | Inline `npm publish --provenance` in `release-please.yml`                                                                |
| `brepjs-opencascade` | `packages/brepjs-opencascade` | Manual `publish-opencascade.yml` dispatch only (expensive WASM build)                                                    |
| `brepjs-voxel-wasm`  | `packages/brepjs-voxel-wasm`  | **Nobody** — versioned and tagged (with a `Cargo.toml` extra-file bump) but no publish workflow exists; it is not on npm |
| `brepjs-cad`         | `packages/brepjs-cad`         | Dispatched `publish-brepjs-cad.yml`                                                                                      |
| `brepjs-bim`         | `packages/brepjs-bim`         | Dispatched `publish-brepjs-bim.yml`                                                                                      |
| `brepjs-families`    | `packages/brepjs-families`    | Dispatched `publish-brepjs-families.yml` (its release PR merges before bim's)                                            |
| `brepjs-sheetmetal`  | `packages/brepjs-sheetmetal`  | Dispatched `publish-brepjs-sheetmetal.yml`                                                                               |
| `create-brepjs`      | `packages/create-brepjs`      | Dispatched `publish-create-brepjs.yml`                                                                                   |

## What is deliberately unmanaged

- `brepjs-viewer`: versioned by hand and published via manual `publish-brepjs-viewer.yml` dispatch, because automated version re-pinning of brepjs-cad's build-time `brepjs-viewer` devDependency repeatedly broke `npm ci`. Rationale comment: bottom of `release-please.yml`.
- `brepjs-voxel` — an unpublished workspace consumer, so there is nothing to release.

## The `exclude-paths` nuance

`apps` and every `packages/*` workspace are listed in the root component's `exclude-paths`, so a commit that touches only satellite paths does not bump the root library version. A managed satellite such as `packages/brepjs-bim` therefore appears in _both_ the managed list (its own component) and the root's `exclude-paths`: bim-only commits release bim alone, and a satellite release no longer drags a root `brepjs` release with it. Root still attributes every other repo path (`src/`, `docs/`, `scripts/`, `.github/`), so a `!` on a docs or tooling commit majors root. A new `packages/*` directory must be added to the root `exclude-paths` list, or its commits ride the root version again.

## Build prerequisites inside publish workflows

The publish workflows re-encode the same build order the CI `packages-*` jobs use, because each package resolves its dependencies through built `dist/`:

- `publish-brepjs-viewer.yml` runs `npm ci --ignore-scripts` — viewer needs no OpenCascade WASM, and skipping the root `prepare` (husky + `scripts/ensure-wasm.sh`) makes the job faster and network-independent.
- `publish-brepjs-cad.yml` needs the WASM: it re-runs `bash scripts/ensure-wasm.sh` explicitly with a 3-attempt retry loop, then builds root → viewer → cad in that order (the viewer worker imports `brepjs`; cad bundles `brepjs-viewer`).
- `publish-brepjs-bim.yml` and `publish-brepjs-sheetmetal.yml` build root `brepjs` first, because their `vite-plugin-dts` step needs root's emitted types.

## Operating the pipeline

For the release _mechanics_ — how auto-merge holds leaves until root, why OIDC binds to workflow filenames, `dry_run` defaults, recovery routes, and the known-failure table — see the **release-publishing** skill.
