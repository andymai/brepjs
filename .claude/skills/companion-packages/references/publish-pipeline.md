# Release topology

How the monorepo's package layout shapes what release-please manages and how the publish workflows build each package. This is the topology view only — the operator playbook (auto-merge serialization, OIDC dispatch, `dry_run`, recovery, and the known-failure table) lives in the **release-publishing** skill; do not duplicate it here.

## What release-please manages

Six components, each with its own release PR (`separate-pull-requests: true`) and the `node-workspace` plugin:

| Component            | Path                          | Published by                                                                                                             |
| -------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `brepjs` (root)      | `.`                           | Inline `npm publish --provenance` in `release-please.yml`                                                                |
| `brepjs-opencascade` | `packages/brepjs-opencascade` | Manual `publish-opencascade.yml` dispatch only (expensive WASM build)                                                    |
| `brepjs-voxel-wasm`  | `packages/brepjs-voxel-wasm`  | **Nobody** — versioned and tagged (with a `Cargo.toml` extra-file bump) but no publish workflow exists; it is not on npm |
| `brepjs-cad`         | `packages/brepjs-cad`         | Dispatched `publish-brepjs-cad.yml`                                                                                      |
| `brepjs-bim`         | `packages/brepjs-bim`         | Dispatched `publish-brepjs-bim.yml`                                                                                      |
| `brepjs-sheetmetal`  | `packages/brepjs-sheetmetal`  | Dispatched `publish-brepjs-sheetmetal.yml`                                                                               |

## What is deliberately unmanaged

- `brepjs-viewer` — the `node-workspace` plugin kept re-pinning brepjs-cad's build-time `brepjs-viewer` devDependency to viewer's pending, unpublished version on every release, repeatedly breaking `npm ci`. Viewer is versioned by hand and published via manual `publish-brepjs-viewer.yml` dispatch. Rationale comment: bottom of `release-please.yml`.
- `brepjs-voxel` — an unpublished workspace consumer, so there is nothing to release.

## The `exclude-paths` nuance

`brepjs-voxel`, `packages/brepjs-cad`, `packages/brepjs-viewer`, and `apps` are listed in the root component's `exclude-paths` so root commits touching them do not bump the root library version. Note `packages/brepjs-cad` appears in _both_ the managed list (its own component) and the root's `exclude-paths` (so cad-only commits do not bump root). Adding a new managed package that root does not import means adding it to `exclude-paths` too.

## Build prerequisites inside publish workflows

The publish workflows re-encode the same build order the CI `packages-*` jobs use, because each package resolves its dependencies through built `dist/`:

- `publish-brepjs-viewer.yml` runs `npm ci --ignore-scripts` — viewer needs no OpenCascade WASM, and skipping the root `prepare` (husky + `scripts/ensure-wasm.sh`) makes the job faster and network-independent.
- `publish-brepjs-cad.yml` needs the WASM: it re-runs `bash scripts/ensure-wasm.sh` explicitly with a 3-attempt retry loop, then builds root → viewer → cad in that order (the viewer worker imports `brepjs`; cad bundles `brepjs-viewer`).
- `publish-brepjs-bim.yml` and `publish-brepjs-sheetmetal.yml` build root `brepjs` first, because their `vite-plugin-dts` step needs root's emitted types.

## Operating the pipeline

For the release _mechanics_ — how auto-merge holds leaves until root, why OIDC binds to workflow filenames, `dry_run` defaults, recovery routes, and the known-failure table — see the **release-publishing** skill.
