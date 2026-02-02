# Measurement

**Layer 2** — Volume, area, length, and distance measurement.

## Key Files

| File              | Purpose                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| `measureFns.ts`   | Functional API: `measureVolume`, `measureArea`, `measureLength`, `measureDistance`, property helpers |
| `measureShape.ts` | Legacy class-based API: physical property wrappers, `DistanceQuery`, `DistanceTool`                  |

## Functional API (`measureFns.ts`)

All functions return plain numbers or objects — no memory management needed.

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

## Legacy Class-Based API (`measureShape.ts`)

Wraps OCCT objects in `WrappingObj` — requires manual `.delete()` for memory management.

| Class/Function                     | Purpose                                              |
| ---------------------------------- | ---------------------------------------------------- |
| `VolumePhysicalProperties`         | Wraps volume properties (`.volume`, `.centerOfMass`) |
| `SurfacePhysicalProperties`        | Wraps surface properties (`.area`, `.centerOfMass`)  |
| `LinearPhysicalProperties`         | Wraps linear properties (`.length`, `.centerOfMass`) |
| `measureShapeVolumeProperties(s)`  | Returns `VolumePhysicalProperties` instance          |
| `measureShapeSurfaceProperties(s)` | Returns `SurfacePhysicalProperties` instance         |
| `measureShapeLinearProperties(s)`  | Returns `LinearPhysicalProperties` instance          |
| `DistanceTool`                     | Reusable tool for distance queries (class-based)     |
| `DistanceQuery`                    | Loads reference shape once, query many targets       |
| `measureDistanceBetween(s1, s2)`   | Legacy one-time distance measurement                 |

## Physical Properties

The "mass" field in `PhysicalProps` represents the **geometric property**:

- `measureVolumeProps` → mass = volume (cubic units)
- `measureSurfaceProps` → mass = area (square units)
- `measureLinearProps` → mass = length (linear units)

This is **not** physical mass. For actual mass, multiply by material density.

## Reusable Distance Queries

When measuring distance from one reference shape to many targets, use the reusable API:

**Functional API** (preferred):

```typescript
const query = createDistanceQuery(referenceShape);
const d1 = query.distanceTo(target1);
const d2 = query.distanceTo(target2);
query.dispose(); // Clean up
```

**Legacy API**:

```typescript
const query = new DistanceQuery(referenceShape);
const d1 = query.distanceTo(target1);
const d2 = query.distanceTo(target2);
query.delete(); // Clean up
```

## Gotchas

1. **Functional API is stateless** — No `.delete()` required; all cleanup happens internally
2. **Legacy API requires cleanup** — Call `.delete()` on property objects (`VolumePhysicalProperties`, `DistanceQuery`, etc.)
3. **Reusable queries are faster** — `createDistanceQuery()` loads reference shape once, then measures against many targets efficiently
4. **"Mass" is not mass** — The `mass` field represents geometric properties (volume/area/length), not actual mass. Multiply by density if needed.
5. **Center of mass from geometry** — Computed from shape geometry, not physical distribution
6. **Face vs Shape3D for area** — `measureArea()` accepts both faces (single surface) and 3D shapes (total surface area)
7. **AnyShape for length** — `measureLength()` works on edges, wires, and any shape (computes total edge length)
