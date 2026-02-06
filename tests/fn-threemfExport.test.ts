import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { makeBox, meshShape, exportThreeMF } from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('exportThreeMF', () => {
  it('produces valid ZIP with correct magic bytes', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const mesh = meshShape(box);
    const result = exportThreeMF(mesh);

    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(result.byteLength).toBeGreaterThan(100);

    // Check ZIP magic bytes (PK\x03\x04)
    const bytes = new Uint8Array(result);
    expect(bytes[0]).toBe(0x50); // P
    expect(bytes[1]).toBe(0x4b); // K
    expect(bytes[2]).toBe(0x03);
    expect(bytes[3]).toBe(0x04);
  });

  it('contains expected XML content', () => {
    const box = makeBox([0, 0, 0], [5, 5, 5]);
    const mesh = meshShape(box);
    const result = exportThreeMF(mesh, { name: 'test-box', unit: 'meter' });

    // Decode the entire ZIP as text to check for XML content
    const text = new TextDecoder().decode(result);
    expect(text).toContain('[Content_Types].xml');
    expect(text).toContain('3D/3dmodel.model');
    expect(text).toContain('test-box');
    expect(text).toContain('unit="meter"');
    expect(text).toContain('<vertex');
    expect(text).toContain('<triangle');
  });

  it('includes correct number of vertices and triangles', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const mesh = meshShape(box);
    const result = exportThreeMF(mesh);

    const text = new TextDecoder().decode(result);
    const vertexCount = (text.match(/<vertex /g) ?? []).length;
    const triCount = (text.match(/<triangle /g) ?? []).length;

    expect(vertexCount).toBe(mesh.vertices.length / 3);
    expect(triCount).toBe(mesh.triangles.length / 3);
  });

  it('defaults to millimeter unit', () => {
    const box = makeBox([0, 0, 0], [1, 1, 1]);
    const mesh = meshShape(box);
    const result = exportThreeMF(mesh);
    const text = new TextDecoder().decode(result);
    expect(text).toContain('unit="millimeter"');
  });
});
