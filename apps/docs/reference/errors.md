---
title: Error Codes
description: 'Catalog of every BrepError code: what it means, common causes, and how to recover. Switch on .code, never on .message.'
---

# Error Codes

Every fallible brepjs operation returns `Result<T, BrepError>`. The error's `code` is a stable identifier you can switch on; the `message` is human-readable; the `suggestion` (optional) is actionable advice. This chapter is the catalog: what each code means and how to recover.

## How to read this chapter

```typescript
import { box, cylinder, cut, isOk } from 'brepjs/quick';

const result = cut(box(20, 20, 20), cylinder(5, 25));
if (!isOk(result)) {
  switch (result.error.code) {
    case 'BOOLEAN_NO_OVERLAP':
      // see "BOOLEAN_NO_OVERLAP" below
      break;
    case 'INVALID_SHAPE':
      // see "INVALID_SHAPE" below
      break;
    default:
      console.error('Unexpected:', result.error.code, result.error.message);
  }
} else {
  console.log('Cut succeeded');
}
```

The codes below are grouped by domain. Use Ctrl+F.

## Initialization

### `KERNEL_NOT_INITIALIZED`

You called a brepjs function before any kernel was registered. Either you forgot `await init()` / `await registerKernel(...)`, or you're using `brepjs/quick` in an environment without top-level await support.

**Fix**: Use one of the three init paths in [Install & Initialize](../getting-started/install). For environments without top-level await, prefer `init()` and explicitly `await` it before any shape call.

### `KERNEL_NOT_REGISTERED`

You called `withKernel('name', ...)` for a kernel that hasn't been registered. Either the import is missing or `registerKernel('name', adapter)` wasn't called.

**Fix**: Verify the kernel package is installed and registered. For brepkit: `import { BrepKernel } from 'brepkit-wasm'; const bk = new BrepKernel(); registerKernel('brepkit', new BrepkitAdapter(bk));`.

## Boolean operations

### `BOOLEAN_NO_OVERLAP`

The two operands don't share volume. For `cut`, this is occasionally not an error (the input is returned unchanged); other operations may report this.

**Fix**: Verify the shapes overlap as expected (visualize bounding boxes, check positions). For `cut` to actually remove material, the cutting tool must intersect the base shape.

### `BOOLEAN_INVALID_INPUT`

One of the inputs failed `BRepCheck`. The kernel refuses to operate on invalid shapes.

**Fix**: Run `autoHeal(input)` on each operand before the boolean. For imported shapes, this should be the default. See [Healing & Sewing](../advanced/healing).

### `BOOLEAN_NEAR_COINCIDENT`

The operands have geometry that is nearly but not exactly coincident. The kernel can't decide whether to merge or separate them.

**Fix**: Add overshoot to cutting tools (`cylinder(5, 12, { at: [..., -1] })` for a 10mm-thick block). Or heal both operands with a slightly enlarged tolerance: `autoHeal(s, { tolerance: 0.01 })`.

### `BOOLEAN_AMBIGUOUS_RESULT`

The operation has multiple geometrically valid outcomes. Rare.

**Fix**: Restate the problem so the result is unambiguous. Move the cutting tool slightly so it definitely overlaps rather than tangentially touches.

### `BOOLEAN_PRODUCED_INVALID`

The boolean succeeded but the result didn't pass `BRepCheck`. Usually means the kernel's tolerance handling produced slivers.

**Fix**: Run `removeSlivers(result, { minArea: 0.001 })` and re-check. If that doesn't help, retry the boolean with healed inputs.

## Refinement

### `FILLET_TOO_LARGE`

The radius is bigger than the local edge geometry can support. A 6 mm fillet on a 10 mm-thick part doesn't fit. The fillet would consume both faces.

**Fix**: Smaller radius. Or: fewer edges (radius and edge selection interact; a fillet that would propagate to a too-tight neighbour fails).

### `FILLET_INVALID_EDGE`

The selected edge has geometry the fillet algorithm can't handle. Common with imported shapes: sharp creases, edges shorter than the radius, non-tangent meeting edges.

**Fix**: Heal first (`autoHeal`). Or skip the problematic edge by refining the finder. Or use `chamfer`. It has fewer requirements.

### `FILLET_AMBIGUOUS_PROPAGATION`

You filleted an edge that meets multiple others at a vertex; the kernel can't decide whether to propagate.

**Fix**: Select all the edges that should propagate explicitly, in the same `fillet()` call.

### `CHAMFER_TOO_LARGE`

Same as `FILLET_TOO_LARGE` but for chamfer.

**Fix**: Smaller distance.

### `SHELL_TOO_THICK`

The wall thickness in `shell(solid, faces, t)` is larger than the local geometry can support. The offset surfaces would self-intersect.

**Fix**: Thinner wall. Or remove faces that allow more offset clearance.

### `SHELL_FACE_NOT_ON_SHAPE`

You passed a face to `shell` that isn't part of the input solid. This usually means the face handle is stale (from a previous shape).

**Fix**: Find faces on the _current_ shape, not on a predecessor.

## Sketching / construction

### `WIRE_NOT_CLOSED`

You tried to build a face from a wire that isn't a closed loop. Usually means you forgot `.close()` on a `Sketcher`.

**Fix**: Call `.close()`. The compiler should normally catch this. You've probably done a runtime cast that bypassed the type system.

### `WIRE_SELF_INTERSECTS`

The wire crosses itself. The kernel rejects self-intersecting wires.

**Fix**: Plot your sketch on paper. Eliminate the crossing.

### `EXTRUDE_INVALID_FACE`

The face passed to `extrude` isn't `OrientedFace`. Usually a face built from an unclosed or self-intersecting wire.

**Fix**: Use the smart constructor `orientedFace(face)` to verify; if it fails, fix the source wire.

### `REVOLVE_AXIS_CROSSES_PROFILE`

The revolution axis passes through the profile. The result would self-intersect.

**Fix**: Move the axis. Or trim the profile so it stays on one side.

### `LOFT_PROFILE_MISMATCH`

The profiles passed to `loft` have very different topologies, e.g. one is closed, another is open.

**Fix**: Make all profiles consistent, all closed, all the same general topology.

### `SWEEP_PATH_INVALID`

The path has self-intersections, sharp corners, or non-tangent meeting edges. The kernel can't sweep along it.

**Fix**: Smooth the path (use tangent arcs at corners). Or split the sweep into segments along piecewise-tangent sub-paths.

## Healing

### `HEAL_FAILED`

`autoHeal` ran every repair pass it knows but the result still fails `BRepCheck`. Either the shape is more broken than `autoHeal` can fix, or the tolerance is wrong.

**Fix**: Try a larger tolerance: `autoHeal(s, { tolerance: 0.05 })`. Run `brepCheck(s)` to see exactly what's wrong.

### `SEW_FAILED`

`sew` couldn't connect the input faces. The gaps are larger than tolerance, or the topology is incompatible.

**Fix**: Increase tolerance. Or pre-process the faces (e.g. heal each individually first).

## IO

### `IO_PARSE_ERROR`

The file is malformed or in an unsupported dialect. Common with very old STEP / IGES files.

**Fix**: Re-export the file from the source CAD tool with up-to-date settings. For STEP, prefer AP214 or AP242.

### `IO_UNSUPPORTED_VERSION`

The file uses a STEP / IGES schema version brepjs doesn't support.

**Fix**: Re-export with a supported version. STEP AP214 is the safest target.

### `IO_FILE_TRUNCATED`

The file ends unexpectedly. Likely a download or upload problem.

**Fix**: Re-fetch the file. Verify the byte count.

### `MESH_TRIANGULATION_FAILED`

An exporter (STL, glTF, 3MF) couldn't triangulate the input. Usually a tolerance issue with very small or very large shapes.

**Fix**: Heal the input first. Adjust tolerance. Too small (1e-9) can fail; too large (1.0) can also fail for fine geometry.

## Validity / type checks

### `INVALID_SHAPE`

A shape failed `BRepCheck`. The umbrella code; specific issues come through the `report.issues` field on the `BrepError.cause`.

**Fix**: Run `brepCheck(shape)` to see the issues, then `autoHeal` or specific repair operations as needed.

### `NOT_CLOSED_WIRE`

You passed a wire to a function that requires `ClosedWire` and the runtime check failed.

**Fix**: Verify the wire is actually closed. For `Sketcher` chains, this means calling `.close()`. For built wires, use the smart constructor `closedWire(w)` to check.

### `NOT_ORIENTED_FACE`

You passed a face to a function requiring `OrientedFace` and the runtime check failed.

**Fix**: Use `orientedFace(f)` to compute the orientation. For raw imported faces, run `autoHeal` first.

### `NOT_VALID_SOLID`

The runtime `BRepCheck` of a smart constructor failed.

**Fix**: Heal the input. If it's deliberately invalid (e.g. an in-progress construction), don't call the smart constructor yet.

## Memory / disposal

### `DISPOSED_HANDLE_USED`

You called a function on a shape after it was disposed. Common after `using` blocks or `scope.dispose()`.

**Fix**: Move the operation inside the scope. Or copy the data you need (numbers from measurements) before disposal.

## Custom-kernel-related

### `KERNEL_NOT_SUPPORTED`

The active kernel does not implement this operation. Custom kernels can implement only a subset of `KernelInterface`.

**Fix**: Switch to a kernel that supports the operation (`withKernel('occt', ...)`). Or implement the missing method in your custom adapter.

## A pattern for unknown errors

When you see a code you don't recognize:

```typescript
import { isOk } from 'brepjs/quick';

declare const result: import('brepjs').Result<unknown>;

if (!isOk(result)) {
  console.error({
    code: result.error.code,
    message: result.error.message,
    suggestion: result.error.suggestion,
    cause: result.error.cause,
  });
}
```

The `cause` field carries the underlying kernel error (often a string from the OpenCascade kernel). Search the brepjs issues for the code; if it's not documented, file a bug.

## Stability of error codes

- **Codes are stable** across patch and minor versions.
- **Suggestions can improve** in any version (the wording, not the code).
- **New codes can be added** in minor versions. Don't write `default: throw` unless you really mean it.
- **Codes are removed** only in major versions, with deprecation warnings in advance.

## Next steps

- [Result and Errors](../concepts/result): the type and patterns above
- [Healing & Sewing](../advanced/healing): for the recovery paths
- [Boolean Operations](../tasks/booleans): the most common error source
