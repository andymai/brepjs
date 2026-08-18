// brepjs-family: column@1
/**
 * Column — a vertical circular column (cross-section centred on `at`,
 * extruded up by `height`). Props feed the IFC column spec 1:1 in a BIM
 * projection. Circular only in v1: the Cylinder intrinsic is base-centred at
 * the local origin exactly like the spec solid, so the IR and IFC frames
 * coincide; rectangular profiles arrive with the profile bridge (Beam arc).
 */

import { family, el, tTranslate } from 'brepjs-families';
import { z } from 'zod';

export const columnSchema = z.object({
  height: z.number().positive(),
  profile: z.object({
    kind: z.literal('CIRCULAR'),
    radius: z.number().positive(),
  }),
  at: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  predefinedType: z.enum(['COLUMN', 'PILASTER', 'NOTDEFINED']).default('COLUMN'),
  materialName: z.string().min(1).default('Concrete'),
  isExternal: z.boolean().optional(),
  loadBearing: z.boolean().optional(),
  fireRating: z.string().optional(),
});

export type ColumnProps = z.input<typeof columnSchema>;

export const Column = family(
  'Column',
  (p: z.output<typeof columnSchema>) =>
    el('Cylinder', {
      radius: p.profile.radius,
      height: p.height,
      transform: [tTranslate(p.at)],
    }),
  { props: columnSchema }
);
