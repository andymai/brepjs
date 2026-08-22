// brepjs-family: window@2
/**
 * Window — a fill-role family: placed in a wall's `voids`, resolution
 * synthesizes an Opening. `at` is [along-wall, sill] in the host wall's
 * local frame; `alongY` orients the cut box for Y-running hosts.
 */

import { family, el, tTranslate } from 'brepjs-families';
import { z } from 'zod';

export const windowSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  at: z.tuple([z.number(), z.number()]).default([0, 900]),
  depth: z.number().positive().default(300),
  alongY: z.boolean().default(false),
  materialName: z.string().min(1).default('Aluminium + Glazing'),
  isExternal: z.boolean().optional(),
  thermalTransmittance: z.number().positive().optional(),
});

export type WindowProps = z.input<typeof windowSchema>;

export const Window = family(
  'Window',
  (p: z.output<typeof windowSchema>) =>
    el('Box', {
      size: p.alongY ? [p.depth, p.width, p.height] : [p.width, p.depth, p.height],
      transform: [tTranslate(p.alongY ? [0, p.at[0], p.at[1]] : [p.at[0], 0, p.at[1]])],
    }),
  { role: 'fill', archetype: 'window', props: windowSchema }
);
