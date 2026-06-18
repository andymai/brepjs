import { polygon, extrude, convexHull, isValidSolid } from 'brepjs';
import type { ValidSolid, Result, Solid, Vec3 } from 'brepjs';
import { ok, err } from 'brepjs';
import type { RoofSpec } from '../specs/roofSpec.js';
import type { BimError } from '../errors/bimError.js';
import { specError, fromBrepError, geometryError } from '../errors/bimError.js';

const DEG2RAD = Math.PI / 180;

// Validates a freshly-built solid, branding + owning it on success or disposing
// + erroring on failure. Used for every roof shape because some upstream ops
// (skeletonRoof's primary path, cut/revolve) return un-revalidated handles.
function gate(solid: Solid, code: string): Result<ValidSolid, BimError> {
  if (!isValidSolid(solid)) {
    solid[Symbol.dispose]();
    return err(geometryError(code, 'Roof solid failed validity check'));
  }
  return ok(solid);
}

// Flat slab (current behavior): length × width footprint extruded +Z by thickness.
function flatRoof(spec: RoofSpec): Result<ValidSolid, BimError> {
  const { length, width, thickness } = spec;
  const face = polygon([
    [0, 0, 0],
    [length, 0, 0],
    [length, width, 0],
    [0, width, 0],
  ]);
  if (!face.ok) return err(fromBrepError(face.error, 'ROOF_PROFILE_FAILED', 'Failed to create roof profile'));
  using profile = face.value;
  const solid = extrude(profile, [0, 0, thickness]);
  if (!solid.ok) return err(fromBrepError(solid.error, 'ROOF_EXTRUDE_FAILED', 'Failed to extrude roof profile'));
  return gate(solid.value, 'ROOF_INVALID_SOLID');
}

// Shed: a right-trapezoid in the local Y-Z plane swept +X by length.
function shedRoof(spec: RoofSpec, pitch: number): Result<ValidSolid, BimError> {
  const { length, width, thickness } = spec;
  const rise = width * Math.tan(pitch * DEG2RAD);
  const face = polygon([
    [0, 0, 0],
    [0, width, 0],
    [0, width, thickness + rise],
    [0, 0, thickness],
  ]);
  if (!face.ok) return err(fromBrepError(face.error, 'ROOF_PROFILE_FAILED', 'Failed to create shed profile'));
  using profile = face.value;
  const solid = extrude(profile, [length, 0, 0]);
  if (!solid.ok) return err(fromBrepError(solid.error, 'ROOF_EXTRUDE_FAILED', 'Failed to extrude shed roof'));
  return gate(solid.value, 'ROOF_INVALID_SOLID');
}

// Gable: a house-pentagon in the local Y-Z plane swept +X by length.
function gableRoof(spec: RoofSpec, pitch: number): Result<ValidSolid, BimError> {
  const { length, width, thickness } = spec;
  const ridge = (width / 2) * Math.tan(pitch * DEG2RAD);
  const face = polygon([
    [0, 0, 0],
    [0, width, 0],
    [0, width, thickness],
    [0, width / 2, thickness + ridge],
    [0, 0, thickness],
  ]);
  if (!face.ok) return err(fromBrepError(face.error, 'ROOF_PROFILE_FAILED', 'Failed to create gable profile'));
  using profile = face.value;
  const solid = extrude(profile, [length, 0, 0]);
  if (!solid.ok) return err(fromBrepError(solid.error, 'ROOF_EXTRUDE_FAILED', 'Failed to extrude gable roof'));
  return gate(solid.value, 'ROOF_INVALID_SOLID');
}

// Hip: a hip roof over a rectangle is a convex solid, so the convex hull of the
// four base corners plus the two ridge endpoints reconstructs it exactly as a
// genuine closed solid. (Core roof() returns an open shell under occt-wasm, so
// it is not usable for a measurable IfcRoof body.) The ridge runs along the
// longer side, inset from each end by half the shorter side; a square footprint
// collapses the ridge to a single apex (a pyramid), still a valid hull.
function hipRoof(spec: RoofSpec, pitch: number): Result<ValidSolid, BimError> {
  const { length: l, width: w } = spec;
  const tan = Math.tan(pitch * DEG2RAD);
  const base: Vec3[] = [
    [0, 0, 0],
    [l, 0, 0],
    [l, w, 0],
    [0, w, 0],
  ];
  let ridge: Vec3[];
  if (l >= w) {
    const h = (w / 2) * tan;
    ridge = [
      [w / 2, w / 2, h],
      [l - w / 2, w / 2, h],
    ];
  } else {
    const h = (l / 2) * tan;
    ridge = [
      [l / 2, l / 2, h],
      [l / 2, w - l / 2, h],
    ];
  }
  const solid = convexHull([...base, ...ridge]);
  if (!solid.ok) return err(fromBrepError(solid.error, 'ROOF_HIP_FAILED', 'Failed to build hip roof'));
  return gate(solid.value, 'ROOF_INVALID_SOLID');
}

// Dome: a faceted hemisphere — the convex hull of points sampled on a hemisphere
// of radius min(L,W)/2 centred on the footprint. A boolean sphere∩box produces a
// solid whose spherical surface HANGS the occt-wasm mesher, so the dome is built
// from planar facets (like the hip) to mesh reliably.
function domeRoof(spec: RoofSpec): Result<ValidSolid, BimError> {
  const { length, width } = spec;
  const r = Math.min(length, width) / 2;
  const cx = length / 2;
  const cy = width / 2;
  const segments = 24;
  const rings = [0, 0.4, 0.7, 0.9];
  const pts: Vec3[] = [];
  for (const h of rings) {
    const z = r * h;
    const ringR = r * Math.sqrt(1 - h * h);
    for (let i = 0; i < segments; i++) {
      const a = (2 * Math.PI * i) / segments;
      pts.push([cx + ringR * Math.cos(a), cy + ringR * Math.sin(a), z]);
    }
  }
  pts.push([cx, cy, r]);
  const solid = convexHull(pts);
  if (!solid.ok) return err(fromBrepError(solid.error, 'ROOF_DOME_FAILED', 'Failed to build dome roof'));
  return gate(solid.value, 'ROOF_INVALID_SOLID');
}

// Returned solid is unplaced template geometry in the local frame; origin/axisX/
// axisZ are applied downstream (IFC writer / placedSolids accessor). When `pitch`
// is absent the roof is a flat slab regardless of predefinedType (backward-
// compatible); when present the solid is shaped for the predefinedType.
//
// `thickness` is the slab/eave depth and is used by the FLAT, SHED and GABLE
// builders (which extrude a profile of that depth). HIP and DOME are intentionally
// solid masses filling the footprint from z=0 up to the apex — they have no slab
// depth, so they do not consume `thickness` (it is still validated as positive for
// a consistent spec).
export function roofToSolid(spec: RoofSpec): Result<ValidSolid, BimError> {
  if (spec.length <= 0) return err(specError('ROOF_ZERO_LENGTH', 'Roof length must be positive'));
  if (spec.width <= 0) return err(specError('ROOF_ZERO_WIDTH', 'Roof width must be positive'));
  if (spec.thickness <= 0) return err(specError('ROOF_ZERO_THICKNESS', 'Roof thickness must be positive'));

  if (spec.pitch === undefined) return flatRoof(spec);
  switch (spec.predefinedType) {
    case 'SHED_ROOF':
      return shedRoof(spec, spec.pitch);
    case 'GABLE_ROOF':
      return gableRoof(spec, spec.pitch);
    case 'HIP_ROOF':
      return hipRoof(spec, spec.pitch);
    case 'DOME_ROOF':
      return domeRoof(spec);
    default:
      return flatRoof(spec);
  }
}
