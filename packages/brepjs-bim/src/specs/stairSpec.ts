import { z } from 'zod';
import type { BimError } from '../errors/bimError.js';
import { specError } from '../errors/bimError.js';
import type { Result } from 'brepjs';
import { ok, err } from 'brepjs';
import type { ClassificationRef } from '../types/classificationTypes.js';
import { ClassificationRefSchema } from './materialSpec.js';

export type StairPredefinedType =
  | 'STRAIGHT_RUN_STAIR'
  | 'TWO_STRAIGHT_RUN_STAIR'
  | 'QUARTER_WINDING_STAIR'
  | 'QUARTER_TURN_STAIR'
  | 'HALF_WINDING_STAIR'
  | 'HALF_TURN_STAIR'
  | 'TWO_QUARTER_WINDING_STAIR'
  | 'TWO_QUARTER_TURN_STAIR'
  | 'THREE_QUARTER_WINDING_STAIR'
  | 'THREE_QUARTER_TURN_STAIR'
  | 'SPIRAL_STAIR'
  | 'DOUBLE_RETURN_STAIR'
  | 'CURVED_RUN_STAIR'
  | 'TWO_CURVED_RUN_STAIR'
  | 'NOTDEFINED';

// A single stair flight. The flight is built as a stepped solid: the side
// silhouette (sawtooth of treads and risers) lies in the local XZ plane and is
// swept along local +Y by `width`. Travel direction is local +X, rise is +Z.
// All dimensions in mm. origin/axisX/axisZ position the flight via
// IfcLocalPlacement.
export interface StairFlightSpec {
  readonly width: number;
  readonly riserHeight: number;
  readonly treadLength: number;
  readonly numberOfRisers: number;
  readonly origin: [number, number, number];
  readonly axisX: [number, number, number];
  readonly axisZ: [number, number, number];
  readonly materialName: string;
}

export interface StairSpec {
  readonly name?: string | undefined;
  readonly predefinedType?: StairPredefinedType | undefined;
  readonly flights: readonly StairFlightSpec[];
  readonly materialName: string;
  readonly status?: string | undefined;
  readonly classification?: ClassificationRef | undefined;
}

const unitVec = z.tuple([z.number(), z.number(), z.number()]).refine(
  (v) => Math.abs(v[0] ** 2 + v[1] ** 2 + v[2] ** 2 - 1) < 1e-6,
  { error: 'must be a unit vector' }
);

const orthogonal = (data: {
  axisX: [number, number, number];
  axisZ: [number, number, number];
}): boolean => {
  const dot =
    data.axisX[0] * data.axisZ[0] +
    data.axisX[1] * data.axisZ[1] +
    data.axisX[2] * data.axisZ[2];
  return Math.abs(dot) <= 1e-6;
};

const StairFlightSpecSchema = z
  .object({
    width: z.number().positive(),
    riserHeight: z.number().positive(),
    treadLength: z.number().positive(),
    numberOfRisers: z.number().int().positive(),
    origin: z.tuple([z.number(), z.number(), z.number()]),
    axisX: unitVec,
    axisZ: unitVec,
    materialName: z.string().min(1),
  })
  .superRefine((data, ctx) => {
    if (!orthogonal(data)) {
      ctx.addIssue({
        code: 'custom',
        message: 'axisX and axisZ must be orthogonal',
        path: ['axisZ'],
      });
    }
  });

const StairSpecSchema = z.object({
  name: z.string().optional(),
  predefinedType: z
    .enum([
      'STRAIGHT_RUN_STAIR',
      'TWO_STRAIGHT_RUN_STAIR',
      'QUARTER_WINDING_STAIR',
      'QUARTER_TURN_STAIR',
      'HALF_WINDING_STAIR',
      'HALF_TURN_STAIR',
      'TWO_QUARTER_WINDING_STAIR',
      'TWO_QUARTER_TURN_STAIR',
      'THREE_QUARTER_WINDING_STAIR',
      'THREE_QUARTER_TURN_STAIR',
      'SPIRAL_STAIR',
      'DOUBLE_RETURN_STAIR',
      'CURVED_RUN_STAIR',
      'TWO_CURVED_RUN_STAIR',
      'NOTDEFINED',
    ])
    .optional(),
  flights: z.array(StairFlightSpecSchema).min(1),
  materialName: z.string().min(1),
  status: z.string().optional(),
  classification: ClassificationRefSchema.optional(),
});

export function parseStairFlightSpec(input: unknown): Result<StairFlightSpec, BimError> {
  const result = StairFlightSpecSchema.safeParse(input);
  if (!result.success) {
    return err(specError('INVALID_STAIR_FLIGHT_SPEC', result.error.message, result.error));
  }
  return ok(result.data as StairFlightSpec);
}

export function parseStairSpec(input: unknown): Result<StairSpec, BimError> {
  const result = StairSpecSchema.safeParse(input);
  if (!result.success) {
    return err(specError('INVALID_STAIR_SPEC', result.error.message, result.error));
  }
  return ok(result.data as StairSpec);
}
