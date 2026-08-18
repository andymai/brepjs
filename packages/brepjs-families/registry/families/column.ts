// brepjs-family: column@2
/**
 * Column — a vertical column (cross-section centred on `at`, extruded up by
 * `height`). Props feed the IFC column spec 1:1 in a BIM projection. The
 * render coincides with the spec solid: every profile is centred at the local
 * origin and extruded along +Z. I-beam outlines skip root fillets —
 * IfcIShapeProfileDef carries `filletRadius` parametrically, the viewport
 * outline stays sharp.
 */

import { csg } from 'brepjs';
import { family, el, tTranslate } from 'brepjs-families';
import { z } from 'zod';

// Mirrors the BIM parseProfile constraints so invalid dimensions fail at
// family construction instead of surviving to a rejected BIM projection.
const profileSchema = z
  .discriminatedUnion('kind', [
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
  ])
  .superRefine((v, ctx) => {
    if (v.kind !== 'I_BEAM') return;
    if (2 * v.flangeThickness >= v.overallDepth) {
      ctx.addIssue({
        code: 'custom',
        message: 'flangeThickness × 2 must be less than overallDepth',
      });
    }
    if (v.webThickness >= v.overallWidth) {
      ctx.addIssue({ code: 'custom', message: 'webThickness must be less than overallWidth' });
    }
    if (v.filletRadius !== undefined) {
      const clearHeight = v.overallDepth / 2 - v.flangeThickness;
      const clearSpan = (v.overallWidth - v.webThickness) / 2;
      if (v.filletRadius >= clearHeight || v.filletRadius >= clearSpan) {
        ctx.addIssue({ code: 'custom', message: 'filletRadius must fit the web-flange notch' });
      }
    }
  });

export const columnSchema = z.object({
  height: z.number().positive(),
  profile: profileSchema,
  at: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  predefinedType: z.enum(['COLUMN', 'PILASTER', 'NOTDEFINED']).default('COLUMN'),
  materialName: z.string().min(1).default('Concrete'),
  isExternal: z.boolean().optional(),
  loadBearing: z.boolean().optional(),
  fireRating: z.string().optional(),
});

export type ColumnProps = z.input<typeof columnSchema>;

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

export const Column = family(
  'Column',
  (p: z.output<typeof columnSchema>) => {
    if (p.profile.kind === 'CIRCULAR') {
      return el('Cylinder', {
        radius: p.profile.radius,
        height: p.height,
        transform: [tTranslate(p.at)],
      });
    }
    const points = profilePoints(p.profile).map(([px, py]): [number, number, number] => [
      px,
      py,
      0,
    ]);
    return el('Geometry', {
      node: csg.extrude(csg.polygon(points), [0, 0, p.height]),
      transform: [tTranslate(p.at)],
    });
  },
  { props: columnSchema }
);
