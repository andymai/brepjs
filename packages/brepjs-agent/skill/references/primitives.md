# Primitives

Primitive constructors return a `ValidSolid` directly (no `Result`). Positioning uses `at`, never `origin`.

| Function   | Signature                                                          | Notes                          |
| ---------- | ------------------------------------------------------------------ | ------------------------------ |
| `box`      | `box(width, depth, height, { at?, centered? })`                    | width=X, **depth=Y**, height=Z |
| `cylinder` | `cylinder(radius, height, { at?, axis?, centered? })`              | axis default `[0,0,1]`         |
| `sphere`   | `sphere(radius, { at? })`                                          | `at` is the center             |
| `cone`     | `cone(bottomRadius, topRadius, height, { at?, axis?, centered? })` | topRadius 0 = full cone        |
| `torus`    | `torus(majorRadius, minorRadius, { at?, axis? })`                  |                                |

```ts
// stack.brep.ts
import { cylinder, sphere, fuse } from 'brepjs';
export default () => {
  const post = cylinder(5, 30);
  const cap = sphere(7, { at: [0, 0, 30] });
  return fuse(post, cap);
};
```

## Pitfalls

- `box`'s second arg is **depth (Y)**, not height (Z is third).
- `at` means _center_ for box/sphere/torus and _base_ for cylinder/cone; `centered: true` re-centers the axial dimension.

See also: docs/function-lookup.md → brepjs/topology.
