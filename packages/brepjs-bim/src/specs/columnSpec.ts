import { z } from 'zod';
import type { BimError } from '../errors/bimError.js';
import { specError } from '../errors/bimError.js';
import type { Result } from 'brepjs';
import { ok, err } from 'brepjs';
import type { Profile } from './profile.js';
import { ProfileSchema, parseProfile } from './profile.js';

export type ColumnPredefinedType = 'COLUMN' | 'PILASTER' | 'NOTDEFINED';

// A vertical column: profile extruded along axisZ by height.
// All dimensions in mm. axisZ defines the extrusion direction (typically up),
// axisX defines the profile's "X" orientation in world space.
export interface ColumnSpec {
  readonly height: number;
  readonly profile: Profile;
  readonly origin: [number, number, number];
  readonly axisX: [number, number, number];
  readonly axisZ: [number, number, number];
  readonly predefinedType?: ColumnPredefinedType | undefined;
  readonly materialName: string;

  readonly isExternal?: boolean | undefined;
  readonly loadBearing?: boolean | undefined;
  readonly fireRating?: string | undefined;
  readonly acousticRating?: string | undefined;
  readonly thermalTransmittance?: number | undefined;

  readonly manufacturerName?: string | undefined;
  readonly manufacturerModel?: string | undefined;
  readonly manufacturerProductionYear?: number | undefined;

  readonly customProperties?:
    | Readonly<Record<string, Readonly<Record<string, string | number | boolean>>>>
    | undefined;
}

const unitVec = z.tuple([z.number(), z.number(), z.number()]).refine(
  (v) => Math.abs(v[0] ** 2 + v[1] ** 2 + v[2] ** 2 - 1) < 1e-6,
  { message: 'must be a unit vector' }
);

const ColumnSpecSchema = z.object({
  height: z.number().positive(),
  profile: ProfileSchema,
  origin: z.tuple([z.number(), z.number(), z.number()]),
  axisX: unitVec,
  axisZ: unitVec,
  predefinedType: z.enum(['COLUMN', 'PILASTER', 'NOTDEFINED']).optional(),
  materialName: z.string().min(1),

  isExternal: z.boolean().optional(),
  loadBearing: z.boolean().optional(),
  fireRating: z.string().optional(),
  acousticRating: z.string().optional(),
  thermalTransmittance: z.number().positive().optional(),

  manufacturerName: z.string().optional(),
  manufacturerModel: z.string().optional(),
  manufacturerProductionYear: z.number().int().positive().optional(),

  customProperties: z.record(
    z.string(),
    z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
  ).optional(),
}).superRefine((data, ctx) => {
  const dot =
    data.axisX[0] * data.axisZ[0] +
    data.axisX[1] * data.axisZ[1] +
    data.axisX[2] * data.axisZ[2];
  if (Math.abs(dot) > 1e-6) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'axisX and axisZ must be orthogonal',
      path: ['axisZ'],
    });
  }
});

export function parseColumnSpec(input: unknown): Result<ColumnSpec, BimError> {
  const result = ColumnSpecSchema.safeParse(input);
  if (!result.success) {
    return err(specError('INVALID_COLUMN_SPEC', result.error.message, result.error));
  }
  const profileCheck = parseProfile(result.data.profile);
  if (!profileCheck.ok) return err(profileCheck.error);
  return ok(result.data as ColumnSpec);
}
