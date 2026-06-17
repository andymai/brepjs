/**
 * BIM examples — parametric IFC4 building elements authored with the
 * `brepjs-bim` domain package. Each builds a `BimModel`, reads an element's
 * brepjs solid back out for display, and could serialize to IFC via `toIfc`.
 * See the module-authoring rules in ./types.
 */
import type { Example } from './types';

export const BIM_EXAMPLES: readonly Example[] = [
  {
    id: 'bim-steel-beam',
    label: 'Steel I-Beam',
    description:
      'A parametric structural-steel wide-flange (I-beam) authored through a BimModel. The element carries a brepjs solid for display and the model serializes to IFC.',
    code: `import { BimModel } from 'brepjs-bim';

// A parametric structural-steel I-beam (wide-flange section), authored through
// the BIM model rather than as raw geometry. The element carries a brepjs solid
// (shown here); the same model serializes to a real IFC file via toIfc(model).
// Tune the length and the I_BEAM section dimensions.
const model = new BimModel();
model.init({ name: 'Beam example' });

const beam = model.addBeam({
  length: 1500,
  profile: {
    kind: 'I_BEAM',
    overallWidth: 150,
    overallDepth: 300,
    flangeThickness: 12,
    webThickness: 8,
  },
  origin: [0, 0, 0],
  axisX: [1, 0, 0],
  axisZ: [0, 0, 1],
  materialName: 'Steel',
});
if (!beam.ok) throw beam.error;

export default model.getBeams()[0].geometry;
`,
  },
];
