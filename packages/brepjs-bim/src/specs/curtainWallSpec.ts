import { z } from 'zod';
import type { BimError } from '../errors/bimError.js';
import { specError } from '../errors/bimError.js';
import type { Result } from 'brepjs';
import { ok, err } from 'brepjs';
import type { ClassificationRef } from '../types/classificationTypes.js';
import { ClassificationRefSchema } from './materialSpec.js';

export type CurtainWallPredefinedType = 'CURTAIN_WALL' | 'NOTDEFINED' | 'USERDEFINED';

/**
 * A planar curtain wall, modelled as a rectangular grid of glazing panels
 * (IfcPlate) framed by mullions (IfcMember). The wall spans `width` (along the
 * local X axis) by `height` (local Z), and is subdivided into `columns` × `rows`
 * panels. Mullions run along every internal and boundary grid line.
 *
 * All dimensions in mm. Geometry is unplaced template geometry built in the
 * local XY/XZ plane; origin/axisX/axisZ place the assembly in world space via
 * IfcLocalPlacement.
 */
export interface CurtainWallSpec {
  readonly width: number; // overall span along local X
  readonly height: number; // overall span along local Z
  readonly columns: number; // number of panel columns (>= 1)
  readonly rows: number; // number of panel rows (>= 1)
  readonly panelThickness: number; // glazing panel depth along local Y
  readonly mullionWidth: number; // mullion section size in the wall plane
  readonly mullionDepth: number; // mullion section depth along local Y
  readonly origin: [number, number, number];
  readonly axisX: [number, number, number];
  readonly axisZ: [number, number, number];
  readonly materialName: string;

  readonly predefinedType?: CurtainWallPredefinedType | undefined;
  readonly panelMaterialName?: string | undefined;
  readonly mullionMaterialName?: string | undefined;

  readonly isExternal?: boolean | undefined;
  readonly fireRating?: string | undefined;
  readonly thermalTransmittance?: number | undefined;
  readonly status?: string | undefined;

  readonly classification?: ClassificationRef | undefined;

  readonly customProperties?:
    | Readonly<Record<string, Readonly<Record<string, string | number | boolean>>>>
    | undefined;
}

const unitVec = z.tuple([z.number(), z.number(), z.number()]).refine(
  (v) => Math.abs(v[0] ** 2 + v[1] ** 2 + v[2] ** 2 - 1) < 1e-6,
  { error: 'must be a unit vector' }
);

const CurtainWallSpecSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  columns: z.number().int().positive(),
  rows: z.number().int().positive(),
  panelThickness: z.number().positive(),
  mullionWidth: z.number().positive(),
  mullionDepth: z.number().positive(),
  origin: z.tuple([z.number(), z.number(), z.number()]),
  axisX: unitVec,
  axisZ: unitVec,
  materialName: z.string().min(1),

  predefinedType: z.enum(['CURTAIN_WALL', 'NOTDEFINED', 'USERDEFINED']).optional(),
  panelMaterialName: z.string().min(1).optional(),
  mullionMaterialName: z.string().min(1).optional(),

  isExternal: z.boolean().optional(),
  fireRating: z.string().optional(),
  thermalTransmittance: z.number().positive().optional(),
  status: z.string().optional(),

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
  // Mullions occupy (columns + 1) vertical lines and (rows + 1) horizontal
  // lines; the panels must retain positive area between them.
  const cellWidth = data.width / data.columns;
  if (data.mullionWidth >= cellWidth) {
    ctx.addIssue({
      code: 'custom',
      message: 'mullionWidth must be smaller than the panel cell width (width / columns)',
      path: ['mullionWidth'],
    });
  }
  const cellHeight = data.height / data.rows;
  if (data.mullionWidth >= cellHeight) {
    ctx.addIssue({
      code: 'custom',
      message: 'mullionWidth must be smaller than the panel cell height (height / rows)',
      path: ['mullionWidth'],
    });
  }
});

export function parseCurtainWallSpec(input: unknown): Result<CurtainWallSpec, BimError> {
  const result = CurtainWallSpecSchema.safeParse(input);
  if (!result.success) {
    return err(specError('INVALID_CURTAIN_WALL_SPEC', result.error.message, result.error));
  }
  return ok(result.data as CurtainWallSpec);
}
