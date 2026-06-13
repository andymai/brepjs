# Booleans

Combine solids with CSG. All three return `Result<T>` — unwrap or thread the result through to the default export.

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
  return cut(body, bore); // Result<Solid> — fine to return directly
};
```

## Many bodies: `fuseAll` vs `compound`

- `fuseAll(solids)` welds N solids into ONE watertight solid — but it runs N−1 boolean ops, so it is slow for large N and can time out STEP export on dozens of bodies. Use it only when you genuinely need a single manifold solid. Over mixed `Shape3D[]` (e.g. results of `cut`) the typed overload needs `fuseAll(shapes, { unsafe: true })`.
- `compound(shapes)` groups bodies into one shape with ZERO boolean cost (returns a `Compound`, not a `Result`). This is the right tool for **assemblies** — furniture, kits, anything that is naturally many distinct parts. STEP/GLB store the assembly tree natively, and each part stays addressable.

```ts
// assembly.brep.ts — 50 slats + posts + legs, no booleans
import { box, compound } from 'brepjs';
export default () => compound([...posts, ...slats, ...legs]); // Compound, fast
```

Rule of thumb: need one solid (for a downstream fillet/shell, or a watertight print)? `fuseAll`. Modeling a multi-part object? `compound`.

## Coloring an assembly (GLB preview)

A part may `export const materials` to paint its GLB preview (STEP stays geometry-only). It is a per-face selector run at export — return a material per face, or `undefined` for the default:

```ts
import type { MaterialFn } from 'brepjs';
export const materials: MaterialFn = ({ center }) =>
  center[2] < 168 // Z-up, mm
    ? { name: 'wood', baseColor: [0.78, 0.63, 0.41, 1], roughness: 0.5 }
    : { name: 'white', baseColor: [0.95, 0.94, 0.92, 1], roughness: 0.72 };
```

A plain `GltfMaterial` object (not a function) paints the whole part one color. The GLB is exported **Y-up** by default so it stands upright in standard glTF viewers; vertices stay Z-up to match the STEP.

## Pitfalls

- Returning a `Result` from the default export is supported; the verifier unwraps it and reports an `Err`.
- Booleans on touching-but-not-overlapping solids can yield empty/invalid results — give operands a small overlap. (A `compound` does NOT need overlap — bodies stay distinct.)

See also: docs/function-lookup.md → brepjs/topology.
