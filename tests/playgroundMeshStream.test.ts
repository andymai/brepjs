import { describe, expect, it } from 'vitest';
import { applyMeshPartial, shownMeshes } from '../apps/playground/src/lib/meshStream.js';

interface TestMesh {
  position: Float32Array;
}

function mesh(vertexCount: number): TestMesh {
  return { position: new Float32Array(vertexCount * 3) };
}

describe('playground mesh stream', () => {
  it('starts with the draft and leaves out a shape that failed', () => {
    const a = mesh(3);
    const c = mesh(6);
    const slots = applyMeshPartial(null, {
      stage: 'draft',
      meshes: [a, null, c],
    });
    expect(slots).toEqual([a, null, c]);
    expect(shownMeshes(slots ?? [])).toEqual([a, c]);
  });

  it('replaces one slot with its final mesh and keeps the shape order', () => {
    const draft = [mesh(3), mesh(3), mesh(3)];
    const final = mesh(30);
    const slots = applyMeshPartial(draft, {
      stage: 'shape',
      index: 1,
      mesh: final,
    });
    expect(slots).not.toBe(draft);
    expect(shownMeshes(slots ?? [])).toEqual([draft[0], final, draft[2]]);
  });

  it('drops the draft of a shape whose final mesh failed', () => {
    const draft = [mesh(3), mesh(3)];
    const slots = applyMeshPartial(draft, {
      stage: 'shape',
      index: 0,
      mesh: null,
    });
    expect(shownMeshes(slots ?? [])).toEqual([draft[1]]);
  });

  it('ignores a shape message that has no stream or no slot', () => {
    const shape = { stage: 'shape', mesh: mesh(3) } as const;
    expect(applyMeshPartial(null, { ...shape, index: 0 })).toBeNull();
    expect(applyMeshPartial([mesh(3)], { ...shape, index: 4 })).toBeNull();
  });

  it('starts again when a new draft arrives', () => {
    const next = mesh(9);
    const slots = applyMeshPartial([mesh(3), mesh(3)], {
      stage: 'draft',
      meshes: [next],
    });
    expect(slots).toEqual([next]);
  });
});
