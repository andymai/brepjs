# Error Reference

brepjs uses the `Result<T, BrepError>` pattern for all fallible operations (v4.0.0+). This document lists all error codes and their meanings.

## Error Structure

```typescript
interface BrepError {
  readonly kind: BrepErrorKind;
  readonly code: string;
  readonly message: string;
  readonly cause?: unknown;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

type BrepErrorKind =
  | 'OCCT_OPERATION'
  | 'VALIDATION'
  | 'TYPE_CAST'
  | 'SKETCHER_STATE'
  | 'MODULE_INIT'
  | 'COMPUTATION'
  | 'IO'
  | 'QUERY';
```

## Handling Errors

```typescript
import { isOk, isErr, unwrap, match } from 'brepjs';

const result = someOperation();

// Check success
if (isOk(result)) {
  const value = result.value;
}

// Check failure
if (isErr(result)) {
  console.error(result.error.code, result.error.message);
}

// Pattern match
const output = match(result, {
  ok: (value) => processValue(value),
  err: (error) => handleError(error),
});

// Unwrap (throws on error)
const value = unwrap(result);
```

## Error Codes by Kind

### OCCT_OPERATION

Errors from OpenCascade operations.

| Code                    | Description                        | Recovery                         |
| ----------------------- | ---------------------------------- | -------------------------------- |
| `BSPLINE_FAILED`        | B-spline curve construction failed | Check control points are valid   |
| `FACE_BUILD_FAILED`     | Face construction from wire failed | Ensure wire is closed and planar |
| `SWEEP_FAILED`          | Sweep operation failed             | Check spine and profile geometry |
| `LOFT_FAILED`           | Loft operation failed              | Check profiles are compatible    |
| `FUSE_FAILED`           | Boolean fuse operation failed      | Check shapes are valid solids    |
| `CUT_FAILED`            | Boolean cut operation failed       | Check shapes overlap             |
| `FILLET_FAILED`         | Fillet operation failed            | Reduce radius or check edges     |
| `FILLET_RESULT_NOT_3D`  | Fillet result is not a 3D shape    | Check input shape type           |
| `CHAMFER_FAILED`        | Chamfer operation failed           | Reduce distance or check edges   |
| `CHAMFER_RESULT_NOT_3D` | Chamfer result is not a 3D shape   | Check input shape type           |
| `SHELL_FAILED`          | Shell operation failed             | Check thickness vs geometry      |
| `SHELL_RESULT_NOT_3D`   | Shell result is not a 3D shape     | Check input shape type           |
| `HEAL_SOLID_FAILED`     | Solid healing failed               | Shape may be too damaged         |
| `HEAL_FACE_FAILED`      | Face healing failed                | Shape may be too damaged         |
| `HEAL_WIRE_FAILED`      | Wire healing failed                | Shape may be too damaged         |
| `HEAL_RESULT_NOT_SOLID` | Healed result is not a solid       | Check input is a solid           |
| `HEAL_RESULT_NOT_FACE`  | Healed result is not a face        | Check input is a face            |
| `HEAL_RESULT_NOT_WIRE`  | Healed result is not a wire        | Check input is a wire            |

### VALIDATION

Input validation errors.

| Code                       | Description                       | Recovery                                |
| -------------------------- | --------------------------------- | --------------------------------------- |
| `CHAMFER_NO_EDGES`         | Chamfer called with no edges      | Provide at least one edge               |
| `ELLIPSE_RADII`            | Invalid ellipse radii             | Ensure major >= minor > 0               |
| `FILLET_NO_EDGES`          | Fillet called with no edges       | Provide at least one edge               |
| `FUSE_ALL_EMPTY`           | fuseAll called with empty array   | Provide at least one shape              |
| `POLYGON_MIN_POINTS`       | Polygon requires 3+ points        | Provide at least 3 points               |
| `UNKNOWN_PLANE`            | Unknown named plane               | Use valid plane name (XY, YZ, ZX, etc.) |
| `UNSUPPORTED_PROFILE`      | Extrusion profile not supported   | Use supported profile type              |
| `INVALID_FILLET_RADIUS`    | Fillet radius must be positive    | Use a positive radius value             |
| `INVALID_CHAMFER_DISTANCE` | Chamfer distance must be positive | Use a positive distance value           |
| `INVALID_THICKNESS`        | Shell thickness must be positive  | Use a positive thickness value          |
| `NO_EDGES`                 | No edges found for fillet/chamfer | Ensure shape has edges                  |
| `NO_FACES`                 | No faces specified for shell      | Provide at least one face               |
| `ZERO_OFFSET`              | Offset distance cannot be zero    | Use a non-zero offset value             |
| `ZERO_LENGTH_EXTRUSION`    | Extrusion vector has zero length  | Use a non-zero extrusion vector         |
| `ZERO_TWIST_ANGLE`         | Twist angle cannot be zero        | Use a non-zero angle                    |
| `LOFT_EMPTY`               | Loft requires at least one wire   | Provide wire profiles                   |
| `NOT_A_SOLID`              | Input shape is not a solid        | Provide a solid shape                   |
| `NOT_A_FACE`               | Input shape is not a face         | Provide a face shape                    |
| `NOT_A_WIRE`               | Input shape is not a wire         | Provide a wire shape                    |
| `PATTERN_INVALID_COUNT`    | Pattern count must be at least 1  | Use count >= 1                          |
| `PATTERN_ZERO_DIRECTION`   | Pattern direction cannot be zero  | Provide non-zero direction vector       |
| `PATTERN_ZERO_AXIS`        | Pattern axis cannot be zero       | Provide non-zero axis vector            |
| `CAMERA_ZERO_DIRECTION`    | Camera direction is zero-length   | Provide non-zero direction vector       |

### TYPE_CAST

Type conversion and shape casting errors.

| Code                     | Description                              | Recovery                           |
| ------------------------ | ---------------------------------------- | ---------------------------------- |
| `NO_WRAPPER`             | Shape has no wrapper object              | Re-cast the shape                  |
| `NULL_SHAPE`             | Shape is null                            | Check upstream operation succeeded |
| `OFFSET_NOT_WIRE`        | Offset result is not a wire              | Check offset parameters            |
| `OFFSET_NOT_3D`          | Offset result is not a 3D shape          | Check offset parameters            |
| `SOLID_BUILD_FAILED`     | Solid construction failed                | Ensure shell is closed             |
| `SWEEP_END_NOT_WIRE`     | Sweep end section is not a wire          | Provide wire for end section       |
| `SWEEP_START_NOT_WIRE`   | Sweep start section is not a wire        | Provide wire for start section     |
| `SWEEP_NOT_3D`           | Sweep did not produce a 3D shape         | Check profile and spine            |
| `REVOLUTION_NOT_3D`      | Revolution did not produce a 3D shape    | Check profile and axis             |
| `LOFT_NOT_3D`            | Loft did not produce a 3D shape          | Check profiles                     |
| `FUSE_NOT_3D`            | Fuse did not produce a 3D shape          | Check input shapes                 |
| `CUT_NOT_3D`             | Cut did not produce a 3D shape           | Check input shapes                 |
| `INTERSECT_NOT_3D`       | Intersect did not produce a 3D shape     | Check input shapes                 |
| `FUSE_ALL_NOT_3D`        | fuseAll did not produce a 3D shape       | Check input shapes                 |
| `CUT_ALL_NOT_3D`         | cutAll did not produce a 3D shape        | Check input shapes                 |
| `FILLET_NOT_3D`          | Fillet did not produce a 3D shape        | Check input shape                  |
| `CHAMFER_NOT_3D`         | Chamfer did not produce a 3D shape       | Check input shape                  |
| `SHELL_NOT_3D`           | Shell did not produce a 3D shape         | Check input shape                  |
| `UNKNOWN_CURVE_TYPE`     | Unrecognized curve type                  | Check curve is valid               |
| `UNKNOWN_SURFACE_TYPE`   | Unrecognized surface type                | Check surface is valid             |
| `WELD_NOT_SHELL`         | Weld result is not a shell               | Check faces are compatible         |
| `INTERPOLATE_MIN_POINTS` | Interpolation requires at least 2 points | Provide more points                |
| `INTERPOLATE_NOT_EDGE`   | Interpolation did not produce an edge    | Check input points                 |
| `APPROXIMATE_MIN_POINTS` | Approximation requires at least 2 points | Provide more points                |
| `APPROXIMATE_NOT_EDGE`   | Approximation did not produce an edge    | Check input points                 |
| `PROJECTION_FAILED`      | No projection found on the face          | Check point and face geometry      |

### COMPUTATION

Computational/algorithmic failures.

| Code                       | Description                                | Recovery                |
| -------------------------- | ------------------------------------------ | ----------------------- |
| `INTERSECTION_FAILED`      | Curve/surface intersection failed          | Check geometry validity |
| `PARAMETER_NOT_FOUND`      | Curve parameter not found                  | Check point is on curve |
| `SELF_INTERSECTION_FAILED` | Self-intersection detection failed         | Simplify geometry       |
| `BSPLINE_2D_FAILED`        | 2D B-spline approximation failed           | Check input points      |
| `REPLAY_UNKNOWN_OP`        | Unknown operation type in history replay   | Register the operation  |
| `REPLAY_STEP_NOT_FOUND`    | Step not found during history replay       | Check step ID exists    |
| `REPLAY_OPERATION_FAILED`  | Operation failed during history replay     | Check operation inputs  |
| `MODIFY_STEP_NOT_FOUND`    | Step not found during history modification | Check step ID exists    |

### IO

File import/export errors.

| Code                   | Description                   | Recovery                          |
| ---------------------- | ----------------------------- | --------------------------------- |
| `STEP_EXPORT_FAILED`   | STEP file export failed       | Check shape is valid              |
| `STEP_FILE_READ_ERROR` | Could not read STEP file      | Check file exists and is readable |
| `STEP_IMPORT_FAILED`   | STEP file import failed       | Check file format                 |
| `STL_EXPORT_FAILED`    | STL file export failed        | Check shape has valid mesh        |
| `STL_FILE_READ_ERROR`  | Could not read STL file       | Check file exists and is readable |
| `STL_IMPORT_FAILED`    | STL file import failed        | Check file format                 |
| `IGES_EXPORT_FAILED`   | IGES file export failed       | Check shape is valid              |
| `IGES_IMPORT_FAILED`   | IGES file import failed       | Check file format                 |
| `SVG_IMPORT_FAILED`    | SVG import failed             | Check SVG string is valid         |
| `SVG_EMPTY_PATH`       | SVG path produced no curves   | Check path d attribute            |
| `SVG_PATH_FAILED`      | SVG path processing failed    | Check path syntax                 |
| `SVG_NO_PATHS`         | No path elements found in SVG | Ensure SVG contains paths         |

### QUERY

Shape query and finder errors.

| Code                   | Description                      | Recovery                               |
| ---------------------- | -------------------------------- | -------------------------------------- |
| `FINDER_NOT_UNIQUE`    | Finder expected unique result    | Refine filters or remove unique option |
| `SELECTION_NOT_UNIQUE` | Selection expected unique result | Refine selection criteria              |

## Creating Custom Errors

```typescript
import { validationError, err, ok } from 'brepjs';

function myOperation(value: number): Result<number> {
  if (value < 0) {
    return err(validationError('NEGATIVE_VALUE', 'Value must be non-negative'));
  }
  return ok(value * 2);
}
```

## Debugging Tips

1. **Check the error code first** — it identifies the failure category
2. **Read the message** — it often contains specific details
3. **Check the cause** — it may contain the underlying exception
4. **Verify inputs** — most errors result from invalid inputs
5. **Check geometry validity** — use `isShapeNull()` to verify shapes
