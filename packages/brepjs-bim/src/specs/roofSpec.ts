import { z } from 'zod';
import type { BimError } from '../errors/bimError.js';
import { specError } from '../errors/bimError.js';
import type { Result } from 'brepjs';
import { ok, err } from 'brepjs';
import type { MaterialLayer } from '../types/materialTypes.js';
import type { ClassificationRef } from '../types/classificationTypes.js';
import { MaterialLayerSchema, ClassificationRefSchema } from './materialSpec.js';

export type RoofPredefinedType =
  | 'FLAT_ROOF'
  | 'SHED_ROOF'
  | 'GABLE_ROOF'
  | 'HIP_ROOF'
  | 'HIPPED_GABLE_ROOF'
  | 'GAMBREL_ROOF'
  | 'MANSARD_ROOF'
  | 'BARREL_ROOF'
  | 'RAINBOW_ROOF'
  | 'BUTTERFLY_ROOF'
  | 'PAVILION_ROOF'
  | 'DOME_ROOF'
  | 'FREEFORM'
  | 'NOTDEFINED';

// A rectangular roof slab. All dimensions in mm. The profile lies in the local
// XY plane (length × width) and extrudes along local +Z by thickness;
// origin/axisX/axisZ position the roof in world space via IfcLocalPlacement.
// `predefinedType` records the intended roof shape for IFC consumers; the brepjs
// solid is a flat slab regardless (see roofToSolid).
export interface RoofSpec {
  readonly length: number;
  readonly width: number;
  readonly thickness: number;
  readonly origin: [number, number, number];
  readonly axisX: [number, number, number];
  readonly axisZ: [number, number, number];
  readonly predefinedType: RoofPredefinedType;
  readonly materialName: string;

  readonly isExternal?: boolean | undefined;
  readonly fireRating?: string | undefined;
  readonly thermalTransmittance?: number | undefined;
  readonly status?: string | undefined;

  /**
   * When present, the roof is associated via a layered IfcMaterialLayerSet built
   * from these layers instead of the bare `materialName` IfcMaterial.
   */
  readonly materialLayers?: readonly MaterialLayer[] | undefined;
  readonly layerSetName?: string | undefined;

  /** When present, associates the roof with an external classification code. */
  readonly classification?: ClassificationRef | undefined;

  readonly manufacturerName?: string | undefined;
  readonly manufacturerModel?: string | undefined;
  readonly manufacturerProductionYear?: number | undefined;

  readonly customProperties?:
    | Readonly<Record<string, Readonly<Record<string, string | number | boolean>>>>
    | undefined;
}

const ROOF_PREDEFINED_TYPES = [
  'FLAT_ROOF',
  'SHED_ROOF',
  'GABLE_ROOF',
  'HIP_ROOF',
  'HIPPED_GABLE_ROOF',
  'GAMBREL_ROOF',
  'MANSARD_ROOF',
  'BARREL_ROOF',
  'RAINBOW_ROOF',
  'BUTTERFLY_ROOF',
  'PAVILION_ROOF',
  'DOME_ROOF',
  'FREEFORM',
  'NOTDEFINED',
] as const;

const unitVec = z.tuple([z.number(), z.number(), z.number()]).refine(
  (v) => Math.abs(v[0] ** 2 + v[1] ** 2 + v[2] ** 2 - 1) < 1e-6,
  { error: 'must be a unit vector' }
);

const RoofSpecSchema = z.object({
  length: z.number().positive(),
  width: z.number().positive(),
  thickness: z.number().positive(),
  origin: z.tuple([z.number(), z.number(), z.number()]),
  axisX: unitVec,
  axisZ: unitVec,
  predefinedType: z.enum(ROOF_PREDEFINED_TYPES).default('NOTDEFINED'),
  materialName: z.string().min(1),

  isExternal: z.boolean().optional(),
  fireRating: z.string().optional(),
  thermalTransmittance: z.number().positive().optional(),
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

export function parseRoofSpec(input: unknown): Result<RoofSpec, BimError> {
  const result = RoofSpecSchema.safeParse(input);
  if (!result.success) {
    return err(specError('INVALID_ROOF_SPEC', result.error.message, result.error));
  }
  return ok(result.data as RoofSpec);
}
