import { z } from 'zod';
import type { BimError } from '../errors/bimError.js';
import { specError } from '../errors/bimError.js';
import type { Result } from 'brepjs';
import { ok, err } from 'brepjs';
import type { Profile } from './profile.js';
import { ProfileSchema, parseProfile } from './profile.js';
import type { MaterialLayer } from '../types/materialTypes.js';
import type { ClassificationRef } from '../types/classificationTypes.js';
import { MaterialLayerSchema, ClassificationRefSchema } from './materialSpec.js';

export type FootingPredefinedType =
  | 'CAISSON_FOUNDATION'
  | 'FOOTING_BEAM'
  | 'PAD_FOOTING'
  | 'PILE_CAP'
  | 'STRIP_FOOTING'
  | 'NOTDEFINED';

export type PilePredefinedType = 'BORED' | 'DRIVEN' | 'JETGROUTING' | 'NOTDEFINED';

export type PileConstructionType =
  | 'CAST_IN_PLACE'
  | 'COMPOSITE'
  | 'PRECAST_CONCRETE'
  | 'PREFAB_STEEL';

// A rectangular pad/strip footing. All dimensions in mm. Profile lies in the
// local XY plane (length × width); the footing extrudes along local +Z by
// thickness. origin/axisX/axisZ position it via IfcLocalPlacement.
export interface FootingSpec {
  readonly length: number;
  readonly width: number;
  readonly thickness: number;
  readonly origin: [number, number, number];
  readonly axisX: [number, number, number];
  readonly axisZ: [number, number, number];
  readonly predefinedType?: FootingPredefinedType | undefined;
  readonly materialName: string;

  readonly isExternal?: boolean | undefined;
  readonly loadBearing?: boolean | undefined;
  readonly fireRating?: string | undefined;
  readonly status?: string | undefined;

  /**
   * When present, the footing is associated via a layered IfcMaterialLayerSet
   * built from these layers instead of the bare `materialName` IfcMaterial.
   */
  readonly materialLayers?: readonly MaterialLayer[] | undefined;
  readonly layerSetName?: string | undefined;

  /** When present, associates the footing with an external classification code. */
  readonly classification?: ClassificationRef | undefined;

  readonly customProperties?:
    | Readonly<Record<string, Readonly<Record<string, string | number | boolean>>>>
    | undefined;
}

// A pile: cross-section profile extruded along axisZ by length (depth). All
// dimensions in mm. axisZ defines the extrusion direction (typically up),
// axisX defines the profile's "X" orientation in world space.
export interface PileSpec {
  readonly length: number;
  readonly profile: Profile;
  readonly origin: [number, number, number];
  readonly axisX: [number, number, number];
  readonly axisZ: [number, number, number];
  readonly predefinedType?: PilePredefinedType | undefined;
  readonly constructionType?: PileConstructionType | undefined;
  readonly materialName: string;

  readonly loadBearing?: boolean | undefined;
  readonly status?: string | undefined;

  readonly materialLayers?: readonly MaterialLayer[] | undefined;
  readonly layerSetName?: string | undefined;

  /** When present, associates the pile with an external classification code. */
  readonly classification?: ClassificationRef | undefined;

  readonly customProperties?:
    | Readonly<Record<string, Readonly<Record<string, string | number | boolean>>>>
    | undefined;
}

const unitVec = z.tuple([z.number(), z.number(), z.number()]).refine(
  (v) => Math.abs(v[0] ** 2 + v[1] ** 2 + v[2] ** 2 - 1) < 1e-6,
  { error: 'must be a unit vector' }
);

function orthogonalAxes(
  data: { axisX: [number, number, number]; axisZ: [number, number, number] },
  ctx: z.RefinementCtx
): void {
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
}

const customPropertiesSchema = z.record(
  z.string(),
  z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
).optional();

const FootingSpecSchema = z.object({
  length: z.number().positive(),
  width: z.number().positive(),
  thickness: z.number().positive(),
  origin: z.tuple([z.number(), z.number(), z.number()]),
  axisX: unitVec,
  axisZ: unitVec,
  predefinedType: z
    .enum(['CAISSON_FOUNDATION', 'FOOTING_BEAM', 'PAD_FOOTING', 'PILE_CAP', 'STRIP_FOOTING', 'NOTDEFINED'])
    .default('NOTDEFINED'),
  materialName: z.string().min(1),

  isExternal: z.boolean().optional(),
  loadBearing: z.boolean().optional(),
  fireRating: z.string().optional(),
  status: z.string().optional(),

  materialLayers: z.array(MaterialLayerSchema).optional(),
  layerSetName: z.string().optional(),
  classification: ClassificationRefSchema.optional(),

  customProperties: customPropertiesSchema,
}).superRefine(orthogonalAxes);

const PileSpecSchema = z.object({
  length: z.number().positive(),
  profile: ProfileSchema,
  origin: z.tuple([z.number(), z.number(), z.number()]),
  axisX: unitVec,
  axisZ: unitVec,
  predefinedType: z.enum(['BORED', 'DRIVEN', 'JETGROUTING', 'NOTDEFINED']).default('NOTDEFINED'),
  constructionType: z
    .enum(['CAST_IN_PLACE', 'COMPOSITE', 'PRECAST_CONCRETE', 'PREFAB_STEEL'])
    .optional(),
  materialName: z.string().min(1),

  loadBearing: z.boolean().optional(),
  status: z.string().optional(),

  materialLayers: z.array(MaterialLayerSchema).optional(),
  layerSetName: z.string().optional(),
  classification: ClassificationRefSchema.optional(),

  customProperties: customPropertiesSchema,
}).superRefine(orthogonalAxes);

export function parseFootingSpec(input: unknown): Result<FootingSpec, BimError> {
  const result = FootingSpecSchema.safeParse(input);
  if (!result.success) {
    return err(specError('INVALID_FOOTING_SPEC', result.error.message, result.error));
  }
  return ok(result.data as FootingSpec);
}

export function parsePileSpec(input: unknown): Result<PileSpec, BimError> {
  const result = PileSpecSchema.safeParse(input);
  if (!result.success) {
    return err(specError('INVALID_PILE_SPEC', result.error.message, result.error));
  }
  const profileCheck = parseProfile(result.data.profile);
  if (!profileCheck.ok) return err(profileCheck.error);
  return ok(result.data as PileSpec);
}
