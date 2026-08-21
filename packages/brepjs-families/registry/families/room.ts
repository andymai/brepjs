// brepjs-family: room@3
/**
 * Room — a composed family: four keyed perimeter walls with a door in the
 * south wall. Copy-in composes (it only calls other families and the
 * brepjs-families surface); it never reaches around them into IFC writing.
 * Depends on: wall, door.
 *
 * `at` is the room's south-west corner, applied as the group's transform:
 * children ride with their parent, so the walls stay in room-local
 * coordinates. Two rooms with the same dimensions share every wall
 * materialization — only the placement differs.
 */

import { family, el, tTranslate } from 'brepjs-families';
import { z } from 'zod';
import { Wall } from './wall.js';
import { Door } from './door.js';

const roomShape = z.object({
  width: z.number().positive(),
  depth: z.number().positive(),
  height: z.number().positive(),
  thickness: z.number().positive().default(200),
  at: z.tuple([z.number(), z.number()]).default([0, 0]),
  doorWidth: z.number().positive().default(1000),
  doorHeight: z.number().positive().default(2100),
  doorAlong: z.number().nonnegative().default(0),
  materialName: z.string().min(1).default('Concrete'),
});

/** Explicit `doorAlong`, or centered in the south wall when 0. */
function doorAlongOf(p: z.output<typeof roomShape>): number {
  return p.doorAlong > 0 ? p.doorAlong : (p.width - p.doorWidth) / 2;
}

export const roomSchema = roomShape.superRefine((p, ctx) => {
  if (doorAlongOf(p) < 0 || doorAlongOf(p) + p.doorWidth > p.width) {
    ctx.addIssue({
      code: 'custom',
      message: `door (along ${doorAlongOf(p)} + width ${p.doorWidth}) does not fit the ${p.width} south wall`,
    });
  }
  if (p.doorHeight > p.height) {
    ctx.addIssue({
      code: 'custom',
      message: `door height ${p.doorHeight} exceeds the room height ${p.height}`,
    });
  }
});

export type RoomProps = z.input<typeof roomSchema>;

export const Room = family(
  'Room',
  (p: z.output<typeof roomSchema>) => {
    const { width: w, depth: d, height, thickness: t, materialName } = p;
    const doorAlong = doorAlongOf(p);
    const shared = { height, thickness: t, materialName };
    return el('Group', { transform: [tTranslate([p.at[0], p.at[1], 0])] }, [
      Wall({
        key: 'south',
        ...shared,
        length: w,
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
