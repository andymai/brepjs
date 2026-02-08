import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { box, castShape, mesh, exportGltf, exportGlb } from '../src/index.js';
import type { ShapeMesh, GltfExportOptions } from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

function getBoxMesh(): ShapeMesh {
  const b = box(10, 10, 10);
  const shape = castShape(b.wrapped);
  return mesh(shape);
}

describe('exportGltf', () => {
  it('produces valid glTF JSON', () => {
    const m = getBoxMesh();
    const json = exportGltf(m);
    const doc = JSON.parse(json);
    expect(doc.asset.version).toBe('2.0');
    expect(doc.asset.generator).toBe('brepjs');
  });

  it('has correct structure', () => {
    const m = getBoxMesh();
    const json = exportGltf(m);
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
    const m = getBoxMesh();
    const json = exportGltf(m);
    const doc = JSON.parse(json);

    // Indices accessor
    expect(doc.accessors[0].count).toBe(m.triangles.length);
    expect(doc.accessors[0].type).toBe('SCALAR');

    // Position accessor
    expect(doc.accessors[1].count).toBe(m.vertices.length / 3);
    expect(doc.accessors[1].type).toBe('VEC3');
    expect(doc.accessors[1].min).toHaveLength(3);
    expect(doc.accessors[1].max).toHaveLength(3);

    // Normal accessor
    expect(doc.accessors[2].count).toBe(m.normals.length / 3);
    expect(doc.accessors[2].type).toBe('VEC3');
  });

  it('has embedded base64 buffer', () => {
    const m = getBoxMesh();
    const json = exportGltf(m);
    const doc = JSON.parse(json);

    expect(doc.buffers).toHaveLength(1);
    expect(doc.buffers[0].uri).toMatch(/^data:application\/octet-stream;base64,/);
    expect(doc.buffers[0].byteLength).toBeGreaterThan(0);
  });

  it('min/max bounds are correct for a 10x10x10 box', () => {
    const m = getBoxMesh();
    const json = exportGltf(m);
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
    const m = getBoxMesh();
    const glb = exportGlb(m);
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
    const m = getBoxMesh();
    const glb = exportGlb(m);
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
    const m = getBoxMesh();
    const glb = exportGlb(m);
    expect(glb.byteLength).toBeGreaterThan(100);
  });
});

describe('glTF with materials', () => {
  function getMeshWithMaterials(): { mesh: ShapeMesh; options: GltfExportOptions } {
    const m = getBoxMesh();
    // Assign two different materials to face groups
    const redMat = {
      name: 'red',
      baseColor: [1, 0, 0, 1] as [number, number, number, number],
      metallic: 0,
      roughness: 0.8,
    };
    const blueMat = {
      name: 'blue',
      baseColor: [0, 0, 1, 1] as [number, number, number, number],
      metallic: 0.5,
      roughness: 0.3,
    };
    const materials = new Map<number, typeof redMat>();
    // Assign first face group to red, second to blue
    for (let i = 0; i < m.faceGroups.length; i++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- i < length
      const fg = m.faceGroups[i]!;
      materials.set(fg.faceId, i % 2 === 0 ? redMat : blueMat);
    }
    return { mesh: m, options: { materials } };
  }

  it('exportGltf includes materials array', () => {
    const { mesh: m, options } = getMeshWithMaterials();
    const json = exportGltf(m, options);
    const doc = JSON.parse(json);

    expect(doc.materials).toBeDefined();
    expect(doc.materials.length).toBeGreaterThanOrEqual(1);
  });

  it('materials have PBR properties', () => {
    const { mesh: m, options } = getMeshWithMaterials();
    const json = exportGltf(m, options);
    const doc = JSON.parse(json);

    for (const mat of doc.materials) {
      expect(mat.pbrMetallicRoughness).toBeDefined();
      expect(mat.pbrMetallicRoughness.baseColorFactor).toHaveLength(4);
      expect(typeof mat.pbrMetallicRoughness.metallicFactor).toBe('number');
      expect(typeof mat.pbrMetallicRoughness.roughnessFactor).toBe('number');
    }
  });

  it('primitives reference material indices', () => {
    const { mesh: m, options } = getMeshWithMaterials();
    const json = exportGltf(m, options);
    const doc = JSON.parse(json);

    const primitives = doc.meshes[0].primitives;
    expect(primitives.length).toBeGreaterThan(0);

    // At least one primitive should have a material index
    const hasMaterial = primitives.some((p: { material?: number }) => p.material !== undefined);
    expect(hasMaterial).toBe(true);
  });

  it('total triangle count matches across primitives', () => {
    const { mesh: m, options } = getMeshWithMaterials();
    const json = exportGltf(m, options);
    const doc = JSON.parse(json);

    let totalIndices = 0;
    for (const prim of doc.meshes[0].primitives) {
      const indicesAcc = doc.accessors[prim.indices];
      totalIndices += indicesAcc.count;
    }
    expect(totalIndices).toBe(m.triangles.length);
  });

  it('exportGltf has embedded base64 buffer with materials', () => {
    const { mesh: m, options } = getMeshWithMaterials();
    const json = exportGltf(m, options);
    const doc = JSON.parse(json);

    expect(doc.buffers).toHaveLength(1);
    expect(doc.buffers[0].uri).toMatch(/^data:application\/octet-stream;base64,/);
    expect(doc.buffers[0].byteLength).toBeGreaterThan(0);
  });

  it('exportGlb produces valid GLB with materials', () => {
    const { mesh: m, options } = getMeshWithMaterials();
    const glb = exportGlb(m, options);
    expect(glb).toBeInstanceOf(ArrayBuffer);

    const view = new DataView(glb);
    expect(view.getUint32(0, true)).toBe(0x46546c67); // "glTF"
    expect(view.getUint32(4, true)).toBe(2);
    expect(view.getUint32(8, true)).toBe(glb.byteLength);

    // Parse JSON chunk to verify materials
    const jsonLen = view.getUint32(12, true);
    const jsonBytes = new Uint8Array(glb, 20, jsonLen);
    const jsonStr = new TextDecoder().decode(jsonBytes).trim();
    const doc = JSON.parse(jsonStr);
    expect(doc.materials).toBeDefined();
    expect(doc.materials.length).toBeGreaterThanOrEqual(1);
  });
});
