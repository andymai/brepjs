import { applyMatrix, ok, err } from 'brepjs';
import type { ValidSolid, Result } from 'brepjs';
import type { AnyBimElement } from '../types/bimTypes.js';
import type { BimError } from '../errors/bimError.js';
import { fromBrepError } from '../errors/bimError.js';
import { placementToMatrix, type FrameInput } from '../import/placement.js';
import { stairFlightToSolid } from './stairFns.js';
import { rampFlightToSolid } from './rampFns.js';

// Applies an (origin, axisX, axisZ) frame to a local solid, returning a fresh
// caller-owned solid. Orthonormal frames use the validity-preserving transform
// path, so the result is a ValidSolid.
function place(solid: ValidSolid, frame: FrameInput): Result<ValidSolid, BimError> {
  const result = applyMatrix(solid, placementToMatrix(frame));
  if (!result.ok) {
    return err(
      fromBrepError(result.error, 'PLACED_GEOMETRY_FAILED', 'Failed to place element geometry')
    );
  }
  return ok(result.value);
}

function disposeAll(solids: readonly ValidSolid[]): void {
  for (const s of solids) s[Symbol.dispose]();
}

export interface PlacedSolidsOptions {
  /**
   * Cumulative frame of the element's containing spatial structure. Element
   * specs and stored arbitrary bodies are relative to that structure; pass its
   * frame here when world coordinates are required.
   */
  readonly parentFrame?: FrameInput | undefined;
}

function placeWithinParent(
  solid: ValidSolid,
  localFrame: FrameInput,
  parentFrame: FrameInput | undefined
): Result<ValidSolid, BimError> {
  const local = place(solid, localFrame);
  if (!local.ok || parentFrame === undefined) return local;
  using localSolid = local.value;
  return place(localSolid, parentFrame);
}

/**
 * Returns each element's geometry transformed to its element-local placement,
 * and optionally through the cumulative frame of its containing spatial
 * structure, as fresh caller-owned solids. Pass `parentFrame` to obtain world
 * coordinates for elements beneath a placed Site, Bridge, Bridge Part, or
 * other spatial structure. **Dispose the returned solids** (e.g. via `using` /
 * `[Symbol.dispose]`) when you own their lifetime — they are independent of the model
 * (`BimModel[Symbol.dispose]` frees only the stored, unplaced `.geometry`). On any
 * failure the solids already built for this call are disposed before the error is
 * returned, so no partial array is leaked.
 *
 * Stairs and ramps carry no element solid (`.geometry` is null), so flight
 * solids are built from `spec.flights` and placed per flight. Curtain walls
 * return placed panels + mullions. Proxy and Earthworks Fill bodies are stored
 * relative to their containing spatial structure, so their body is copied and
 * then transformed by `parentFrame` when supplied. Elements with no solid geometry
 * (doors/windows/groups/spatial) return an empty array.
 */
export function placedSolids(
  el: AnyBimElement,
  options: PlacedSolidsOptions = {}
): Result<readonly ValidSolid[], BimError> {
  const parentFrame = options.parentFrame;
  switch (el.category) {
    case 'WALL':
    case 'SLAB':
    case 'BEAM':
    case 'COLUMN':
    case 'SPACE':
    case 'ROOF':
    case 'FOOTING':
    case 'PILE':
    case 'COVERING':
    case 'RAILING': {
      const placed = placeWithinParent(el.geometry, el.spec, parentFrame);
      if (!placed.ok) return placed;
      return ok([placed.value]);
    }
    case 'STAIR': {
      const out: ValidSolid[] = [];
      for (const flight of el.spec.flights) {
        const built = stairFlightToSolid(flight);
        if (!built.ok) {
          disposeAll(out);
          return err(built.error);
        }
        using local = built.value.solid;
        const placed = placeWithinParent(local, flight, parentFrame);
        if (!placed.ok) {
          disposeAll(out);
          return placed;
        }
        out.push(placed.value);
      }
      return ok(out);
    }
    case 'RAMP': {
      // Ramps mirror stairs: no element solid, one inclined-slab solid per
      // flight, each placed by its own frame.
      const out: ValidSolid[] = [];
      for (const flight of el.spec.flights) {
        const built = rampFlightToSolid(flight);
        if (!built.ok) {
          disposeAll(out);
          return err(built.error);
        }
        using local = built.value.solid;
        const placed = placeWithinParent(local, flight, parentFrame);
        if (!placed.ok) {
          disposeAll(out);
          return placed;
        }
        out.push(placed.value);
      }
      return ok(out);
    }
    case 'PROXY':
    case 'EARTHWORKS_FILL': {
      // No frame on either body spec: identity mints a caller-owned copy, then
      // parentFrame (when supplied) takes the parent-local body into world space.
      const placed = placeWithinParent(
        el.geometry,
        { origin: [0, 0, 0], axisX: [1, 0, 0], axisZ: [0, 0, 1] },
        parentFrame
      );
      if (!placed.ok) return placed;
      return ok([placed.value]);
    }
    case 'CURTAIN_WALL': {
      const out: ValidSolid[] = [];
      for (const c of [...el.geometry.panels, ...el.geometry.mullions]) {
        // Two-level: place by the component-local origin, then by the wall frame.
        const componentLocal = place(c.solid, {
          origin: c.origin,
          axisX: [1, 0, 0],
          axisZ: [0, 0, 1],
        });
        if (!componentLocal.ok) {
          disposeAll(out);
          return componentLocal;
        }
        using local = componentLocal.value;
        const placed = placeWithinParent(local, el.spec, parentFrame);
        if (!placed.ok) {
          disposeAll(out);
          return placed;
        }
        out.push(placed.value);
      }
      return ok(out);
    }
    default:
      return ok([]);
  }
}
