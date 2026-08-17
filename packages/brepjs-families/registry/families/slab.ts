// brepjs-family: slab@1
/**
 * Slab — a horizontal plate (floor, roof, landing, base slab). Props feed
 * the IFC slab spec 1:1 in a BIM projection.
 */

import { family, el, tTranslate } from 'brepjs-families';
import { z } from 'zod';

export const slabSchema = z.object({
  length: z.number().positive(),
  width: z.number().positive(),
  thickness: z.number().positive(),
  at: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  predefinedType: z.enum(['FLOOR', 'ROOF', 'LANDING', 'BASESLAB']).default('FLOOR'),
  materialName: z.string().min(1).default('Concrete'),
  isExternal: z.boolean().optional(),
  loadBearing: z.boolean().optional(),
});

export type SlabProps = z.input<typeof slabSchema>;

export const Slab = family(
  'Slab',
  (p: z.output<typeof slabSchema>) =>
    el('Box', {
      size: [p.length, p.width, p.thickness],
      transform: [tTranslate(p.at)],
    }),
  { props: slabSchema }
);
