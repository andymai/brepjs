import { z } from 'zod';
import type { BimError } from '../errors/bimError.js';
import { specError } from '../errors/bimError.js';
import type { Result } from 'brepjs';
import { ok, err } from 'brepjs';

export type SlabPredefinedType = 'FLOOR' | 'ROOF' | 'LANDING' | 'BASESLAB';

// A rectangular slab. All dimensions in mm.
// Profile lies in the local XY plane (length × width); slab extrudes along
// local +Z by thickness. origin/axisX/axisZ position the slab in world space
// via IfcLocalPlacement.
export interface SlabSpec {
  readonly length: number;
  readonly width: number;
  readonly thickness: number;
  readonly origin: [number, number, number];
  readonly axisX: [number, number, number];
  readonly axisZ: [number, number, number];
  readonly predefinedType: SlabPredefinedType;
  readonly materialName: string;

  readonly isExternal?: boolean | undefined;
  readonly fireRating?: string | undefined;
  readonly acousticRating?: string | undefined;
  readonly thermalTransmittance?: number | undefined;
  readonly loadBearing?: boolean | undefined;
  readonly combustible?: boolean | undefined;
  readonly compartmentation?: boolean | undefined;

  readonly manufacturerName?: string | undefined;
  readonly manufacturerModel?: string | undefined;
  readonly manufacturerProductionYear?: number | undefined;

  readonly customProperties?:
    | Readonly<Record<string, Readonly<Record<string, string | number | boolean>>>>
    | undefined;
}

const unitVec = z.tuple([z.number(), z.number(), z.number()]).refine(
  (v) => Math.abs(v[0] ** 2 + v[1] ** 2 + v[2] ** 2 - 1) < 1e-6,
  { error: 'must be a unit vector' }
);

const SlabSpecSchema = z.object({
  length: z.number().positive(),
  width: z.number().positive(),
  thickness: z.number().positive(),
  origin: z.tuple([z.number(), z.number(), z.number()]),
  axisX: unitVec,
  axisZ: unitVec,
  predefinedType: z.enum(['FLOOR', 'ROOF', 'LANDING', 'BASESLAB']),
  materialName: z.string().min(1),

  isExternal: z.boolean().optional(),
  fireRating: z.string().optional(),
  acousticRating: z.string().optional(),
  thermalTransmittance: z.number().positive().optional(),
  loadBearing: z.boolean().optional(),
  combustible: z.boolean().optional(),
  compartmentation: z.boolean().optional(),

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
      code: 'custom',
      message: 'axisX and axisZ must be orthogonal',
      path: ['axisZ'],
    });
  }
});

export function parseSlabSpec(input: unknown): Result<SlabSpec, BimError> {
  const result = SlabSpecSchema.safeParse(input);
  if (!result.success) {
    return err(specError('INVALID_SLAB_SPEC', result.error.message, result.error));
  }
  return ok(result.data as SlabSpec);
}
