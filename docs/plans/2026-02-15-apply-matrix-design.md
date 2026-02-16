# applyMatrix — 4x4 Affine Transform (OpenSCAD multmatrix equivalent)

## Goal

Add `applyMatrix()` to brepjs: apply an arbitrary 4x4 affine transformation matrix to any shape. Equivalent to OpenSCAD's `multmatrix`. Supports non-uniform scale, shear, rotation, translation — the full affine space.

## API

```ts
/** 4x4 affine matrix in row-major order. Bottom row must be [0,0,0,1]. */
type Matrix4x4 = [
  [number, number, number, number],
  [number, number, number, number],
  [number, number, number, number],
  [number, number, number, number],
];

/** Structured matrix input: 3x3 linear part + translation. */
interface MatrixTransform {
  /** 3x3 linear part in row-major order [r00,r01,r02, r10,r11,r12, r20,r21,r22]. */
  linear: [number, number, number, number, number, number, number, number, number];
  /** Translation vector [tx, ty, tz]. */
  translation: Vec3;
}

/** Apply a 4x4 affine transformation matrix. Equivalent to OpenSCAD's multmatrix. */
function applyMatrix<T extends AnyShape>(
  shape: Shapeable<T>,
  matrix: Matrix4x4 | MatrixTransform
): T;
```

## Approach: B — Dual-path with orthogonal detection

1. Parse the input into a 3x3 linear part + translation vector.
2. Check if the 3x3 part is orthogonal (R^T * R ≈ s^2 * I for some scalar s).
   - **Orthogonal:** Use `gp_Trsf` + `BRepBuilderAPI_Transform` (fast path).
   - **Non-orthogonal:** Use `gp_GTrsf` + `BRepBuilderAPI_GTransform` (general path).
3. Validate: bottom row must be [0,0,0,1], matrix must not be singular.
4. Throw on invalid input (consistent with translate/rotate/scale).

## Layer placement

| Component | File | Layer |
|---|---|---|
| `Matrix4x4`, `MatrixTransform` types | `src/core/types.ts` | 0 |
| `generalTransform()` kernel op | `src/kernel/transformOps.ts` | 0 |
| `generalTransform()` on KernelAdapter | `src/kernel/types.ts` | 0 |
| `generalTransform()` adapter impl | `src/kernel/occtAdapter.ts` | 0 |
| `applyMatrix()` shape function | `src/topology/shapeFns.ts` | 2 |
| `applyMatrix()` public API | `src/topology/api.ts` | 2 |
| Export | `src/index.ts` | — |

## WASM build change

Add `BRepBuilderAPI_GTransform` to all three build configs:
- `packages/brepjs-opencascade/build-config/custom_build_single.yml`
- `packages/brepjs-opencascade/build-config/custom_build_threaded.yml`
- `packages/brepjs-opencascade/build-config/custom_build_with_exceptions.yml`

Note: `gp_GTrsf` and `gp_Mat` are already in the build. Only the shape transformer class is missing.

## Validation rules

1. Bottom row check: `m[3]` must be `[0, 0, 0, 1]` (within tolerance 1e-10).
2. Singularity check: determinant of 3x3 part must be non-zero.
3. Throw descriptive errors on failure.

## Orthogonality detection

A 3x3 matrix M is orthogonal (possibly with uniform scale) if M^T * M = s^2 * I.
Check: compute M^T * M, verify off-diagonal elements are < tolerance and diagonal elements are equal within tolerance. If orthogonal, extract via `gp_Trsf` for the fast path.

## Error behavior

Throws (consistent with translate/rotate/scale), not Result<T>.

## Testing

- Identity matrix → shape unchanged
- Pure translation matrix → matches translate()
- Pure rotation matrix → matches rotate()
- Uniform scale matrix → matches scale()
- Non-uniform scale (e.g., [2,1,1]) → shape stretched
- Shear matrix → shape sheared
- Composed transform → correct result
- Singular matrix → throws
- Invalid bottom row → throws
- Both Matrix4x4 and MatrixTransform inputs work identically
