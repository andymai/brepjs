// brepjs-family: room@1
/**
 * Room — a composed family: four keyed perimeter walls with a door in the
 * south wall. Copy-in composes (it only calls other families and the
 * brepjs-families surface); it never reaches around them into IFC writing.
 * Depends on: wall, door.
 */

import { family, el } from 'brepjs-families';
import { z } from 'zod';
import { Wall } from './wall.js';
import { Door } from './door.js';

export const roomSchema = z.object({
  width: z.number().positive(),
  depth: z.number().positive(),
  height: z.number().positive(),
  thickness: z.number().positive().default(200),
  doorWidth: z.number().positive().default(1000),
  doorHeight: z.number().positive().default(2100),
  doorAlong: z.number().nonnegative().default(0),
  materialName: z.string().min(1).default('Concrete'),
});

export type RoomProps = z.input<typeof roomSchema>;

export const Room = family(
  'Room',
  (p: z.output<typeof roomSchema>) => {
    const { width: w, depth: d, height, thickness: t, materialName } = p;
    const doorAlong = p.doorAlong > 0 ? p.doorAlong : (w - p.doorWidth) / 2;
    const shared = { height, thickness: t, materialName };
    return el('Group', {}, [
      Wall({
        key: 'south',
        ...shared,
        length: w,
        at: [0, 0, 0],
        voids: [
          Door({
            key: 'door',
            width: p.doorWidth,
            height: p.doorHeight,
            at: [doorAlong, 0],
            depth: t,
          }),
        ],
      }),
      Wall({ key: 'north', ...shared, length: w, at: [0, d - t, 0] }),
      Wall({ key: 'west', ...shared, length: d, at: [t, 0, 0], axisX: [0, 1, 0] }),
      Wall({ key: 'east', ...shared, length: d, at: [w, 0, 0], axisX: [0, 1, 0] }),
    ]);
  },
  { props: roomSchema }
);
