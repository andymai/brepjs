// brepjs-family: beam@1
/**
 * Beam — a linear member (cross-section centred on the beam axis, extruded
 * along `axisX` by `length`). Props feed the IFC beam spec 1:1 in a BIM
 * projection. The render reproduces the placed spec solid: profile in the
 * plane perpendicular to the axis, profile-y up. I-beam outlines skip root
 * fillets — IfcIShapeProfileDef carries `filletRadius` parametrically, the
 * viewport outline stays sharp.
 */

import { csg } from 'brepjs';
import { family, el, tTranslate } from 'brepjs-families';
import { z } from 'zod';

const profileSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('RECTANGULAR'),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  z.object({ kind: z.literal('CIRCULAR'), radius: z.number().positive() }),
  z.object({
    kind: z.literal('I_BEAM'),
    overallWidth: z.number().positive(),
    overallDepth: z.number().positive(),
    flangeThickness: z.number().positive(),
    webThickness: z.number().positive(),
    filletRadius: z.number().positive().optional(),
  }),
]);

export const beamSchema = z.object({
  length: z.number().positive(),
  profile: profileSchema,
  at: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  axisX: z.tuple([z.number(), z.number(), z.number()]).default([1, 0, 0]),
  predefinedType: z
    .enum([
      'BEAM',
      'JOIST',
      'LINTEL',
      'HOLLOWCORE',
      'PURLIN',
      'RAFTER',
      'SPANDREL',
      'T_BEAM',
      'NOTDEFINED',
    ])
    .default('BEAM'),
  materialName: z.string().min(1).default('Steel'),
  isExternal: z.boolean().optional(),
  loadBearing: z.boolean().optional(),
  fireRating: z.string().optional(),
});

export type BeamProps = z.input<typeof beamSchema>;

type PolygonProfile = Extract<z.output<typeof profileSchema>, { kind: 'RECTANGULAR' | 'I_BEAM' }>;

function profilePoints(profile: PolygonProfile): ReadonlyArray<readonly [number, number]> {
  if (profile.kind === 'RECTANGULAR') {
    const hw = profile.width / 2;
    const hh = profile.height / 2;
    return [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ];
  }
  const hw = profile.overallWidth / 2;
  const hd = profile.overallDepth / 2;
  const hweb = profile.webThickness / 2;
  const fi = hd - profile.flangeThickness;
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, -fi],
    [hweb, -fi],
    [hweb, fi],
    [hw, fi],
    [hw, hd],
    [-hw, hd],
    [-hw, fi],
    [-hweb, fi],
    [-hweb, -fi],
    [-hw, -fi],
  ];
}

export const Beam = family(
  'Beam',
  (p: z.output<typeof beamSchema>) => {
    const alongY = p.axisX[1] !== 0;
    let node: csg.IRNode;
    if (p.profile.kind === 'CIRCULAR') {
      const prism = csg.cylinder(p.profile.radius, p.length);
      node = alongY
        ? csg.rotate(prism, -90, { axis: [1, 0, 0] })
        : csg.rotate(prism, 90, { axis: [0, 1, 0] });
    } else {
      // Placement frame per axis: along +X keeps profile-x on +Y; along +Y the
      // placement's local Y is world -X (Z cross axisX), so profile-x flips.
      const toWorld = alongY
        ? ([px, py]: readonly [number, number]): [number, number, number] => [-px, 0, py]
        : ([px, py]: readonly [number, number]): [number, number, number] => [0, px, py];
      const dir: [number, number, number] = alongY ? [0, p.length, 0] : [p.length, 0, 0];
      node = csg.extrude(csg.polygon(profilePoints(p.profile).map(toWorld)), dir);
    }
    return el('Geometry', { node, transform: [tTranslate(p.at)] });
  },
  { props: beamSchema }
);
