import { z } from 'zod';
import type { BimError } from '../errors/bimError.js';
import { specError } from '../errors/bimError.js';
import type { Result } from 'brepjs';
import { ok, err } from 'brepjs';

/**
 * A spatial zone — an IfcZone grouping spaces (or other zones) that share a
 * functional purpose such as a thermal, fire, or occupancy zone. Membership is
 * established separately via an ASSIGNS_TO_GROUP relationship referencing the
 * member localIds; the zone itself carries no geometry.
 */
export interface ZoneSpec {
  readonly name: string;
  readonly longName?: string | undefined;
  readonly description?: string | undefined;
  readonly objectType?: string | undefined;
}

/**
 * A system — an IfcSystem grouping elements that together provide a service
 * (HVAC supply, electrical circuit, plumbing run). Like a zone, the system is a
 * pure grouping object; members are linked via an ASSIGNS_TO_GROUP relationship.
 */
export interface SystemSpec {
  readonly name: string;
  readonly longName?: string | undefined;
  readonly description?: string | undefined;
  readonly objectType?: string | undefined;
}

const ZoneSpecSchema = z.object({
  name: z.string().min(1),
  longName: z.string().optional(),
  description: z.string().optional(),
  objectType: z.string().optional(),
});

const SystemSpecSchema = z.object({
  name: z.string().min(1),
  longName: z.string().optional(),
  description: z.string().optional(),
  objectType: z.string().optional(),
});

export function parseZoneSpec(input: unknown): Result<ZoneSpec, BimError> {
  const result = ZoneSpecSchema.safeParse(input);
  if (!result.success) {
    return err(specError('INVALID_ZONE_SPEC', result.error.message, result.error));
  }
  return ok(result.data as ZoneSpec);
}

export function parseSystemSpec(input: unknown): Result<SystemSpec, BimError> {
  const result = SystemSpecSchema.safeParse(input);
  if (!result.success) {
    return err(specError('INVALID_SYSTEM_SPEC', result.error.message, result.error));
  }
  return ok(result.data as SystemSpec);
}
