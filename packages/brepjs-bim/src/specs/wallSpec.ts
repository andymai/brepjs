import { z } from 'zod';
import type { BimError } from '../errors/bimError.js';
import { specError } from '../errors/bimError.js';
import type { Result } from 'brepjs';
import { ok, err } from 'brepjs';

/** A straight wall aligned along an arbitrary axis in 3D. All dimensions in mm. */
export interface WallSpec {
  readonly length: number;
  readonly height: number;
  readonly thickness: number;
  readonly origin: [number, number, number];
  readonly axisX: [number, number, number];
  readonly axisZ: [number, number, number];
  readonly materialName: string;
}

const unitVec = z.tuple([z.number(), z.number(), z.number()]).refine(
  (v) => Math.abs(v[0] ** 2 + v[1] ** 2 + v[2] ** 2 - 1) < 1e-6,
  { message: 'must be a unit vector' }
);

const WallSpecSchema = z.object({
  length: z.number().positive(),
  height: z.number().positive(),
  thickness: z.number().positive(),
  origin: z.tuple([z.number(), z.number(), z.number()]),
  axisX: unitVec,
  axisZ: unitVec,
  materialName: z.string().min(1),
}).superRefine((data, ctx) => {
  const dot = data.axisX[0] * data.axisZ[0] + data.axisX[1] * data.axisZ[1] + data.axisX[2] * data.axisZ[2];
  if (Math.abs(dot) > 1e-6) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'axisX and axisZ must be orthogonal', path: ['axisZ'] });
  }
});

export function parseWallSpec(input: unknown): Result<WallSpec, BimError> {
  const result = WallSpecSchema.safeParse(input);
  if (!result.success) {
    return err(specError('INVALID_WALL_SPEC', result.error.message, result.error));
  }
  return ok(result.data as WallSpec);
}
