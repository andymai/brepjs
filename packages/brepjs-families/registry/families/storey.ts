// brepjs-family: storey@2
/**
 * Storey — a pure spatial container: no geometry of its own, maps onto
 * IfcBuildingStorey in a BIM projection. Children are the storey's elements.
 */

import { family, el, type Element } from 'brepjs-families';
import { z } from 'zod';

export const storeySchema = z.object({
  elevation: z.number().default(0),
  items: z.array(z.custom<Element>()).default([]),
});

export type StoreyProps = z.input<typeof storeySchema>;

export const Storey = family(
  'Storey',
  (p: z.output<typeof storeySchema>) => el('Group', {}, p.items),
  { archetype: 'storey', props: storeySchema }
);
