---
title: Error Codes
description: 'The common BrepError codes: what each means, common causes, and how to recover. Switch on .code, never on .message.'
---

# Error Codes

Every fallible brepjs operation returns `Result<T, BrepError>`. The error's `code` is a stable identifier you can switch on; the `message` is human-readable; the `suggestion` (optional) is actionable advice. This chapter covers the codes you're most likely to hit and how to recover; most codes are listed in the `BrepErrorCode` constant exported from `brepjs`.

## How to read this chapter

```typescript
import { box, cylinder, cut, isOk } from 'brepjs/quick';

const result = cut(box(20, 20, 20), cylinder(5, 25));
if (!isOk(result)) {
  switch (result.error.code) {
    case 'CUT_NOT_3D':
      // see "CUT_NOT_3D" below
      break;
    case 'NULL_SHAPE_INPUT':
      // see "NULL_SHAPE_INPUT" below
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

Kernel setup problems throw an `Error` instead of returning a `Result`, so they carry no code.

### `brepjs kernel not initialized`

You called a brepjs function before any kernel was registered. Either you forgot `await init()` / `registerKernel(...)`, or you're using `brepjs/quick` in an environment without top-level await support.

**Fix**: Use one of the three init paths in [Install & Initialize](../getting-started/install). For environments without top-level await, prefer `init()` and explicitly `await` it before any shape call.

### `brepjs: kernel '<id>' is not registered`

You called `withKernel('name', ...)` for a kernel that hasn't been registered. Either the import is missing or `registerKernel('name', adapter)` wasn't called.

**Fix**: Verify the kernel package is installed and registered. For brepkit: `import { BrepKernel } from 'brepkit-wasm'; const bk = new BrepKernel(); registerKernel('brepkit', new BrepkitAdapter(bk));`.

## Boolean operations

### `CUT_NOT_3D`

The boolean ran but its result isn't a 3D shape; the message names what came back. `FUSE_NOT_3D`, `INTERSECT_NOT_3D`, `FUSE_ALL_NOT_3D`, and `CUT_ALL_NOT_3D` are the same failure for the other booleans. Common causes: an operand is a shell or open surface rather than a solid, overlapping coplanar faces, or zero-thickness geometry. For `intersect`, the operands may not overlap at all. A `cut` whose tool misses the base is not an error: it returns the base unchanged.

**Fix**: Run `autoHeal(input)` on each operand before the boolean. For imported shapes, this should be the default. Add overshoot to cutting tools (`cylinder(5, 12, { at: [..., -1] })` for a 10mm-thick block) so faces aren't coincident. See [Healing & Sewing](../advanced/healing).

### `NULL_SHAPE_INPUT`

An operand is a null shape. Booleans and measurements check for this before they call the kernel.

**Fix**: Check that the step that produced the operand returned `Ok` and a real shape.

### `FUSE_ALL_EMPTY`

`fuseAll` was called with an empty list.

**Fix**: Pass at least one shape.

## Refinement

### `FILLET_FAILED`

The kernel couldn't build the fillet. Usually the radius is bigger than the local edge geometry can support: a 6 mm fillet on a 10 mm-thick part doesn't fit. When the kernel names the edges it couldn't build, they are in `error.metadata.failedEdges`. `CHAMFER_FAILED` is the same failure for `chamfer`.

**Fix**: Smaller radius, or leave the failing edges out of the selection.

### `INVALID_FILLET_RADIUS`

The radius is zero or negative (for a `[r1, r2]` pair, either value). `INVALID_CHAMFER_DISTANCE` is the chamfer equivalent. It also comes back when a chamfer callback returns plain distances for some edges and `{ distance, angle }` for others, since one chamfer can't mix the two.

**Fix**: Pass a positive radius or distance. For a mixed callback, chamfer the two groups of edges in separate calls.

### `FILLET_NO_EDGES`

The edge selection is empty: the edge list or finder matched nothing. `CHAMFER_NO_EDGES` is the chamfer equivalent.

**Fix**: Check the finder against the current shape, or pass the edges explicitly.

### `INVALID_EDGE_SELECTION`

`fillet(shape, edges, radius)` or `chamfer(shape, edges, distance)` got a number where the edges belong; the arguments look swapped.

**Fix**: Call `fillet(shape, edges, radius)`, or `fillet(shape, radius)` to round every edge.

### `FILLET_NOT_3D`

The fillet produced something other than a 3D shape. `CHAMFER_NOT_3D` is the chamfer equivalent. The radius or distance is usually too large for the selected edges.

**Fix**: Smaller radius or distance.

### `SHELL_NO_EFFECT`

`shell(solid, faces, t)` left the solid unchanged: the wall is too thick for the body. `SHELL_INVALID_RESULT` means the shell produced no usable solid for the same reason, or because the wall is larger than the tightest convex radius.

**Fix**: Use a wall thinner than half the narrowest part of the shape.

### `INVALID_THICKNESS`

The shell thickness is zero or negative. `NO_FACES` means no faces to remove were passed.

**Fix**: Pass a positive thickness and at least one face.

### `FACE_NOT_IN_SHAPE`

You passed a face to `removeFaces` that isn't part of the input shape. This usually means the face handle came from a different or earlier shape.

**Fix**: Find faces on the _current_ shape, not on a predecessor.

## Sketching / construction

### `WIRE_NOT_CLOSED`

`wireLoop` assembled a wire whose start and end points don't coincide.

**Fix**: Close the loop: add the missing edge, or check the endpoints match.

### `POLYGON_MIN_POINTS`

A polygon needs at least 3 points.

**Fix**: Pass 3 or more points.

### `EXTRUDE_ZERO_VECTOR`

`extrude` got a zero-length extrusion vector. `ZERO_LENGTH_EXTRUSION` is the same mistake in the sweep-based extrusions (`twistExtrude`, `complexExtrude`).

**Fix**: Pass a non-zero height or vector.

### `FACE_BUILD_FAILED`

The kernel couldn't build a face from the given wire; the wire may not be planar. `FACE_NOT_PLANAR` means a face was built but isn't planar.

**Fix**: Check the wire with `isClosedWire(w)` and `isPlanarWire(w)`; if either fails, fix the source edges.

### `LOFT_EMPTY`

`loft` got no wires and no start or end point.

**Fix**: Pass at least one profile.

### `LOFT_FAILED`

The kernel couldn't loft the profiles. Profiles may be incompatible or have different orientations.

**Fix**: Give every profile the same number of edges and a consistent orientation. Try reordering profiles.

### `SWEEP_NOT_3D`

The sweep didn't produce a 3D shape. `REVOLUTION_NOT_3D` and `LOFT_NOT_3D` are the same failure for `revolve` and `loft`.

**Fix**: Make sure the profile is a closed wire or face and the spine has no sharp corners or self-intersections. Smooth the path with tangent arcs at corners, or split the sweep into segments along piecewise-tangent sub-paths.

## Healing

### `HEAL_NO_EFFECT`

`healSolid` ran but the solid is still invalid.

**Fix**: Try `autoHeal(s, { sewTolerance: 0.05 })`, which adds a sewing pass. Run `isValid(s)` to confirm the result.

### `FIX_SHAPE_FAILED`

The kernel's shape fixer threw while repairing the shape.

**Fix**: Heal the pieces individually first, or rebuild the shape from cleaner input.

### `SOLID_FROM_SHELL_FAILED`

`solidFromShell` couldn't turn the shell into a solid. The shell is usually open.

**Fix**: Sew the faces first (`sewShells`, or `autoHeal` with a `sewTolerance`), then retry.

## IO

### `STEP_IMPORT_FAILED`

The STEP file couldn't be loaded, or it contains no valid geometry. `IGES_IMPORT_FAILED`, `STL_IMPORT_FAILED`, `OBJ_IMPORT_FAILED`, `THREEMF_IMPORT_FAILED`, `GLB_IMPORT_FAILED`, and `DXF_IMPORT_FAILED` cover the other formats.

**Fix**: Re-export the file from the source CAD tool with up-to-date settings. For STEP, prefer AP214 or AP242. If the file was downloaded or uploaded, check it isn't truncated.

### `STEP_EXPORT_FAILED`

The kernel couldn't write the STEP file. `STL_EXPORT_FAILED` and `IGES_EXPORT_FAILED` cover the other formats.

**Fix**: Heal the input first and check it is valid (`isValid(shape)`).

### `MESH_FAILED`

A CSG evaluator couldn't mesh a node.

**Fix**: Heal the input first. Adjust tolerance. Too small (1e-9) can fail; too large (1.0) can also fail for fine geometry.

## Validity / type checks

The smart constructors (`closedWire`, `orientedFace`, `manifoldShell`, `validSolid`) return `Result<T, string>`: their error is a plain message, not a `BrepError` with a code.

- `closedWire(w)`: "Wire is not closed: start and end points do not coincide". For `Sketcher` chains, call `.close()`.
- `orientedFace(f)`: "Face orientation is inconsistent or face is invalid". For raw imported faces, run `autoHeal` first.
- `manifoldShell(s)`: "Shell is not manifold: has free edges or is invalid".
- `validSolid(s)`: "Solid failed BRepCheck validation". Heal the input; if it's deliberately invalid (e.g. an in-progress construction), don't call the smart constructor yet.

## Memory / disposal

Using a shape after it was disposed throws `Error('Shape handle has been disposed')`. This is common after `using` blocks or disposing a `DisposalScope`.

**Fix**: Move the operation inside the scope. Or copy the data you need (numbers from measurements) before disposal.

## Custom-kernel-related

### `UNSUPPORTED_CAPABILITY`

The active kernel does not implement this operation, for example `removeFaces` (defeaturing) on a kernel without it. Custom kernels can implement only a subset of `KernelAdapter`. Operations that don't return a `Result` throw instead (`occt-wasm: <method> is not yet implemented`).

**Fix**: Switch to a kernel that supports the operation (`withKernel('occt-wasm', ...)`). Or implement the missing method in your custom adapter.

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

## Families and BIM identity

### `FAMILIES_UNKEYED_ELEMENT`

`familiesToBim` refused to mint IFC identity for an element without an explicit key. Index-fallback key paths are order-dependent, so a GlobalId derived from one silently changes when siblings reorder.

**Fix**: Give the element (or its void slot) an explicit `key`. See [Elements, Key Paths & Identity](../families/identity).

### `FAMILIES_NO_STOREY`

A wall or slab has no `Storey` ancestor. IFC requires spatial containment for building elements. A container family is recognised by `archetype: 'storey'`, not by being called `Storey`, so a renamed container that declares none reads as an ordinary group.

**Fix**: Nest geometry-bearing elements under a keyed storey container, and declare `archetype: 'storey'` on it.

### `FAMILIES_UNSUPPORTED_TYPE`

An element's archetype has no spec mapping in the adapter. Nothing is silently dropped from the file. The message reports the archetype it resolved, which is `none` when the family declares one neither directly nor by display-name fallback.

**Fix**: Declare a mapped `archetype` (`storey`, `wall`, `slab`, `column`, `beam`, `roof`, `stair`) or use a fill-role `Door`/`Window`, add a spec route, or keep the element out of the projected subtree.

### `FAMILIES_UNSUPPORTED_FILL` / `FAMILIES_OPENING_OUTSIDE_WALL`

A fill-role element whose archetype is neither `door` nor `window` was placed in `voids`, or an opening was synthesized under a host whose archetype is not `wall` (for example a slab). Wall openings are the mapped case.

**Fix**: Declare `archetype: 'door'` or `'window'` on the filler and `archetype: 'wall'` on the host; use plain voids for anonymous cuts elsewhere.

### `DUPLICATE_STABLE_KEY`

Two elements resolved to the same stable key: one GlobalId claimed twice, which would be an IFC validity break. The check runs before any geometry is built.

**Fix**: Ensure key paths are unique; duplicate sibling keys already throw at `resolve()`, so this usually means two adapters or manual `add*` calls reused a key.

## Next steps

- [Result and Errors](../concepts/result): the type and patterns above
- [Healing & Sewing](../advanced/healing): for the recovery paths
- [Boolean Operations](../tasks/booleans): the most common error source
