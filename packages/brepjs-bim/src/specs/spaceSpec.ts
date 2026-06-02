import { z } from 'zod';
import type { BimError } from '../errors/bimError.js';
import { specError } from '../errors/bimError.js';
import type { Result } from 'brepjs';
import { ok, err } from 'brepjs';
import type { ClassificationRef } from '../types/classificationTypes.js';
import { ClassificationRefSchema } from './materialSpec.js';

export type SpacePredefinedType =
  | 'SPACE'
  | 'PARKING'
  | 'GFA'
  | 'INTERNAL'
  | 'EXTERNAL'
  | 'NOTDEFINED';

// A rectangular space (room) occupying a building storey. All dimensions in mm.
// The footprint (length × width) lies in the local XY plane and extrudes along
// local +Z by the clear height. origin/axisX/axisZ position the space in world
// space via IfcLocalPlacement.
export interface SpaceSpec {
  readonly name: string;
  readonly length: number;
  readonly width: number;
  readonly height: number;
  readonly origin: [number, number, number];
  readonly axisX: [number, number, number];
  readonly axisZ: [number, number, number];
  readonly materialName: string;

  readonly predefinedType?: SpacePredefinedType | undefined;
  readonly longName?: string | undefined;

  readonly isExternal?: boolean | undefined;
  readonly status?: string | undefined;
  readonly finishCeiling?: string | undefined;
  readonly finishFloor?: string | undefined;

  /** When present, associates the space with an external classification code. */
  readonly classification?: ClassificationRef | undefined;

  readonly customProperties?:
    | Readonly<Record<string, Readonly<Record<string, string | number | boolean>>>>
    | undefined;
}

const unitVec = z.tuple([z.number(), z.number(), z.number()]).refine(
  (v) => Math.abs(v[0] ** 2 + v[1] ** 2 + v[2] ** 2 - 1) < 1e-6,
  { error: 'must be a unit vector' }
);

const SpaceSpecSchema = z.object({
  name: z.string().min(1),
  length: z.number().positive(),
  width: z.number().positive(),
  height: z.number().positive(),
  origin: z.tuple([z.number(), z.number(), z.number()]),
  axisX: unitVec,
  axisZ: unitVec,
  materialName: z.string().min(1),

  predefinedType: z
    .enum(['SPACE', 'PARKING', 'GFA', 'INTERNAL', 'EXTERNAL', 'NOTDEFINED'])
    .optional(),
  longName: z.string().optional(),

  isExternal: z.boolean().optional(),
  status: z.string().optional(),
  finishCeiling: z.string().optional(),
  finishFloor: z.string().optional(),

  classification: ClassificationRefSchema.optional(),

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

export function parseSpaceSpec(input: unknown): Result<SpaceSpec, BimError> {
  const result = SpaceSpecSchema.safeParse(input);
  if (!result.success) {
    return err(specError('INVALID_SPACE_SPEC', result.error.message, result.error));
  }
  return ok(result.data as SpaceSpec);
}
