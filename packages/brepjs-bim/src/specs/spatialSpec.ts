export interface ProjectSpec {
  readonly name: string;
  readonly description?: string;
  /**
   * Optional stable, globally-unique project identifier used to scope all derived
   * GlobalIds. Supply a UUID (or any stable unique string) when the model will be
   * federated/diffed/exported to COBie/BCF so its GlobalIds are unique across
   * models. When omitted, the scope falls back to the project name+description
   * (stable, but unique only per distinct name).
   */
  readonly projectId?: string;
  /**
   * Optional geodetic coordinate reference system. When present the writer
   * emits IfcProjectedCRS + IfcMapConversion against the model context, which
   * establishes proper georeferencing (buildingSMART rule GRF003 asks for a
   * CRS whenever facilities such as buildings are modelled).
   */
  readonly crs?: ProjectCrs;
}

export interface ProjectCrs {
  /** CRS name, conventionally an EPSG code (e.g. "EPSG:25832"). */
  readonly name: string;
  readonly description?: string | undefined;
  readonly geodeticDatum?: string | undefined;
  readonly verticalDatum?: string | undefined;
  readonly mapProjection?: string | undefined;
  readonly mapZone?: string | undefined;
  /** Map coordinates of the model origin, in metres. Default 0. */
  readonly eastings?: number | undefined;
  readonly northings?: number | undefined;
  readonly orthogonalHeight?: number | undefined;
  /** Rotation of the model X axis in the map plane (abscissa/ordinate pair). */
  readonly xAxisAbscissa?: number | undefined;
  readonly xAxisOrdinate?: number | undefined;
  readonly scale?: number | undefined;
}

export type IfcElementCompositionType = 'COMPLEX' | 'ELEMENT' | 'PARTIAL';

export interface SpatialPlacementSpec {
  readonly origin?: [number, number, number] | undefined;
  readonly axisX?: [number, number, number] | undefined;
  readonly axisZ?: [number, number, number] | undefined;
}

export interface SiteSpec extends SpatialPlacementSpec {
  readonly name: string;
  readonly description?: string;
  readonly compositionType?: IfcElementCompositionType | undefined;
}

const unitVector = z
  .tuple([z.number(), z.number(), z.number()])
  .refine((value) => Math.abs(value[0] ** 2 + value[1] ** 2 + value[2] ** 2 - 1) < 1e-6, {
    error: 'must be a unit vector',
  });

export const spatialPlacementFields = {
  origin: z.tuple([z.number(), z.number(), z.number()]).optional(),
  axisX: unitVector.optional(),
  axisZ: unitVector.optional(),
};

export function validateSpatialAxes(data: SpatialPlacementSpec, ctx: RefinementCtx): void {
  const axisX = data.axisX ?? [1, 0, 0];
  const axisZ = data.axisZ ?? [0, 0, 1];
  const dot = axisX[0] * axisZ[0] + axisX[1] * axisZ[1] + axisX[2] * axisZ[2];
  if (Math.abs(dot) > 1e-6) {
    ctx.addIssue({
      code: 'custom',
      message: 'axisX and axisZ must be orthogonal',
      path: ['axisZ'],
    });
  }
}

const SiteSpecSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    ...spatialPlacementFields,
    compositionType: z.enum(['COMPLEX', 'ELEMENT', 'PARTIAL']).optional(),
  })
  .superRefine(validateSpatialAxes);

export function parseSiteSpec(input: unknown): Result<SiteSpec, BimError> {
  const result = SiteSpecSchema.safeParse(input);
  return result.success
    ? ok(result.data as SiteSpec)
    : err(specError('INVALID_SITE_SPEC', result.error.message, result.error));
}

export interface BuildingSpec {
  readonly name: string;
  readonly description?: string;
}

export interface StoreySpec {
  readonly name: string;
  readonly elevation: number; // mm above site datum
}
import { err, ok, type Result } from 'brepjs';
import { z, type RefinementCtx } from 'zod';
import { specError, type BimError } from '../errors/bimError.js';
