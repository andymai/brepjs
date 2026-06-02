import { z } from 'zod';
import type { BimError } from '../errors/bimError.js';
import { specError } from '../errors/bimError.js';
import type { Result } from 'brepjs';
import { ok, err } from 'brepjs';
import type { MaterialLayer } from '../types/materialTypes.js';
import type { ClassificationRef } from '../types/classificationTypes.js';
import { MaterialLayerSchema, ClassificationRefSchema } from './materialSpec.js';

export type RailingPredefinedType = 'BALUSTRADE' | 'GUARDRAIL' | 'HANDRAIL' | 'NOTDEFINED';

/**
 * A straight railing run: a rail of rectangular cross-section (thickness × height)
 * swept along the run length. All dimensions in mm. The cross-section profile lies
 * in the local YZ plane and is swept along local +X by `length`.
 * origin/axisX/axisZ position the railing in world space via IfcLocalPlacement.
 */
export interface RailingSpec {
  readonly length: number;
  readonly height: number;
  readonly thickness: number;
  readonly origin: [number, number, number];
  readonly axisX: [number, number, number];
  readonly axisZ: [number, number, number];
  readonly predefinedType?: RailingPredefinedType | undefined;
  readonly materialName: string;

  readonly isExternal?: boolean | undefined;
  readonly fireRating?: string | undefined;
  readonly status?: string | undefined;

  readonly materialLayers?: readonly MaterialLayer[] | undefined;
  readonly layerSetName?: string | undefined;

  readonly classification?: ClassificationRef | undefined;

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

const RailingSpecSchema = z.object({
  length: z.number().positive(),
  height: z.number().positive(),
  thickness: z.number().positive(),
  origin: z.tuple([z.number(), z.number(), z.number()]),
  axisX: unitVec,
  axisZ: unitVec,
  predefinedType: z.enum(['BALUSTRADE', 'GUARDRAIL', 'HANDRAIL', 'NOTDEFINED']).optional(),
  materialName: z.string().min(1),

  isExternal: z.boolean().optional(),
  fireRating: z.string().optional(),
  status: z.string().optional(),

  materialLayers: z.array(MaterialLayerSchema).optional(),
  layerSetName: z.string().optional(),
  classification: ClassificationRefSchema.optional(),

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

export function parseRailingSpec(input: unknown): Result<RailingSpec, BimError> {
  const result = RailingSpecSchema.safeParse(input);
  if (!result.success) {
    return err(specError('INVALID_RAILING_SPEC', result.error.message, result.error));
  }
  return ok(result.data as RailingSpec);
}
