// brepjs-family: door@1
/**
 * Door — a fill-role family: placed in a wall's `voids`, resolution
 * synthesizes an Opening (IfcRelVoidsElement + IfcRelFillsElement in a BIM
 * projection). `at` is [along-wall, sill] in the host wall's local frame;
 * `alongY` orients the cut box for Y-running hosts.
 */

import { family, el, tTranslate } from 'brepjs-families';
import { z } from 'zod';

export const doorSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  at: z.tuple([z.number(), z.number()]).default([0, 0]),
  depth: z.number().positive().default(300),
  alongY: z.boolean().default(false),
  materialName: z.string().min(1).default('Timber'),
  isExternal: z.boolean().optional(),
  fireRating: z.string().optional(),
});

export type DoorProps = z.input<typeof doorSchema>;

export const Door = family(
  'Door',
  (p: z.output<typeof doorSchema>) =>
    el('Box', {
      size: p.alongY ? [p.depth, p.width, p.height] : [p.width, p.depth, p.height],
      transform: [tTranslate(p.alongY ? [0, p.at[0], p.at[1]] : [p.at[0], 0, p.at[1]])],
    }),
  { role: 'fill', props: doorSchema }
);
