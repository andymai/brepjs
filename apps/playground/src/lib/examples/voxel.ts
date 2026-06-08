/**
 * Voxel / SDF examples — when to reach past B-rep for a signed-distance field.
 * The headline is TPMS lattice infill: B-rep CSG can't fill a solid with a
 * triply-periodic minimal surface, but the voxel engine does it in a few lines.
 * Voxel ops return a raw triangle mesh (no B-rep topology), so picking and
 * per-face inspection are unavailable. See the module-authoring rules in ./types.
 */
import type { Example } from './types';

const lightweightPart = `import { box, cut, unwrap } from 'brepjs/quick';
import { latticeInfillShape } from 'brepjs';

// LIGHTWEIGHTING — the flagship voxel use case. Swap a part's solid interior for
// a gyroid TPMS lattice: large mass savings, retained stiffness, self-supporting
// for printing. Lattices are voxel/SDF-only — B-rep CSG can't build a
// triply-periodic minimal surface. latticeInfillShape voxelizes the solid,
// intersects it with the gyroid field, and contours back to a mesh (not a Solid).
const part = unwrap(cut(box(48, 34, 24), box(22, 42, 12, { at: [13, -4, 12] })));
const light = unwrap(
  latticeInfillShape(part, { type: 'gyroid', period: 11, thickness: 1.6, resolution: 96 })
);

export default light;
`;

const tpmsFamilies = `import { box, translate, unwrap } from 'brepjs/quick';
import { latticeInfillShape } from 'brepjs';

// THE THREE TPMS FAMILIES brepjs ships — same cube, same period/thickness, side
// by side. Each is a distinct minimal surface with different stiffness, surface
// area, and printability; pick the one your part needs. Returning an array
// renders them all. Higher 'resolution' = smoother but slower.
const opts = { period: 12, thickness: 1.7, resolution: 78 };
const cube = () => box(26, 26, 26);
const gyroid = unwrap(latticeInfillShape(translate(cube(), [-32, 0, 0]), { ...opts, type: 'gyroid' }));
const diamond = unwrap(latticeInfillShape(cube(), { ...opts, type: 'diamond' }));
const schwarz = unwrap(latticeInfillShape(translate(cube(), [32, 0, 0]), { ...opts, type: 'schwarzP' }));

export default [gyroid, diamond, schwarz];
`;

export const VOXEL_EXAMPLES: readonly Example[] = [
  {
    id: 'lattice-lightweighting',
    label: 'Lattice lightweighting',
    description:
      'Replace a part’s solid interior with a gyroid TPMS lattice — the mass-saving trick only a voxel kernel can do.',
    code: lightweightPart,
  },
  {
    id: 'tpms-families',
    label: 'TPMS lattice families',
    description: 'Gyroid, Diamond, and Schwarz-P lattices side by side — the voxel lattice design space.',
    code: tpmsFamilies,
  },
];
