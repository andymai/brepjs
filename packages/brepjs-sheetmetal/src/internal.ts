import { type Solid, type Vec3, isSolid, getSolids } from 'brepjs';
import type { FlatSide } from './types.js';

/**
 * OCCT boolean fuse returns a compound wrapping the unioned solid. Extract the
 * single solid so a part's cached shape is a true `Solid` (clean STEP/GLB
 * export); fall back to the compound if the union produced multiple bodies.
 */
export function normalizeSolid(shape: Solid): Solid {
  if (isSolid(shape)) return shape;
  const solids = getSolids(shape);
  const only = solids.length === 1 ? solids[0] : undefined;
  return only ?? shape;
}

/**
 * Fallback develop side for a hand-built flange whose `baseEdge.side` is omitted:
 * derive it from the recorded bend axis. An axis along +Y (|axisDir.y|>0.5) is an
 * east flange that develops in +X (`xmax`); an axis along +X is a north flange
 * developing in +Y (`ymax`). This preserves the original axis-only unfold
 * heuristic for external fixtures predating the explicit `side` field; parts from
 * {@link authorPart} always set `side`, so this only kicks in for the legacy path.
 */
export function sideFromAxisDir(axisDir: Vec3): FlatSide | undefined {
  if (Math.abs(axisDir[1]) > 0.5) return 'xmax';
  if (Math.abs(axisDir[0]) > 0.5) return 'ymax';
  return undefined;
}
