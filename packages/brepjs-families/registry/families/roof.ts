// brepjs-family: roof@1
/**
 * Roof — a rectangular roof over a corner-origin length × width footprint.
 * Props feed the IFC roof spec 1:1 in a BIM projection. Presence of `pitch`
 * opts into shaped geometry for the predefinedType (shed / gable / hip /
 * dome), matching the spec-solid rule; flat otherwise. Flat, shed, and gable
 * renders reproduce the spec solid exactly; hip is the intersection of two
 * gable prisms (the classic construction) and dome is a stepped stack of
 * 24-gon prisms over the spec path's hull rings. Both use planar faces only:
 * lofted, conical, and spherical surfaces all hang the occt-wasm mesher. The
 * IFC body stays authoritative.
 */

import { csg } from 'brepjs';
import { family, el, tTranslate } from 'brepjs-families';
import { z } from 'zod';

export const roofSchema = z.object({
  length: z.number().positive(),
  width: z.number().positive(),
  thickness: z.number().positive(),
  at: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
  predefinedType: z
    .enum([
      'FLAT_ROOF',
      'SHED_ROOF',
      'GABLE_ROOF',
      'HIP_ROOF',
      'HIPPED_GABLE_ROOF',
      'GAMBREL_ROOF',
      'MANSARD_ROOF',
      'BARREL_ROOF',
      'RAINBOW_ROOF',
      'BUTTERFLY_ROOF',
      'PAVILION_ROOF',
      'DOME_ROOF',
      'FREEFORM',
      'NOTDEFINED',
    ])
    .default('FLAT_ROOF'),
  pitch: z.number().positive().max(89).optional(),
  materialName: z.string().min(1).default('Concrete'),
  isExternal: z.boolean().optional(),
  fireRating: z.string().optional(),
});

export type RoofProps = z.input<typeof roofSchema>;

const DEG2RAD = Math.PI / 180;

function shedNode(l: number, w: number, t: number, pitch: number): csg.IRNode {
  const rise = w * Math.tan(pitch * DEG2RAD);
  return csg.extrude(
    csg.polygon([
      [0, 0, 0],
      [0, w, 0],
      [0, w, t + rise],
      [0, 0, t],
    ]),
    [l, 0, 0]
  );
}

function gableNode(l: number, w: number, t: number, pitch: number): csg.IRNode {
  const ridge = (w / 2) * Math.tan(pitch * DEG2RAD);
  return csg.extrude(
    csg.polygon([
      [0, 0, 0],
      [0, w, 0],
      [0, w, t],
      [0, w / 2, t + ridge],
      [0, 0, t],
    ]),
    [l, 0, 0]
  );
}

function hipNode(l: number, w: number, pitch: number): csg.IRNode {
  const tan = Math.tan(pitch * DEG2RAD);
  const alongX = csg.extrude(
    csg.polygon([
      [0, 0, 0],
      [0, w, 0],
      [0, w / 2, (w / 2) * tan],
    ]),
    [l, 0, 0]
  );
  const alongY = csg.extrude(
    csg.polygon([
      [0, 0, 0],
      [l, 0, 0],
      [l / 2, 0, (l / 2) * tan],
    ]),
    [0, w, 0]
  );
  return csg.intersect(alongX, alongY);
}

function domeNode(l: number, w: number): csg.IRNode {
  const r = Math.min(l, w) / 2;
  const cx = l / 2;
  const cy = w / 2;
  const segments = 24;
  const rings = [0, 0.4, 0.7, 0.9, 0.995];
  const steps: csg.IRNode[] = [];
  for (let i = 0; i < rings.length - 1; i++) {
    const h0 = rings[i] ?? 0;
    const h1 = rings[i + 1] ?? 0;
    const ringR = r * Math.sqrt(1 - h0 * h0);
    const pts: Array<[number, number, number]> = [];
    for (let j = 0; j < segments; j++) {
      const a = (2 * Math.PI * j) / segments;
      pts.push([cx + ringR * Math.cos(a), cy + ringR * Math.sin(a), r * h0]);
    }
    steps.push(csg.extrude(csg.polygon(pts), [0, 0, r * (h1 - h0)]));
  }
  return csg.fuseAll(steps);
}

function roofNode(p: z.output<typeof roofSchema>): csg.IRNode {
  if (p.pitch === undefined) return csg.box(p.length, p.width, p.thickness);
  switch (p.predefinedType) {
    case 'SHED_ROOF':
      return shedNode(p.length, p.width, p.thickness, p.pitch);
    case 'GABLE_ROOF':
      return gableNode(p.length, p.width, p.thickness, p.pitch);
    case 'HIP_ROOF':
      return hipNode(p.length, p.width, p.pitch);
    case 'DOME_ROOF':
      return domeNode(p.length, p.width);
    default:
      return csg.box(p.length, p.width, p.thickness);
  }
}

export const Roof = family(
  'Roof',
  (p: z.output<typeof roofSchema>) =>
    el('Geometry', { node: roofNode(p), transform: [tTranslate(p.at)] }),
  { props: roofSchema }
);
