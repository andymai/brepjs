import { applyMatrix } from 'brepjs';
import type { ValidSolid } from 'brepjs';
import type { AnyBimElement } from '../types/bimTypes.js';
import { placementToMatrix, type FrameInput } from '../import/placement.js';
import { stairFlightToSolid } from './stairFns.js';

// Applies an (origin, axisX, axisZ) frame to a local solid, returning a fresh
// caller-owned solid. Orthonormal frames use the validity-preserving transform
// path, so the result is a ValidSolid.
function place(solid: ValidSolid, frame: FrameInput): ValidSolid {
  const result = applyMatrix(solid, placementToMatrix(frame));
  if (!result.ok) {
    throw new Error(`placedSolids: failed to place element geometry: ${result.error.message}`);
  }
  return result.value;
}

/**
 * Returns each element's geometry transformed to its world placement, as fresh
 * caller-owned solids. **Dispose them** (e.g. via `using` or `[Symbol.dispose]`);
 * they are independent of the model's lifetime — `BimModel[Symbol.dispose]` only
 * frees the stored (local) `.geometry`.
 *
 * Stairs carry no element solid (`.geometry` is null), so their flight solids are
 * built from `spec.flights` and placed per flight. Curtain walls are returned as
 * placed panels + mullions. Elements with no solid geometry (doors/windows/ramps/
 * groups/spatial) return an empty array. The unplaced `.geometry` is unchanged.
 */
export function placedSolids(el: AnyBimElement): readonly ValidSolid[] {
  switch (el.category) {
    case 'WALL':
    case 'SLAB':
    case 'BEAM':
    case 'COLUMN':
    case 'SPACE':
    case 'ROOF':
    case 'FOOTING':
    case 'PILE':
    case 'RAILING':
      return [place(el.geometry, el.spec)];
    case 'STAIR': {
      const out: ValidSolid[] = [];
      for (const flight of el.spec.flights) {
        const built = stairFlightToSolid(flight);
        if (!built.ok) {
          throw new Error(`placedSolids: stair flight geometry failed: ${built.error.message}`);
        }
        using local = built.value.solid;
        out.push(place(local, flight));
      }
      return out;
    }
    case 'CURTAIN_WALL': {
      const out: ValidSolid[] = [];
      for (const c of [...el.geometry.panels, ...el.geometry.mullions]) {
        // Two-level: place by the component-local origin, then by the wall frame.
        using componentLocal = place(c.solid, { origin: c.origin, axisX: [1, 0, 0], axisZ: [0, 0, 1] });
        out.push(place(componentLocal, el.spec));
      }
      return out;
    }
    default:
      return [];
  }
}
