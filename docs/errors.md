# Error Reference

brepjs uses the `Result<T, BrepError>` pattern for fallible operations. This document lists all error codes and their meanings.

## Error Structure

```typescript
interface BrepError {
  kind: BrepErrorKind;
  code: string;
  message: string;
  cause?: unknown;
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

| Code | Description | Recovery |
|------|-------------|----------|
| `BSPLINE_FAILED` | B-spline curve construction failed | Check control points are valid |
| `FACE_BUILD_FAILED` | Face construction from wire failed | Ensure wire is closed and planar |

### VALIDATION

Input validation errors.

| Code | Description | Recovery |
|------|-------------|----------|
| `CHAMFER_NO_EDGES` | Chamfer called with no edges | Provide at least one edge |
| `ELLIPSE_RADII` | Invalid ellipse radii | Ensure major >= minor > 0 |
| `FILLET_NO_EDGES` | Fillet called with no edges | Provide at least one edge |
| `FUSE_ALL_EMPTY` | fuseAll called with empty array | Provide at least one shape |
| `POLYGON_MIN_POINTS` | Polygon requires 3+ points | Provide at least 3 points |
| `UNKNOWN_PLANE` | Unknown named plane | Use valid plane name (XY, YZ, ZX, etc.) |
| `UNSUPPORTED_PROFILE` | Extrusion profile not supported | Use supported profile type |

### TYPE_CAST

Type conversion and shape casting errors.

| Code | Description | Recovery |
|------|-------------|----------|
| `NO_WRAPPER` | Shape has no wrapper object | Re-cast the shape |
| `NULL_SHAPE` | Shape is null | Check upstream operation succeeded |
| `OFFSET_NOT_WIRE` | Offset result is not a wire | Check offset parameters |
| `SOLID_BUILD_FAILED` | Solid construction failed | Ensure shell is closed |
| `SWEEP_END_NOT_WIRE` | Sweep end section is not a wire | Provide wire for end section |
| `SWEEP_START_NOT_WIRE` | Sweep start section is not a wire | Provide wire for start section |
| `UNKNOWN_CURVE_TYPE` | Unrecognized curve type | Check curve is valid |
| `UNKNOWN_SURFACE_TYPE` | Unrecognized surface type | Check surface is valid |
| `WELD_NOT_SHELL` | Weld result is not a shell | Check faces are compatible |

### COMPUTATION

Computational/algorithmic failures.

| Code | Description | Recovery |
|------|-------------|----------|
| `INTERSECTION_FAILED` | Curve/surface intersection failed | Check geometry validity |
| `PARAMETER_NOT_FOUND` | Curve parameter not found | Check point is on curve |
| `SELF_INTERSECTION_FAILED` | Self-intersection detection failed | Simplify geometry |

### IO

File import/export errors.

| Code | Description | Recovery |
|------|-------------|----------|
| `STEP_EXPORT_FAILED` | STEP file export failed | Check shape is valid |
| `STEP_FILE_READ_ERROR` | Could not read STEP file | Check file exists and is readable |
| `STEP_IMPORT_FAILED` | STEP file import failed | Check file format |
| `STL_EXPORT_FAILED` | STL file export failed | Check shape has valid mesh |
| `STL_FILE_READ_ERROR` | Could not read STL file | Check file exists and is readable |
| `STL_IMPORT_FAILED` | STL file import failed | Check file format |

### QUERY

Shape query and finder errors.

| Code | Description | Recovery |
|------|-------------|----------|
| `FINDER_NOT_UNIQUE` | Finder expected unique result | Refine filters or remove unique option |

## Creating Custom Errors

```typescript
import { validationError, err } from 'brepjs';

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
