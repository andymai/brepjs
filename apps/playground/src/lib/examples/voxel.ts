/**
 * Voxel / SDF examples — when to reach past B-rep for a signed-distance field.
 * Each one is a practical job a voxel kernel does better than (or instead of)
 * B-rep, with a comment naming the B-rep limitation it sidesteps. Voxel ops
 * return a raw triangle mesh (no B-rep topology), so picking and per-face
 * inspection are unavailable. See the module-authoring rules in ./types.
 */
import type { Example } from './types';

const latticeLightweighting = `import { box, cut, unwrap } from 'brepjs/quick';
import { latticeInfillShape } from 'brepjs';

// USE VOXELS WHEN you need a lattice. B-rep CSG can't build a triply-periodic
// minimal surface at all — latticeInfillShape voxelizes the solid, intersects it
// with the gyroid field, and contours a mesh. Lightweighting: cut mass, keep
// stiffness, stay self-supporting to print.
const part = unwrap(cut(box(48, 34, 24), box(22, 42, 12, { at: [13, -4, 12] })));
const light = unwrap(
  latticeInfillShape(part, { type: 'gyroid', period: 11, thickness: 1.6, resolution: 128 })
);

export default light;
`;

const robustOffset = `import { box, cut, translate, unwrap } from 'brepjs/quick';
import { offsetShape } from 'brepjs';

// USE VOXELS WHEN an offset must round concave or thin features. B-rep offset
// self-intersects there and fails; the voxel offset just shifts the SDF
// iso-surface, so it rounds smoothly and can't self-intersect. Left: the sharp
// part. Right: the same part offset +2 mm — every edge rounded.
const part = unwrap(cut(box(38, 38, 22), box(44, 14, 12, { at: [-3, 12, 5] })));
const rounded = unwrap(offsetShape(part, 2, { resolution: 150 }));

export default [translate(part, [-48, 0, 0]), rounded];
`;

const robustBoolean = `import { box, translate, unwrap } from 'brepjs/quick';
import { voxelBooleanShapes } from 'brepjs';

// USE VOXELS WHEN a boolean hits coincident or tangent faces. B-rep BOPAlgo can
// throw on those degenerate cases; voxel CSG is just min/max on two distance
// fields, so it always returns a clean mesh (edges soften with resolution — the
// price of robustness). Here: union of two overlapping blocks.
const a = box(34, 34, 20);
const b = translate(box(20, 20, 34), [20, 20, -7]);

export default unwrap(voxelBooleanShapes(a, b, 'union', { resolution: 130 }));
`;

const opChain = `import { box, translate, unwrap } from 'brepjs/quick';
import { voxelBooleanFieldShapes } from 'brepjs';

// USE VOXELS WHEN you chain ops. B-rep re-solves the whole model at each boolean
// or offset and can fail or drift; a voxel field is ONE grid you mutate in place,
// with Fast-Sweeping keeping it a true SDF between steps. 'using' frees the WASM
// grid on scope exit. Here: fuse two blocks, then offset the joined result +2 mm
// — in a single field, contoured once. ('padding' leaves room for the offset to
// grow into; the field's grid bounds are fixed once built.)
const a = box(34, 34, 24);
const b = translate(box(26, 26, 24), [22, 22, 0]);
using field = unwrap(voxelBooleanFieldShapes(a, b, 'union', { resolution: 120, padding: 8 }));

export default field.offset(2).contour();
`;

export const VOXEL_EXAMPLES: readonly Example[] = [
  {
    id: 'lattice-lightweighting',
    label: 'Lattice lightweighting',
    description:
      'Fill a part with a gyroid TPMS lattice to cut mass — a lattice only a voxel kernel can build.',
    code: latticeLightweighting,
  },
  {
    id: 'robust-offset',
    label: 'Robust offset (rounding)',
    description:
      'Offset/round a part where B-rep offset would self-intersect — sharp vs rounded, side by side.',
    code: robustOffset,
  },
  {
    id: 'robust-boolean',
    label: 'Robust boolean (CSG)',
    description:
      'Union via min/max on distance fields — clean where B-rep BOPAlgo throws on degenerate faces.',
    code: robustBoolean,
  },
  {
    id: 'voxel-op-chain',
    label: 'Op-chain: union then offset',
    description:
      'Chain boolean → offset on one persistent voxel field — robust where B-rep re-solves every step.',
    code: opChain,
  },
];
