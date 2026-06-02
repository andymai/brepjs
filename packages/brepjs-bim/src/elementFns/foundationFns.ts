import { polygon, extrude, isValidSolid } from 'brepjs';
import type { ValidSolid, Result } from 'brepjs';
import { ok, err } from 'brepjs';
import type { FootingSpec, PileSpec } from '../specs/foundationSpec.js';
import type { BimError } from '../errors/bimError.js';
import { specError, fromBrepError, geometryError } from '../errors/bimError.js';
import { profileToPolygon } from './profileFns.js';
import { isExtendedProfile } from '../specs/profile.js';
import { extendedProfileToFace } from '../specs/profilesExtended.js';

// Returned solid is unplaced template geometry: footprint rectangle in the
// global XY plane (length × width), extruded along +Z by thickness.
// origin/axisX/axisZ are applied by the IFC layer via IfcLocalPlacement.
export function footingToSolid(spec: FootingSpec): Result<ValidSolid, BimError> {
  if (spec.length <= 0) {
    return err(specError('FOOTING_ZERO_LENGTH', 'Footing length must be positive'));
  }
  if (spec.width <= 0) {
    return err(specError('FOOTING_ZERO_WIDTH', 'Footing width must be positive'));
  }
  if (spec.thickness <= 0) {
    return err(specError('FOOTING_ZERO_THICKNESS', 'Footing thickness must be positive'));
  }

  const { length, width, thickness } = spec;

  const profileResult = polygon([
    [0, 0, 0],
    [length, 0, 0],
    [length, width, 0],
    [0, width, 0],
  ]);
  if (!profileResult.ok) {
    return err(fromBrepError(profileResult.error, 'FOOTING_PROFILE_FAILED', 'Failed to create footing profile'));
  }

  using profile = profileResult.value;
  const solidResult = extrude(profile, [0, 0, thickness]);
  if (!solidResult.ok) {
    return err(fromBrepError(solidResult.error, 'FOOTING_EXTRUDE_FAILED', 'Failed to extrude footing profile'));
  }

  const solid = solidResult.value;
  if (!isValidSolid(solid)) {
    solid[Symbol.dispose]();
    return err(geometryError('FOOTING_INVALID_SOLID', 'Extruded footing solid failed validity check'));
  }
  return ok(solid);
}

// Returned solid is unplaced template geometry: profile in the global XY plane
// (cross-section centered on the local origin), extruded along +Z by length.
// origin/axisX/axisZ are applied by the IFC layer via IfcLocalPlacement.
export function pileToSolid(spec: PileSpec): Result<ValidSolid, BimError> {
  if (spec.length <= 0) {
    return err(specError('PILE_ZERO_LENGTH', 'Pile length must be positive'));
  }

  // Extended/hollow profiles have no single outer polygon; build the face (with
  // voids) directly and extrude along +Z like the core path.
  if (isExtendedProfile(spec.profile)) {
    const faceResult = extendedProfileToFace(spec.profile);
    if (!faceResult.ok) return err(faceResult.error);
    using face = faceResult.value;
    const extResult = extrude(face, [0, 0, spec.length]);
    if (!extResult.ok) {
      return err(fromBrepError(extResult.error, 'PILE_EXTRUDE_FAILED', 'Failed to extrude pile profile'));
    }
    const extSolid = extResult.value;
    if (!isValidSolid(extSolid)) {
      extSolid[Symbol.dispose]();
      return err(geometryError('PILE_INVALID_SOLID', 'Extruded pile solid failed validity check'));
    }
    return ok(extSolid);
  }

  const profilePtsResult = profileToPolygon(spec.profile);
  if (!profilePtsResult.ok) return err(profilePtsResult.error);
  const profilePts = profilePtsResult.value;

  const profileResult = polygon(profilePts);
  if (!profileResult.ok) {
    return err(fromBrepError(profileResult.error, 'PILE_PROFILE_FAILED', 'Failed to create pile profile'));
  }

  using profile = profileResult.value;
  const solidResult = extrude(profile, [0, 0, spec.length]);
  if (!solidResult.ok) {
    return err(fromBrepError(solidResult.error, 'PILE_EXTRUDE_FAILED', 'Failed to extrude pile profile'));
  }

  const solid = solidResult.value;
  if (!isValidSolid(solid)) {
    solid[Symbol.dispose]();
    return err(geometryError('PILE_INVALID_SOLID', 'Extruded pile solid failed validity check'));
  }
  return ok(solid);
}
