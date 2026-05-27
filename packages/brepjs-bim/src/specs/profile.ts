import { z } from 'zod';
import type { BimError } from '../errors/bimError.js';
import { specError } from '../errors/bimError.js';
import type { Result } from 'brepjs';
import { ok, err } from 'brepjs';

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

export type Profile = RectangularProfile | CircularProfile | IShapeProfile;

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

export const ProfileSchema = z.discriminatedUnion('kind', [
  RectangularProfileSchema,
  CircularProfileSchema,
  IShapeProfileSchema,
]);

export function parseProfile(input: unknown): Result<Profile, BimError> {
  const result = ProfileSchema.safeParse(input);
  if (!result.success) {
    return err(specError('INVALID_PROFILE', result.error.message, result.error));
  }
  const profile = result.data as Profile;
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
