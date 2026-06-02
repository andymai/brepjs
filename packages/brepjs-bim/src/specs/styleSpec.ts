import { z } from 'zod';
import type { BimError } from '../errors/bimError.js';
import { specError } from '../errors/bimError.js';
import type { Result } from 'brepjs';
import { ok, err } from 'brepjs';
import type { SurfaceStyleSpec } from '../ifc-writer/styleWriter.js';

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

export type { SurfaceStyleSpec } from '../ifc-writer/styleWriter.js';
