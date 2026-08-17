// brepjs-family: wall@1
/**
 * Wall — a solid wall running along `axisX` with optional fill-role voids
 * (doors, windows). Props feed the IFC wall spec 1:1 when projected through
 * a BIM adapter; the render orients the IR box to coincide with the spec
 * solid (thickness spans axisZ x axisX, so a +Y wall shifts -X).
 */

import { family, el, tTranslate, type Element } from 'brepjs-families';
import { z } from 'zod';

const vec3 = z.tuple([z.number(), z.number(), z.number()]);

export const wallSchema = z.object({
  length: z.number().positive(),
  height: z.number().positive(),
  thickness: z.number().positive(),
  at: vec3.default([0, 0, 0]),
  axisX: vec3.default([1, 0, 0]),
  materialName: z.string().min(1).default('Concrete'),
  isExternal: z.boolean().optional(),
  loadBearing: z.boolean().optional(),
  fireRating: z.string().optional(),
  voids: z.array(z.custom<Element>()).default([]),
});

export type WallProps = z.input<typeof wallSchema>;

export const Wall = family(
  'Wall',
  (p: z.output<typeof wallSchema>) => {
    const alongY = p.axisX[1] !== 0;
    return el('Box', {
      size: alongY
        ? [p.thickness, p.length, p.height]
        : [p.length, p.thickness, p.height],
      voids: p.voids,
      transform: [
        tTranslate(alongY ? [p.at[0] - p.thickness, p.at[1], p.at[2]] : p.at),
      ],
    });
  },
  { props: wallSchema }
);
