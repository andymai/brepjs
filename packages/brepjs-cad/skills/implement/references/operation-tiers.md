# Operation reliability tiers (canonical)

Which brepjs operations succeed first-try vs. need iteration. This is the single source of truth for
operation selection — the `brepjs:design` skill links here rather than holding a second copy.

## Reliable first-try — prefer these

- **Primitives** — `box`, `cylinder`, `cone`, `sphere`, `torus`.
- **Booleans** — `fuse`, `cut`, `intersect`.
- **`compound`** — group many bodies into an assembly with no boolean cost; each body stays distinct.
- **2D sketch → `extrude`**.
- **`fillet`** — with a selected edge list (not "every edge").
- **`shell` / `offset`**.
- **Transforms** — `translate`, `rotate`, `mirror`, `circularPattern`, `rectangularPattern`.

## Advanced — verify carefully, expect iteration

`sweep`, `loft`, `revolve`, multi-section, welded assemblies (`fuseAll`), text. These fail more
often (degenerate profiles, self-intersection). Lean on the report and take small steps.

## The fragile exception

**`chamfer`** fails far more often than `fillet` — `CHAMFER_FAILED` is common even with a correct
edge list (small/adjacent faces, edges meeting other features). Prefer `fillet`, model the bevel
additively (a `cut` with an angled tool), or drop it. Re-running the same chamfer rarely helps.

## Assemblies (furniture, kits, many parts)

Reach for `compound([...])`, not `fuseAll`: faster, and each part stays distinct. Only `fuseAll`
when you truly need one watertight solid (and use `{ unsafe: true }` over `Shape3D[]`). Color the
GLB preview with `export const materials`. See `booleans.md`.

## Mechanisms (anything that moves — hinge, slider, gear, crank, linkage)

A part-by-part valid assembly can still **jam or not move**, and the kernel won't catch it. The
build sequence must include a validation step: sweep the drive parameter (crank angle, etc.) and
assert parts never interpenetrate (`intersect` volume ≈ 0) AND the driven element travels its
intended distance. Don't claim a mechanism works from a single rendered pose. See
`assemblies-motion.md`.
