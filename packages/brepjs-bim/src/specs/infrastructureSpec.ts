import { z } from 'zod';
import { err, ok, type Result } from 'brepjs';
import { specError, type BimError } from '../errors/bimError.js';
import type { IfcElementCompositionType, SpatialPlacementSpec } from './spatialSpec.js';
import { spatialPlacementFields, validateSpatialAxes } from './spatialSpec.js';

export type BridgePredefinedType =
  | 'ARCHED'
  | 'CABLE_STAYED'
  | 'CANTILEVER'
  | 'CULVERT'
  | 'FRAMEWORK'
  | 'GIRDER'
  | 'SUSPENSION'
  | 'TRUSS'
  | 'USERDEFINED'
  | 'NOTDEFINED';

export type BridgePartPredefinedType =
  | 'ABUTMENT'
  | 'DECK'
  | 'DECK_SEGMENT'
  | 'FOUNDATION'
  | 'PIER'
  | 'PIER_SEGMENT'
  | 'PYLON'
  | 'SUBSTRUCTURE'
  | 'SUPERSTRUCTURE'
  | 'SURFACESTRUCTURE'
  | 'USERDEFINED'
  | 'NOTDEFINED';

export type FacilityUsageType =
  'LATERAL' | 'LONGITUDINAL' | 'REGION' | 'VERTICAL' | 'USERDEFINED' | 'NOTDEFINED';

interface CivilSpatialSpec extends SpatialPlacementSpec {
  readonly name: string;
  readonly description?: string | undefined;
  readonly compositionType?: IfcElementCompositionType | undefined;
}

export interface BridgeSpec extends CivilSpatialSpec {
  readonly predefinedType?: BridgePredefinedType | undefined;
}

export interface BridgePartSpec extends CivilSpatialSpec {
  readonly usageType: FacilityUsageType;
  readonly predefinedType?: BridgePartPredefinedType | undefined;
}

const composition = z.enum(['COMPLEX', 'ELEMENT', 'PARTIAL']).optional();

const BridgeSpecSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    ...spatialPlacementFields,
    compositionType: composition,
    predefinedType: z
      .enum([
        'ARCHED',
        'CABLE_STAYED',
        'CANTILEVER',
        'CULVERT',
        'FRAMEWORK',
        'GIRDER',
        'SUSPENSION',
        'TRUSS',
        'USERDEFINED',
        'NOTDEFINED',
      ])
      .optional(),
  })
  .superRefine(validateSpatialAxes);

const BridgePartSpecSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    ...spatialPlacementFields,
    compositionType: composition,
    usageType: z.enum([
      'LATERAL',
      'LONGITUDINAL',
      'REGION',
      'VERTICAL',
      'USERDEFINED',
      'NOTDEFINED',
    ]),
    predefinedType: z
      .enum([
        'ABUTMENT',
        'DECK',
        'DECK_SEGMENT',
        'FOUNDATION',
        'PIER',
        'PIER_SEGMENT',
        'PYLON',
        'SUBSTRUCTURE',
        'SUPERSTRUCTURE',
        'SURFACESTRUCTURE',
        'USERDEFINED',
        'NOTDEFINED',
      ])
      .optional(),
  })
  .superRefine(validateSpatialAxes);

export function parseBridgeSpec(input: unknown): Result<BridgeSpec, BimError> {
  const result = BridgeSpecSchema.safeParse(input);
  return result.success
    ? ok(result.data as BridgeSpec)
    : err(specError('INVALID_BRIDGE_SPEC', result.error.message, result.error));
}

export function parseBridgePartSpec(input: unknown): Result<BridgePartSpec, BimError> {
  const result = BridgePartSpecSchema.safeParse(input);
  return result.success
    ? ok(result.data as BridgePartSpec)
    : err(specError('INVALID_BRIDGE_PART_SPEC', result.error.message, result.error));
}
