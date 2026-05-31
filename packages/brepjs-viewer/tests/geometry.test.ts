import { describe, it, expect } from 'vitest';
import { buildGeometry, findFaceGroupAt } from '@/geometry.js';
import type { MeshData } from '@/types.js';

const data: MeshData = {
  position: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  normal: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
  index: new Uint32Array([0, 1, 2]),
  edges: new Float32Array([]),
  faceGroups: [{ start: 0, count: 3, faceId: 7 }],
};

describe('render core', () => {
  it('buildGeometry sets position/normal/index attributes', () => {
    const g = buildGeometry(data);
    expect(g.getAttribute('position').count).toBe(3);
    expect(g.getAttribute('normal').count).toBe(3);
    expect(g.getIndex()?.count).toBe(3);
  });
  it('findFaceGroupAt maps a triangle index to its faceId via binary search', () => {
    expect(findFaceGroupAt(data.faceGroups!, 0)?.faceId).toBe(7);
    expect(findFaceGroupAt(data.faceGroups!, 5)).toBeNull();
  });
});
