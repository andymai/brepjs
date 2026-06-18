import { applyMatrix, ok, err } from 'brepjs';
import type { ValidSolid, Result } from 'brepjs';
import type { AnyBimElement } from '../types/bimTypes.js';
import type { BimError } from '../errors/bimError.js';
import { fromBrepError } from '../errors/bimError.js';
import { placementToMatrix, type FrameInput } from '../import/placement.js';
import { stairFlightToSolid } from './stairFns.js';

// Applies an (origin, axisX, axisZ) frame to a local solid, returning a fresh
// caller-owned solid. Orthonormal frames use the validity-preserving transform
// path, so the result is a ValidSolid.
function place(solid: ValidSolid, frame: FrameInput): Result<ValidSolid, BimError> {
  const result = applyMatrix(solid, placementToMatrix(frame));
  if (!result.ok) {
    return err(fromBrepError(result.error, 'PLACED_GEOMETRY_FAILED', 'Failed to place element geometry'));
  }
  return ok(result.value);
}

function disposeAll(solids: readonly ValidSolid[]): void {
  for (const s of solids) s[Symbol.dispose]();
}

/**
 * Returns each element's geometry transformed to its world placement, as fresh
 * caller-owned solids, wrapped in a `Result` (Layer-2 code prefers `Result` over
 * throwing). **Dispose the returned solids** (e.g. via `using` / `[Symbol.dispose]`)
 * when you own their lifetime — they are independent of the model
 * (`BimModel[Symbol.dispose]` frees only the stored, unplaced `.geometry`). On any
 * failure the solids already built for this call are disposed before the error is
 * returned, so no partial array is leaked.
 *
 * Stairs carry no element solid (`.geometry` is null), so flight solids are built
 * from `spec.flights` and placed per flight. Curtain walls return placed panels +
 * mullions. Elements with no solid geometry (doors/windows/ramps/groups/spatial)
 * return an empty array.
 */
export function placedSolids(el: AnyBimElement): Result<readonly ValidSolid[], BimError> {
  switch (el.category) {
    case 'WALL':
    case 'SLAB':
    case 'BEAM':
    case 'COLUMN':
    case 'SPACE':
    case 'ROOF':
    case 'FOOTING':
    case 'PILE':
    case 'RAILING': {
      const placed = place(el.geometry, el.spec);
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
        const placed = place(local, flight);
        if (!placed.ok) {
          disposeAll(out);
          return placed;
        }
        out.push(placed.value);
      }
      return ok(out);
    }
    case 'CURTAIN_WALL': {
      const out: ValidSolid[] = [];
      for (const c of [...el.geometry.panels, ...el.geometry.mullions]) {
        // Two-level: place by the component-local origin, then by the wall frame.
        const componentLocal = place(c.solid, { origin: c.origin, axisX: [1, 0, 0], axisZ: [0, 0, 1] });
        if (!componentLocal.ok) {
          disposeAll(out);
          return componentLocal;
        }
        using local = componentLocal.value;
        const placed = place(local, el.spec);
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
