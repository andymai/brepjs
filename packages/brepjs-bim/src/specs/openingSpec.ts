import { z } from 'zod';
import type { BimError } from '../errors/bimError.js';
import { specError } from '../errors/bimError.js';
import type { Result } from 'brepjs';
import { ok, err } from 'brepjs';
import type { LocalId } from '../identity/localId.js';

/** A door opening in a wall. All dimensions in mm. */
export interface DoorSpec {
  readonly width: number;
  readonly height: number;
  readonly offsetAlongWall: number;
  readonly offsetFromFloor: number;
  readonly wallLocalId: LocalId;
  readonly materialName: string;

  readonly isExternal?: boolean | undefined;
  readonly fireRating?: string | undefined;
  readonly acousticRating?: string | undefined;
}

/** A window opening in a wall. All dimensions in mm. */
export interface WindowSpec {
  readonly width: number;
  readonly height: number;
  readonly offsetAlongWall: number;
  readonly offsetFromFloor: number;
  readonly wallLocalId: LocalId;
  readonly materialName: string;

  readonly isExternal?: boolean | undefined;
  readonly fireRating?: string | undefined;
  readonly acousticRating?: string | undefined;
  readonly thermalTransmittance?: number | undefined;
}

const baseOpeningSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  offsetAlongWall: z.number().nonnegative(),
  offsetFromFloor: z.number().nonnegative(),
  wallLocalId: z.number().int().positive(),
  materialName: z.string().min(1),
  isExternal: z.boolean().optional(),
  fireRating: z.string().optional(),
  acousticRating: z.string().optional(),
});

const DoorSpecSchema = baseOpeningSchema;

const WindowSpecSchema = baseOpeningSchema.extend({
  thermalTransmittance: z.number().positive().optional(),
});

export function parseDoorSpec(input: unknown): Result<DoorSpec, BimError> {
  const result = DoorSpecSchema.safeParse(input);
  if (!result.success) {
    return err(specError('INVALID_DOOR_SPEC', result.error.message, result.error));
  }
  return ok(result.data as DoorSpec);
}

export function parseWindowSpec(input: unknown): Result<WindowSpec, BimError> {
  const result = WindowSpecSchema.safeParse(input);
  if (!result.success) {
    return err(specError('INVALID_WINDOW_SPEC', result.error.message, result.error));
  }
  return ok(result.data as WindowSpec);
}
