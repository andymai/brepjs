import { z } from 'zod';
import type { BimError } from '../errors/bimError.js';
import { specError } from '../errors/bimError.js';
import type { Result } from 'brepjs';
import { ok, err } from 'brepjs';
import type { ExtendedProfile } from './profilesExtended.js';
import { extendedProfileToFace } from './profilesExtended.js';

// Cross-section profile for an extruded structural element. All dimensions in mm.
// Profile lives in the local XY plane; extrusion happens along the element's
// extrusion axis (see BeamSpec / ColumnSpec).

export type RectangularProfile = {
  readonly kind: 'RECTANGULAR';
  readonly width: number;   // X extent
  readonly height: number;  // Y extent
};

export type CircularProfile = {
  readonly kind: 'CIRCULAR';
  readonly radius: number;
};

// IfcIShapeProfileDef parameters: outer bounding box + flange/web thicknesses.
//   overallWidth: outer X extent (flange width)
//   overallDepth: outer Y extent (total height)
//   flangeThickness: top and bottom flange thickness
//   webThickness: vertical web thickness (centered)
export type IShapeProfile = {
  readonly kind: 'I_BEAM';
  readonly overallWidth: number;
  readonly overallDepth: number;
  readonly flangeThickness: number;
  readonly webThickness: number;
};

// Core parametric profiles handled directly by profileToPolygon (brepjs solids)
// and writeProfile (IFC profile defs).
export type CoreProfile = RectangularProfile | CircularProfile | IShapeProfile;

// A profile is either a core parametric profile or one of the extended profiles
// (L/T/U/Z/C shapes, asymmetric I, ellipse, trapezium, hollow sections,
// arbitrary outlines). Extended profiles are materialised as faces via
// extendedProfileToFace() and emitted to IFC via writeExtendedProfileDef().
export type Profile = CoreProfile | ExtendedProfile;

const EXTENDED_PROFILE_KINDS = [
  'L_SHAPE',
  'T_SHAPE',
  'U_SHAPE',
  'Z_SHAPE',
  'C_SHAPE',
  'ASYMMETRIC_I',
  'ELLIPSE',
  'TRAPEZIUM',
  'RECTANGLE_HOLLOW',
  'CIRCLE_HOLLOW',
  'ARBITRARY_CLOSED',
  'ARBITRARY_WITH_VOIDS',
] as const;

const EXTENDED_PROFILE_KIND_SET: ReadonlySet<string> = new Set(EXTENDED_PROFILE_KINDS);

/** Narrows a profile to the extended (non-core) variants. */
export function isExtendedProfile(profile: Profile): profile is ExtendedProfile {
  return EXTENDED_PROFILE_KIND_SET.has(profile.kind);
}

const RectangularProfileSchema = z.object({
  kind: z.literal('RECTANGULAR'),
  width: z.number().positive(),
  height: z.number().positive(),
});

const CircularProfileSchema = z.object({
  kind: z.literal('CIRCULAR'),
  radius: z.number().positive(),
});

const IShapeProfileSchema = z.object({
  kind: z.literal('I_BEAM'),
  overallWidth: z.number().positive(),
  overallDepth: z.number().positive(),
  flangeThickness: z.number().positive(),
  webThickness: z.number().positive(),
});

const CoreProfileSchema = z.discriminatedUnion('kind', [
  RectangularProfileSchema,
  CircularProfileSchema,
  IShapeProfileSchema,
]);

const Pt2Schema = z.tuple([z.number(), z.number()]);

const ExtendedProfileSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('L_SHAPE'),
    depth: z.number().positive(),
    width: z.number().positive(),
    legThickness: z.number().positive(),
    filletRadius: z.number().positive().optional(),
  }),
  z.object({
    kind: z.literal('T_SHAPE'),
    depth: z.number().positive(),
    flangeWidth: z.number().positive(),
    webThickness: z.number().positive(),
    flangeThickness: z.number().positive(),
    filletRadius: z.number().positive().optional(),
  }),
  z.object({
    kind: z.literal('U_SHAPE'),
    depth: z.number().positive(),
    flangeWidth: z.number().positive(),
    webThickness: z.number().positive(),
    flangeThickness: z.number().positive(),
  }),
  z.object({
    kind: z.literal('Z_SHAPE'),
    depth: z.number().positive(),
    flangeWidth: z.number().positive(),
    webThickness: z.number().positive(),
    flangeThickness: z.number().positive(),
  }),
  z.object({
    kind: z.literal('C_SHAPE'),
    depth: z.number().positive(),
    width: z.number().positive(),
    wallThickness: z.number().positive(),
    girth: z.number().positive(),
    internalFilletRadius: z.number().positive().optional(),
  }),
  z.object({
    kind: z.literal('ASYMMETRIC_I'),
    overallDepth: z.number().positive(),
    webThickness: z.number().positive(),
    topFlangeWidth: z.number().positive(),
    topFlangeThickness: z.number().positive(),
    bottomFlangeWidth: z.number().positive(),
    bottomFlangeThickness: z.number().positive(),
  }),
  z.object({
    kind: z.literal('ELLIPSE'),
    semiAxis1: z.number().positive(),
    semiAxis2: z.number().positive(),
  }),
  z.object({
    kind: z.literal('TRAPEZIUM'),
    bottomXDim: z.number().positive(),
    topXDim: z.number().positive(),
    yDim: z.number().positive(),
    topXOffset: z.number(),
  }),
  z.object({
    kind: z.literal('RECTANGLE_HOLLOW'),
    xDim: z.number().positive(),
    yDim: z.number().positive(),
    wallThickness: z.number().positive(),
    innerFilletRadius: z.number().positive().optional(),
    outerFilletRadius: z.number().positive().optional(),
  }),
  z.object({
    kind: z.literal('CIRCLE_HOLLOW'),
    radius: z.number().positive(),
    wallThickness: z.number().positive(),
  }),
  z.object({
    kind: z.literal('ARBITRARY_CLOSED'),
    points: z.array(Pt2Schema).min(3),
  }),
  z.object({
    kind: z.literal('ARBITRARY_WITH_VOIDS'),
    outerPoints: z.array(Pt2Schema).min(3),
    voids: z.array(z.array(Pt2Schema).min(3)),
  }),
]);

export const ProfileSchema = z.union([CoreProfileSchema, ExtendedProfileSchema]);

// Feasibility guards for extended profiles, mirroring the geometric checks in
// extendedProfileToFace() so an invalid section is rejected at parse time rather
// than producing degenerate geometry downstream.
function validateExtendedProfile(profile: ExtendedProfile): BimError | null {
  switch (profile.kind) {
    case 'L_SHAPE':
      if (profile.legThickness >= profile.width || profile.legThickness >= profile.depth) {
        return specError('INVALID_PROFILE', 'L_SHAPE legThickness must be smaller than width and depth');
      }
      return null;
    case 'T_SHAPE':
      if (profile.flangeThickness >= profile.depth) {
        return specError('INVALID_PROFILE', 'T_SHAPE flangeThickness must be less than depth');
      }
      if (profile.webThickness >= profile.flangeWidth) {
        return specError('INVALID_PROFILE', 'T_SHAPE webThickness must be less than flangeWidth');
      }
      return null;
    case 'U_SHAPE':
    case 'Z_SHAPE':
      if (2 * profile.flangeThickness >= profile.depth) {
        return specError('INVALID_PROFILE', `${profile.kind} flangeThickness × 2 must be less than depth`);
      }
      if (profile.webThickness >= profile.flangeWidth) {
        return specError('INVALID_PROFILE', `${profile.kind} webThickness must be less than flangeWidth`);
      }
      return null;
    case 'C_SHAPE':
      if (2 * profile.wallThickness >= profile.width || 2 * profile.wallThickness >= profile.depth) {
        return specError('INVALID_PROFILE', 'C_SHAPE wallThickness × 2 must be less than width and depth');
      }
      if (profile.girth >= profile.depth / 2 || profile.girth <= profile.wallThickness) {
        return specError('INVALID_PROFILE', 'C_SHAPE girth must exceed wallThickness and be less than depth/2');
      }
      return null;
    case 'ASYMMETRIC_I':
      if (profile.topFlangeThickness + profile.bottomFlangeThickness >= profile.overallDepth) {
        return specError('INVALID_PROFILE', 'ASYMMETRIC_I flange thicknesses must sum to less than overallDepth');
      }
      if (profile.webThickness >= profile.topFlangeWidth || profile.webThickness >= profile.bottomFlangeWidth) {
        return specError('INVALID_PROFILE', 'ASYMMETRIC_I webThickness must be less than both flange widths');
      }
      return null;
    case 'RECTANGLE_HOLLOW':
      if (2 * profile.wallThickness >= profile.xDim || 2 * profile.wallThickness >= profile.yDim) {
        return specError('INVALID_PROFILE', 'RECTANGLE_HOLLOW wallThickness × 2 must be less than xDim and yDim');
      }
      return null;
    case 'CIRCLE_HOLLOW':
      if (profile.wallThickness >= profile.radius) {
        return specError('INVALID_PROFILE', 'CIRCLE_HOLLOW wallThickness must be less than radius');
      }
      return null;
    case 'ELLIPSE':
    case 'TRAPEZIUM':
    case 'ARBITRARY_CLOSED':
    case 'ARBITRARY_WITH_VOIDS':
      return null;
  }
}

export function parseProfile(input: unknown): Result<Profile, BimError> {
  const result = ProfileSchema.safeParse(input);
  if (!result.success) {
    return err(specError('INVALID_PROFILE', result.error.message, result.error));
  }
  const profile = result.data as Profile;
  if (isExtendedProfile(profile)) {
    const invalid = validateExtendedProfile(profile);
    if (invalid !== null) return err(invalid);
    return ok(profile);
  }
  if (profile.kind === 'I_BEAM') {
    if (2 * profile.flangeThickness >= profile.overallDepth) {
      return err(specError(
        'INVALID_PROFILE',
        'I-beam flangeThickness × 2 must be less than overallDepth'
      ));
    }
    if (profile.webThickness >= profile.overallWidth) {
      return err(specError(
        'INVALID_PROFILE',
        'I-beam webThickness must be less than overallWidth'
      ));
    }
  }
  return ok(profile);
}

// Re-export so callers building beam/column/pile geometry from an extended
// profile can materialise its face. Core profiles continue to use
// profileToPolygon(); extended profiles flow through extendedProfileToFace().
export { extendedProfileToFace };
