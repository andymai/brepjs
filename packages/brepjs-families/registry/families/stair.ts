// brepjs-family: stair@1
/**
 * Stair — one or more straight flights, each a stepped sawtooth solid. Props
 * feed the IFC stair spec 1:1: every flight carries its own spec-shaped
 * placement (origin / axisX / axisZ / materialName), so return and switchback
 * stairs compose from flights facing different directions. The render
 * reproduces each placed flight exactly: the tread/riser silhouette in the
 * flight's travel-up plane, swept across its width (planar faces only).
 */

import { csg } from 'brepjs';
import { family, el, tTranslate } from 'brepjs-families';
import { z } from 'zod';

const vec3 = z.tuple([z.number(), z.number(), z.number()]);

const flightAxis = z.union([
  z.tuple([z.literal(1), z.literal(0), z.literal(0)]),
  z.tuple([z.literal(0), z.literal(1), z.literal(0)]),
  z.tuple([z.literal(-1), z.literal(0), z.literal(0)]),
  z.tuple([z.literal(0), z.literal(-1), z.literal(0)]),
]);

const flightSchema = z.object({
  width: z.number().positive(),
  riserHeight: z.number().positive(),
  treadLength: z.number().positive(),
  numberOfRisers: z.number().int().positive(),
  origin: vec3.default([0, 0, 0]),
  axisX: flightAxis.default([1, 0, 0]),
  axisZ: z.tuple([z.literal(0), z.literal(0), z.literal(1)]).default([0, 0, 1]),
  materialName: z.string().min(1).default('Concrete'),
});

export const stairSchema = z.object({
  flights: z.array(flightSchema).min(1),
  at: vec3.default([0, 0, 0]),
  name: z.string().optional(),
  predefinedType: z
    .enum([
      'STRAIGHT_RUN_STAIR',
      'TWO_STRAIGHT_RUN_STAIR',
      'QUARTER_WINDING_STAIR',
      'QUARTER_TURN_STAIR',
      'HALF_WINDING_STAIR',
      'HALF_TURN_STAIR',
      'TWO_QUARTER_WINDING_STAIR',
      'TWO_QUARTER_TURN_STAIR',
      'THREE_QUARTER_WINDING_STAIR',
      'THREE_QUARTER_TURN_STAIR',
      'SPIRAL_STAIR',
      'DOUBLE_RETURN_STAIR',
      'CURVED_RUN_STAIR',
      'NOTDEFINED',
    ])
    .default('STRAIGHT_RUN_STAIR'),
  materialName: z.string().min(1).default('Concrete'),
});

export type StairProps = z.input<typeof stairSchema>;

type Flight = z.output<typeof flightSchema>;

/** Side silhouette of the flight in local travel(x)/rise(z) coordinates,
 *  mirroring stairFlightToSolid: sawtooth nosing up, flat soffit back. */
function silhouette(f: Flight): ReadonlyArray<readonly [number, number]> {
  const pts: Array<readonly [number, number]> = [[0, 0]];
  let x = 0;
  let z = 0;
  for (let i = 0; i < f.numberOfRisers; i++) {
    z += f.riserHeight;
    pts.push([x, z]);
    x += f.treadLength;
    pts.push([x, z]);
  }
  pts.push([x, 0]);
  return pts;
}

function flightNode(f: Flight): csg.IRNode {
  const [ax, ay] = [f.axisX[0], f.axisX[1]];
  // Local +Y (the sweep across the width) = axisZ x axisX.
  const [yx, yy] = [-ay, ax];
  const pts = silhouette(f).map(([x, z]): [number, number, number] => [
    f.origin[0] + x * ax,
    f.origin[1] + x * ay,
    f.origin[2] + z,
  ]);
  return csg.extrude(csg.polygon(pts), [yx * f.width, yy * f.width, 0]);
}

export const Stair = family(
  'Stair',
  (p: z.output<typeof stairSchema>) => {
    const flights = p.flights.map(flightNode);
    const node = flights.length === 1 && flights[0] ? flights[0] : csg.compound(flights);
    return el('Geometry', { node, transform: [tTranslate(p.at)] });
  },
  { props: stairSchema }
);
