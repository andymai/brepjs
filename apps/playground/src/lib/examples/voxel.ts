/**
 * Voxel / SDF examples — operations that run on a signed-distance field rather
 * than B-rep. TPMS lattice infill is the headline: B-rep CSG can't fill a solid
 * with a triply-periodic minimal surface, but the voxel engine does it in a few
 * lines. These return a raw triangle mesh (no B-rep topology), so picking and
 * per-face inspection are unavailable. See the module-authoring rules in ./types.
 */
import type { Example } from './types';

const gyroidBlock = `import { box, unwrap } from 'brepjs/quick';
import { latticeInfillShape } from 'brepjs';

// Fill a solid with a gyroid TPMS lattice — a voxel/SDF operation B-rep CSG
// can't do directly. Returns a contoured triangle mesh, not a Solid.
const block = box(40, 40, 40);
const lattice = unwrap(
  latticeInfillShape(block, { type: 'gyroid', period: 12, thickness: 1.6 })
);

export default lattice;
`;

const diamondSphere = `import { sphere, unwrap } from 'brepjs/quick';
import { latticeInfillShape } from 'brepjs';

// A Diamond-family TPMS lattice clipped to a sphere. Swap the family
// ('gyroid' | 'schwarzP' | 'diamond') and tune period / thickness.
const ball = sphere(22);
const lattice = unwrap(
  latticeInfillShape(ball, { type: 'diamond', period: 11, thickness: 1.8 })
);

export default lattice;
`;

export const VOXEL_EXAMPLES: readonly Example[] = [
  {
    id: 'gyroid-infill',
    label: 'Gyroid lattice block',
    description: 'A 40 mm cube filled with a gyroid TPMS lattice via the voxel engine.',
    code: gyroidBlock,
  },
  {
    id: 'diamond-sphere',
    label: 'Diamond lattice sphere',
    description: 'A Diamond-family TPMS lattice clipped to a sphere.',
    code: diamondSphere,
  },
];
