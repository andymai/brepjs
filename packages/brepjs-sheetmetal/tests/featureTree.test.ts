import { describe, it, expect } from 'vitest';
import { buildFeatureTree, type FeatureGraph } from '../src/featureTreeFns.js';
import type { BendFeature } from '../src/types.js';

function bend(id: string): BendFeature {
  return {
    id,
    axisOrigin: [0, 0, 0],
    axisDir: [0, 1, 0],
    angleDeg: 90,
    direction: 'up',
    rule: { innerRadius: 1, kFactor: 0.44 },
  };
}

// A cyclic feature graph (root + two flats joined to each other and to root) —
// the kind a closed/box profile produces. The non-tree edge must become a seam.
function cyclicGraph(): FeatureGraph {
  return {
    nodes: new Map([
      ['root', { id: 'root', isRoot: true }],
      ['a', { id: 'a', isRoot: false }],
      ['b', { id: 'b', isRoot: false }],
    ]),
    edges: [
      { bend: bend('r-a'), parent: 'root', child: 'a' },
      { bend: bend('r-b'), parent: 'root', child: 'b' },
      { bend: bend('a-b'), parent: 'a', child: 'b' },
    ],
  };
}

describe('buildFeatureTree — seam cuts on closed profiles', () => {
  it('turns the non-tree edge into a seam with a SEAM_CUT warning', () => {
    const result = buildFeatureTree(cyclicGraph());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.seams).toHaveLength(1);
    expect(result.value.warnings.some((w) => w.code === 'SEAM_CUT')).toBe(true);
  });

  it('does not mislabel seam cuts as COLLISION (the flange-interference code)', () => {
    const result = buildFeatureTree(cyclicGraph());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.warnings.every((w) => w.code !== 'COLLISION')).toBe(true);
  });
});
