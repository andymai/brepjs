import { z } from 'zod';
import type { BimError } from '../errors/bimError.js';
import { specError } from '../errors/bimError.js';
import type { Result } from 'brepjs';
import { ok, err } from 'brepjs';
export interface SurfaceStyleSpec {
  readonly name: string;
  /** Red channel, 0–1. */
  readonly r: number;
  /** Green channel, 0–1. */
  readonly g: number;
  /** Blue channel, 0–1. */
  readonly b: number;
  /** 0 = opaque (default), 1 = fully transparent. */
  readonly transparency?: number;
}

const SurfaceStyleSpecSchema = z.object({
  name: z.string().min(1),
  r: z.number().min(0).max(1),
  g: z.number().min(0).max(1),
  b: z.number().min(0).max(1),
  transparency: z.number().min(0).max(1).optional(),
});

export function parseSurfaceStyleSpec(input: unknown): Result<SurfaceStyleSpec, BimError> {
  const result = SurfaceStyleSpecSchema.safeParse(input);
  if (!result.success) {
    return err(specError('INVALID_STYLE_SPEC', result.error.message, result.error));
  }
  return ok(result.data as SurfaceStyleSpec);
}
