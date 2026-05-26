import { polygon, extrude, isValidSolid } from 'brepjs';
import type { ValidSolid, Result } from 'brepjs';
import { ok, err } from 'brepjs';
import type { WallOpeningSpec } from '../types/bimTypes.js';
import type { BimError } from '../errors/bimError.js';
import { specError, fromBrepError, geometryError } from '../errors/bimError.js';

// Overshoot the wall depth so the boolean cut tool has no coplanar faces with the
// wall body — OCCT booleans are flaky when tool faces touch base faces exactly.
const EPSILON_MM = 1;

// Build the boolean tool used to subtract an opening from a wall.
//
// The wall is modeled in local coords with the profile in the YZ plane extruded
// along +X (see wallFns.ts). The opening tool is a box at:
//   X ∈ [offsetAlongWall, offsetAlongWall + width]
//   Y ∈ [-ε, thickness + ε]   ← overshoots the wall depth on both sides
//   Z ∈ [offsetFromFloor, offsetFromFloor + height]
export function openingToSolid(
  spec: WallOpeningSpec,
  wallThickness: number
): Result<ValidSolid, BimError> {
  if (spec.width <= 0) {
    return err(specError('OPENING_ZERO_WIDTH', 'Opening width must be positive'));
  }
  if (spec.height <= 0) {
    return err(specError('OPENING_ZERO_HEIGHT', 'Opening height must be positive'));
  }
  if (wallThickness <= 0) {
    return err(
      specError('OPENING_ZERO_WALL_THICKNESS', 'Wall thickness must be positive')
    );
  }

  const x0 = spec.offsetAlongWall;
  const yLow = -EPSILON_MM;
  const yHigh = wallThickness + EPSILON_MM;
  const zLow = spec.offsetFromFloor;
  const zHigh = spec.offsetFromFloor + spec.height;

  const profileResult = polygon([
    [x0, yLow, zLow],
    [x0, yHigh, zLow],
    [x0, yHigh, zHigh],
    [x0, yLow, zHigh],
  ]);
  if (!profileResult.ok) {
    return err(
      fromBrepError(
        profileResult.error,
        'OPENING_PROFILE_FAILED',
        'Failed to create opening profile'
      )
    );
  }

  using profile = profileResult.value;
  const solidResult = extrude(profile, [spec.width, 0, 0]);
  if (!solidResult.ok) {
    return err(
      fromBrepError(
        solidResult.error,
        'OPENING_EXTRUDE_FAILED',
        'Failed to extrude opening profile'
      )
    );
  }

  const solid = solidResult.value;
  if (!isValidSolid(solid)) {
    solid[Symbol.dispose]();
    return err(
      geometryError('OPENING_INVALID_SOLID', 'Extruded opening solid failed validity check')
    );
  }
  return ok(solid);
}
