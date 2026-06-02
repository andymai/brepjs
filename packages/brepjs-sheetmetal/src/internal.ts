import { type Solid, type Vec3, isSolid, getSolids } from 'brepjs';

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

/** Which way a flange develops in the flat pattern, from its recorded bend axis. */
export type RunDir = 'east' | 'north';

/**
 * Classify a bend's run direction from its recorded axis: an axis along +Y
 * (|axisDir.y|>0.5) belongs to an east flange (develops in +X); an axis along
 * +X belongs to a north flange (develops in +Y). Shared by the unfold and the
 * bend report so their layouts agree.
 */
export function classifyRunDir(axisDir: Vec3): RunDir | undefined {
  if (Math.abs(axisDir[1]) > 0.5) return 'east';
  if (Math.abs(axisDir[0]) > 0.5) return 'north';
  return undefined;
}
