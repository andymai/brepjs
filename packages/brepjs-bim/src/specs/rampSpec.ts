import { z } from 'zod';
import type { BimError } from '../errors/bimError.js';
import { specError } from '../errors/bimError.js';
import type { Result } from 'brepjs';
import { ok, err } from 'brepjs';
import type { ClassificationRef } from '../types/classificationTypes.js';
import { ClassificationRefSchema } from './materialSpec.js';

export type RampPredefinedType =
  | 'STRAIGHT_RUN_RAMP'
  | 'TWO_STRAIGHT_RUN_RAMP'
  | 'QUARTER_TURN_RAMP'
  | 'TWO_QUARTER_TURN_RAMP'
  | 'HALF_TURN_RAMP'
  | 'SPIRAL_RAMP'
  | 'NOTDEFINED';

export type RampFlightPredefinedType = 'STRAIGHT' | 'SPIRAL' | 'NOTDEFINED';

// A single ramp flight, built as an inclined slab solid. The side silhouette
// (an inclined parallelogram of run `length` rising by `length * slope`) lies in
// the local XZ plane and is swept along local +Y by `width`. Travel direction is
// local +X, rise is +Z. All dimensions in mm; `slope` is rise/run (unitless).
// origin/axisX/axisZ position the flight via IfcLocalPlacement.
export interface RampFlightSpec {
  readonly width: number;
  readonly length: number;
  readonly slope: number;
  readonly thickness: number;
  readonly origin: [number, number, number];
  readonly axisX: [number, number, number];
  readonly axisZ: [number, number, number];
  readonly materialName: string;
  readonly predefinedType?: RampFlightPredefinedType | undefined;
}

export interface RampSpec {
  readonly name?: string | undefined;
  readonly predefinedType?: RampPredefinedType | undefined;
  readonly flights: readonly RampFlightSpec[];
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

const RampFlightSpecSchema = z
  .object({
    width: z.number().positive(),
    length: z.number().positive(),
    slope: z.number().positive(),
    thickness: z.number().positive(),
    origin: z.tuple([z.number(), z.number(), z.number()]),
    axisX: unitVec,
    axisZ: unitVec,
    materialName: z.string().min(1),
    predefinedType: z.enum(['STRAIGHT', 'SPIRAL', 'NOTDEFINED']).optional(),
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

const RampSpecSchema = z.object({
  name: z.string().optional(),
  predefinedType: z
    .enum([
      'STRAIGHT_RUN_RAMP',
      'TWO_STRAIGHT_RUN_RAMP',
      'QUARTER_TURN_RAMP',
      'TWO_QUARTER_TURN_RAMP',
      'HALF_TURN_RAMP',
      'SPIRAL_RAMP',
      'NOTDEFINED',
    ])
    .optional(),
  flights: z.array(RampFlightSpecSchema).min(1),
  materialName: z.string().min(1),
  status: z.string().optional(),
  classification: ClassificationRefSchema.optional(),
});

export function parseRampFlightSpec(input: unknown): Result<RampFlightSpec, BimError> {
  const result = RampFlightSpecSchema.safeParse(input);
  if (!result.success) {
    return err(specError('INVALID_RAMP_FLIGHT_SPEC', result.error.message, result.error));
  }
  return ok(result.data as RampFlightSpec);
}

export function parseRampSpec(input: unknown): Result<RampSpec, BimError> {
  const result = RampSpecSchema.safeParse(input);
  if (!result.success) {
    return err(specError('INVALID_RAMP_SPEC', result.error.message, result.error));
  }
  return ok(result.data as RampSpec);
}
