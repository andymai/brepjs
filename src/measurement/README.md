# Measurement

**Layer 2**: Volume, area, length, and distance measurement.

## Key Files

| File                 | Purpose                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| `measureFns.ts`      | Functional API: `measureVolume`, `measureArea`, `measureLength`, `measureDistance`, property helpers |
| `principalBoxFns.ts` | `principalBoundingBox`: bounding box on a solid's principal axes of inertia                          |

## API (`measureFns.ts`)

All functions return plain numbers or objects; no memory management needed.

| Function                  | Input                | Output                       | Use Case                  |
| ------------------------- | -------------------- | ---------------------------- | ------------------------- |
| `measureVolume(shape)`    | `Shape3D`            | `number`                     | Quick volume measurement  |
| `measureArea(shape)`      | `Face \| Shape3D`    | `number`                     | Quick surface area        |
| `measureLength(shape)`    | `AnyShape`           | `number`                     | Quick arc length          |
| `measureDistance(s1, s2)` | `AnyShape, AnyShape` | `number`                     | One-time distance query   |
| `createDistanceQuery(s)`  | `AnyShape`           | `{distanceTo, dispose}`      | Reusable distance queries |
| `measureVolumeProps(s)`   | `Shape3D`            | `{mass, centerOfMass: Vec3}` | Volume + center of mass   |
| `measureSurfaceProps(s)`  | `Face \| Shape3D`    | `{mass, centerOfMass: Vec3}` | Area + center of mass     |
| `measureLinearProps(s)`   | `AnyShape`           | `{mass, centerOfMass: Vec3}` | Length + center of mass   |

## Principal Bounding Box (`principalBoxFns.ts`)

`principalBoundingBox(shape)` returns `Result<PrincipalBoundingBox>`: the box in the frame of the principal axes of inertia, so a rotated board reports its own length, width, and thickness instead of the inflated world-axis box from `getBounds`.

| Field    | Meaning                                                      |
| -------- | ------------------------------------------------------------ |
| `center` | Box center in world coordinates                              |
| `axes`   | Orthonormal, right-handed axes, ordered by decreasing extent |
| `size`   | Full edge lengths along `axes`, largest first                |

```typescript
const { size, axes, center } = unwrap(principalBoundingBox(rotatedBoard));
// size: [600, 400, 18.5]; axes[2] is the board's normal
```

- It is a box on the principal axes, not a minimum-volume oriented box. When principal moments coincide the in-plane axes are not unique: a 100 x 100 x 2 plate rotated 30 degrees about Z reports 136.6 x 136.6 x 2.
- Input must enclose volume: faces, wires, and shells fail with `NOT_A_SOLID`; a compound without solids (or a degenerate solid) fails with `ZERO_VOLUME`.
- Needs the optional kernel `inertia` query (occt-wasm). Other kernels return an `UNSUPPORTED` error.
- For a shape already on the world axes, `axes` are exact world unit vectors (in extent order, the third flipped when needed to stay right-handed) and `center` is exact.

## Physical Properties

The "mass" field in `PhysicalProps` represents the **geometric property**:

- `measureVolumeProps` → mass = volume (cubic units)
- `measureSurfaceProps` → mass = area (square units)
- `measureLinearProps` → mass = length (linear units)

This is **not** physical mass. For actual mass, multiply by material density.

## Reusable Distance Queries

When measuring distance from one reference shape to many targets, use the reusable API:

```typescript
const query = createDistanceQuery(referenceShape);
const d1 = query.distanceTo(target1);
const d2 = query.distanceTo(target2);
query.dispose(); // Clean up
```

## Gotchas

1. **Stateless**: No `.delete()` required; all cleanup happens internally
2. **Reusable queries are faster**: `createDistanceQuery()` loads reference shape once, then measures against many targets efficiently
3. **"Mass" is not mass**: The `mass` field represents geometric properties (volume/area/length), not actual mass. Multiply by density if needed.
4. **Center of mass from geometry**: Computed from shape geometry, not physical distribution
5. **Face vs Shape3D for area**: `measureArea()` accepts both faces (single surface) and 3D shapes (total surface area)
6. **AnyShape for length**: `measureLength()` works on edges, wires, and any shape (computes total edge length)
