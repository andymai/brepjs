import { describe, it, expect } from 'vitest';
import { encodePreviewPayload, decodePreviewPayload, type PreviewModelPayload } from '@/payload.js';

function samplePayload(): PreviewModelPayload {
  return {
    data: {
      position: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normal: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      index: new Uint32Array([0, 1, 2]),
      edges: new Float32Array([0, 0, 0, 1, 0, 0]),
      faceGroups: [{ start: 0, count: 3, faceId: 7 }],
    },
    elements: [{ keyPath: 'assembly/panel', start: 0, count: 3 }],
    failed: ['assembly/broken'],
    tree: {
      keyPath: 'assembly',
      type: 'Group',
      hasGeometry: false,
      children: [
        { keyPath: 'assembly/panel', type: 'Box', name: 'panel', hasGeometry: true, children: [] },
      ],
    },
    measurements: {
      bounds: { xMin: 0, xMax: 1, yMin: 0, yMax: 1, zMin: 0, zMax: 0 },
      elementCount: 1,
      failedCount: 1,
      triangleCount: 1,
    },
  };
}

describe('preview payload codec', () => {
  it('round-trips data, identity, tree, and measurements', () => {
    const original = samplePayload();
    const decoded = decodePreviewPayload(encodePreviewPayload(original));
    expect(Array.from(decoded.data.position)).toEqual(Array.from(original.data.position));
    expect(Array.from(decoded.data.normal)).toEqual(Array.from(original.data.normal));
    expect(Array.from(decoded.data.index)).toEqual(Array.from(original.data.index));
    expect(Array.from(decoded.data.edges)).toEqual(Array.from(original.data.edges));
    expect(decoded.data.faceGroups).toEqual(original.data.faceGroups);
    expect(decoded.elements).toEqual(original.elements);
    expect(decoded.failed).toEqual(original.failed);
    expect(decoded.tree).toEqual(original.tree);
    expect(decoded.measurements).toEqual(original.measurements);
  });

  it('survives a non-4-aligned header length', () => {
    const p = { ...samplePayload(), failed: ['x'] };
    const decoded = decodePreviewPayload(encodePreviewPayload(p));
    expect(decoded.failed).toEqual(['x']);
    expect(Array.from(decoded.data.index)).toEqual([0, 1, 2]);
  });

  it('rejects garbage and version drift', () => {
    expect(() => decodePreviewPayload(new ArrayBuffer(4))).toThrow(/magic/);
    const buf = encodePreviewPayload(samplePayload());
    const bad = buf.slice(0);
    new DataView(bad).setUint32(0, 0xdeadbeef, true);
    expect(() => decodePreviewPayload(bad)).toThrow(/magic/);
  });
});
