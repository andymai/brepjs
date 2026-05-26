import { polygon, extrude, isValidSolid } from 'brepjs';
import type { ValidSolid, Result } from 'brepjs';
import { ok, err } from 'brepjs';
import type { SlabOpeningSpec } from '../types/bimTypes.js';
import type { BimError } from '../errors/bimError.js';
import { specError, fromBrepError, geometryError } from '../errors/bimError.js';

// Overshoot the slab thickness so the boolean cut tool has no coplanar faces
// with the slab body — OCCT booleans are flaky when tool faces touch base
// faces exactly.
const EPSILON_MM = 1;

// Build the boolean tool used to subtract a vertical through-hole from a slab.
//
// The slab is modeled in local coords with the footprint in the XY plane
// extruded along +Z (see slabFns.ts). The opening tool is a box at:
//   X ∈ [offsetX, offsetX + sizeX]
//   Y ∈ [offsetY, offsetY + sizeY]
//   Z ∈ [-ε, thickness + ε]   ← overshoots the slab depth on both sides
export function slabOpeningToSolid(
  spec: SlabOpeningSpec,
  slabThickness: number
): Result<ValidSolid, BimError> {
  if (spec.sizeX <= 0) {
    return err(specError('SLAB_OPENING_ZERO_SIZE_X', 'Slab opening sizeX must be positive'));
  }
  if (spec.sizeY <= 0) {
    return err(specError('SLAB_OPENING_ZERO_SIZE_Y', 'Slab opening sizeY must be positive'));
  }
  if (slabThickness <= 0) {
    return err(
      specError('SLAB_OPENING_ZERO_SLAB_THICKNESS', 'Slab thickness must be positive')
    );
  }

  const x0 = spec.offsetX;
  const x1 = spec.offsetX + spec.sizeX;
  const y0 = spec.offsetY;
  const y1 = spec.offsetY + spec.sizeY;
  const z0 = -EPSILON_MM;

  const profileResult = polygon([
    [x0, y0, z0],
    [x1, y0, z0],
    [x1, y1, z0],
    [x0, y1, z0],
  ]);
  if (!profileResult.ok) {
    return err(
      fromBrepError(
        profileResult.error,
        'SLAB_OPENING_PROFILE_FAILED',
        'Failed to create slab opening profile'
      )
    );
  }

  using profile = profileResult.value;
  const solidResult = extrude(profile, [0, 0, slabThickness + 2 * EPSILON_MM]);
  if (!solidResult.ok) {
    return err(
      fromBrepError(
        solidResult.error,
        'SLAB_OPENING_EXTRUDE_FAILED',
        'Failed to extrude slab opening profile'
      )
    );
  }

  const solid = solidResult.value;
  if (!isValidSolid(solid)) {
    solid[Symbol.dispose]();
    return err(
      geometryError('SLAB_OPENING_INVALID_SOLID', 'Extruded slab opening solid failed validity check')
    );
  }
  return ok(solid);
}
