import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { makeBox, castShape, meshShape, exportGltf, exportGlb } from '../src/index.js';
import type { FnShapeMesh } from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

function getBoxMesh(): FnShapeMesh {
  const box = makeBox([0, 0, 0], [10, 10, 10]);
  const shape = castShape(box.wrapped);
  return meshShape(shape);
}

describe('exportGltf', () => {
  it('produces valid glTF JSON', () => {
    const mesh = getBoxMesh();
    const json = exportGltf(mesh);
    const doc = JSON.parse(json);
    expect(doc.asset.version).toBe('2.0');
    expect(doc.asset.generator).toBe('brepjs');
  });

  it('has correct structure', () => {
    const mesh = getBoxMesh();
    const json = exportGltf(mesh);
    const doc = JSON.parse(json);

    expect(doc.scenes).toHaveLength(1);
    expect(doc.nodes).toHaveLength(1);
    expect(doc.meshes).toHaveLength(1);
    expect(doc.meshes[0].primitives).toHaveLength(1);
    expect(doc.meshes[0].primitives[0].attributes.POSITION).toBe(1);
    expect(doc.meshes[0].primitives[0].attributes.NORMAL).toBe(2);
    expect(doc.meshes[0].primitives[0].indices).toBe(0);
  });

  it('has correct accessor counts', () => {
    const mesh = getBoxMesh();
    const json = exportGltf(mesh);
    const doc = JSON.parse(json);

    // Indices accessor
    expect(doc.accessors[0].count).toBe(mesh.triangles.length);
    expect(doc.accessors[0].type).toBe('SCALAR');

    // Position accessor
    expect(doc.accessors[1].count).toBe(mesh.vertices.length / 3);
    expect(doc.accessors[1].type).toBe('VEC3');
    expect(doc.accessors[1].min).toHaveLength(3);
    expect(doc.accessors[1].max).toHaveLength(3);

    // Normal accessor
    expect(doc.accessors[2].count).toBe(mesh.normals.length / 3);
    expect(doc.accessors[2].type).toBe('VEC3');
  });

  it('has embedded base64 buffer', () => {
    const mesh = getBoxMesh();
    const json = exportGltf(mesh);
    const doc = JSON.parse(json);

    expect(doc.buffers).toHaveLength(1);
    expect(doc.buffers[0].uri).toMatch(/^data:application\/octet-stream;base64,/);
    expect(doc.buffers[0].byteLength).toBeGreaterThan(0);
  });

  it('min/max bounds are correct for a 10x10x10 box', () => {
    const mesh = getBoxMesh();
    const json = exportGltf(mesh);
    const doc = JSON.parse(json);

    const min = doc.accessors[1].min;
    const max = doc.accessors[1].max;
    expect(min[0]).toBeCloseTo(0, 1);
    expect(min[1]).toBeCloseTo(0, 1);
    expect(min[2]).toBeCloseTo(0, 1);
    expect(max[0]).toBeCloseTo(10, 1);
    expect(max[1]).toBeCloseTo(10, 1);
    expect(max[2]).toBeCloseTo(10, 1);
  });
});

describe('exportGlb', () => {
  it('produces valid GLB binary', () => {
    const mesh = getBoxMesh();
    const glb = exportGlb(mesh);
    expect(glb).toBeInstanceOf(ArrayBuffer);

    const view = new DataView(glb);
    // Magic: "glTF"
    expect(view.getUint32(0, true)).toBe(0x46546c67);
    // Version: 2
    expect(view.getUint32(4, true)).toBe(2);
    // Total length matches buffer size
    expect(view.getUint32(8, true)).toBe(glb.byteLength);
  });

  it('has JSON and BIN chunks', () => {
    const mesh = getBoxMesh();
    const glb = exportGlb(mesh);
    const view = new DataView(glb);

    // First chunk: JSON
    const jsonChunkType = view.getUint32(16, true);
    expect(jsonChunkType).toBe(0x4e4f534a); // "JSON"

    // Parse JSON from the chunk
    const jsonLen = view.getUint32(12, true);
    const jsonBytes = new Uint8Array(glb, 20, jsonLen);
    const jsonStr = new TextDecoder().decode(jsonBytes).trim();
    const doc = JSON.parse(jsonStr);
    expect(doc.asset.version).toBe('2.0');

    // Second chunk: BIN
    const binChunkOffset = 20 + jsonLen;
    const binChunkType = view.getUint32(binChunkOffset + 4, true);
    expect(binChunkType).toBe(0x004e4942); // "BIN\0"
  });

  it('GLB size is > 0', () => {
    const mesh = getBoxMesh();
    const glb = exportGlb(mesh);
    expect(glb.byteLength).toBeGreaterThan(100);
  });
});
