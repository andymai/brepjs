# Booleans

Combine solids with CSG. All three return `Result<T>`; unwrap or thread the result through to the default export.

| Function    | Signature         | Meaning              |
| ----------- | ----------------- | -------------------- |
| `fuse`      | `fuse(a, b)`      | union (a ∪ b)        |
| `cut`       | `cut(a, b)`       | subtract (a − b)     |
| `intersect` | `intersect(a, b)` | intersection (a ∩ b) |

```ts
// slotted.brep.ts
import { box, cylinder, cut } from 'brepjs';
export default () => {
  const body = box(40, 20, 10, { centered: true });
  const bore = cylinder(4, 12, { at: [0, 0, -6] });
  return cut(body, bore); // Result<Solid>, fine to return directly
};
```

## Many bodies: `fuseAll` vs `compound`

- `fuseAll(solids)` welds N solids into ONE watertight solid, but it runs N−1 boolean ops, so it is slow for large N and can time out STEP export on dozens of bodies. Use it only when you genuinely need a single manifold solid. Over mixed `Shape3D[]` (e.g. results of `cut`) the typed overload needs `fuseAll(shapes, { unsafe: true })`.
- `compound(shapes)` groups bodies into one shape with ZERO boolean cost (returns a `Compound`, not a `Result`). This is the right tool for **assemblies**: furniture, kits, anything that is naturally many distinct parts. STEP/GLB store the assembly tree natively, and each part stays addressable.

```ts
// assembly.brep.ts: 50 slats + posts + legs, no booleans
import { box, compound } from 'brepjs';
export default () => compound([...posts, ...slats, ...legs]); // Compound, fast
```

Rule of thumb: need one solid (for a downstream fillet/shell, or a watertight print)? `fuseAll`. Modeling a multi-part object? `compound`.

## Coloring an assembly (GLB preview)

A part may `export const materials` to paint its GLB preview (STEP stays geometry-only). It is a per-face selector run at export: return a material per face, or `undefined` for the default:

```ts
import type { MaterialFn } from 'brepjs';
export const materials: MaterialFn = ({ center }) =>
  center[2] < 168 // Z-up, mm
    ? { name: 'wood', baseColor: [0.78, 0.63, 0.41, 1], roughness: 0.5 }
    : { name: 'white', baseColor: [0.95, 0.94, 0.92, 1], roughness: 0.72 };
```

A plain `GltfMaterial` object (not a function) paints the whole part one color. The GLB is exported **Y-up** by default so it stands upright in standard glTF viewers; vertices stay Z-up to match the STEP.

Keep the color literal **inline** (as above) or type any color you factor into a `const` as `GltfMaterial`: a bare `const steel = { baseColor: [0.6, 0.6, 0.6, 1], … }` widens `baseColor` to `number[]` and fails its RGBA 4-tuple (`TS2322: number[] is not assignable to [number, number, number, number]`).

## Pitfalls

- **Always `unwrap()` the final returned shape.** A bare `Result` default export (`export default cut(...)`) passes `--check` — the verifier auto-unwraps it and reports an `Err` on failure — but on success it renders **nothing** in a viewer/mesh path. `verify` green is not enough; unwrap the last shape explicitly.
- Booleans on touching-but-not-overlapping solids can yield empty/invalid results; give operands a small overlap. (A `compound` does NOT need overlap; bodies stay distinct.)
- **A round body resting TANGENT on a flat plane is a degenerate single-line contact** — fusing a cylinder/sphere/ring whose lowest point exactly kisses a flat face (e.g. a C-ring sitting on a foot at the tangent z) returns a non-manifold solid (`VALIDATION_FAILED`). Sink the round body a hair into the flat (a real volumetric overlap, e.g. 1mm), don't seat it exactly tangent.
- **`fuse` of solids that only meet on a coplanar face/ring can silently return a loose `Compound`** — `ok:true`, but the bodies are NOT welded (the report's `manifold` flag / an undropped face count is the tell, not `shapeType`). For one watertight solid, give the operands a real overlap and use `fuseAll(shapes, { unsafe: true })` — but `{ unsafe: true }` skips the validity check and does NOT reliably weld even overlapping operands (it can leave an N-solid compound); confirm the weld with `getSolids(part).length === 1` (or `manifold`), and fold with pairwise `fuse()` over real overlaps when the weld must hold. If it's an assembly, a loose `Compound` is correct — just don't mistake it for a weld.
- **A `Compound` result after a fully-overlapping boolean is usually fine — don't chase a `Solid`, and don't gate your guards on `isSolid()`.** Even genuinely-overlapping operands (a `cut`/`fuse` of an extruded `Shape3D`, or a complex toothed/multi-feature body) frequently report `shapeType:'Compound'` and `isSolid() === false` while being a perfectly valid single body (`ok:true`, `isValidSolid`, positive volume, correct bounds). `shapeType` is report-only/non-authorable, so don't iterate trying to force a `Solid`, and don't write `if (!isSolid(x)) throw` — it false-trips on this; check `isValidSolid` / positive volume and let `verify` judge validity. **But distinguish a Compound-_typed_ single body from a genuinely disjoint one: `getSolids(part).length === 1` is the harmless report artifact above; `> 1` means the bodies are actually SEPARATE — a disjoint compound passes `ok:true` (each solid is valid) but DETACHES on STEP/GLB export.** If you intend ONE welded part, check `getSolids(part).length === 1`, not just `ok:true`. It only matters when a **downstream `fillet`/`shell`/`offset`** demands a `ValidSolid`, or you need a single exportable body; only then push for the weld (and check `manifold`).

See also: docs/function-lookup.md → brepjs/topology.
