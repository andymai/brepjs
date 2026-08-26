import { describe, it, expect } from 'vitest';
import {
  encodePreviewPayload,
  decodePreviewPayload,
  PREVIEW_PAYLOAD_MAGIC,
  PREVIEW_PAYLOAD_VERSION,
  type PreviewModelPayload,
} from '@/payload.js';

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
    expect(new DataView(buf).getUint32(0, true)).toBe(PREVIEW_PAYLOAD_MAGIC);
    const badMagic = buf.slice(0);
    new DataView(badMagic).setUint32(0, 0xdeadbeef, true);
    expect(() => decodePreviewPayload(badMagic)).toThrow(/magic/);
    // A stale viewer tab against a newer CLI must fail loudly, not misparse.
    expect(() => decodePreviewPayload(withHeaderVersion(buf, PREVIEW_PAYLOAD_VERSION + 1))).toThrow(
      /unsupported preview payload version/
    );
  });
});

function withHeaderVersion(buf: ArrayBuffer, version: number): ArrayBuffer {
  const view = new DataView(buf);
  const headerLength = view.getUint32(4, true);
  const header = JSON.parse(
    new TextDecoder().decode(new Uint8Array(buf, 8, headerLength))
  ) as Record<string, unknown>;
  header['version'] = version;
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const pad4 = (n: number): number => (n + 3) & ~3;
  const oldBody = new Uint8Array(buf, 8 + pad4(headerLength));
  const out = new ArrayBuffer(8 + pad4(headerBytes.length) + oldBody.length);
  const outView = new DataView(out);
  outView.setUint32(0, view.getUint32(0, true), true);
  outView.setUint32(4, headerBytes.length, true);
  new Uint8Array(out, 8, headerBytes.length).set(headerBytes);
  new Uint8Array(out, 8 + pad4(headerBytes.length)).set(oldBody);
  return out;
}
