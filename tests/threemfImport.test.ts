import { describe, expect, it, beforeAll, vi } from 'vitest';
import { currentKernel, initKernel } from './setup.js';
import { skipIfDiverges } from './helpers/kernelDivergences.js';
import {
  box,
  exportThreeMF,
  getBounds,
  getFaces,
  getKernel,
  getShapeColor,
  getShells,
  getSolids,
  importThreeMF,
  isCompound,
  isShape3D,
  isSolid,
  isValid,
  measureVolume,
  mesh,
  unwrap,
} from '@/index.js';
import type { Shape3D, ThreeMFMaterial } from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

/**
 * Extract 3D/3dmodel.model XML from a store-only 3MF ZIP buffer.
 * Works by decoding the entire buffer as UTF-8 and finding the model XML.
 * Only valid for store-only (uncompressed) ZIPs — which is what exportThreeMF produces.
 */
function extractModelXmlFromStoreZip(buf: ArrayBuffer): string {
  const fullStr = new TextDecoder().decode(new Uint8Array(buf));
  const modelStart = fullStr.indexOf('<model');
  expect(modelStart).toBeGreaterThan(-1);
  const modelEnd = fullStr.indexOf('</model>', modelStart) + '</model>'.length;
  return fullStr.slice(modelStart, modelEnd);
}

/** Package a model XML as the only entry of a store-only 3MF ZIP. */
function modelZip(xml: string): Blob {
  const encoder = new TextEncoder();
  const xmlBytes = encoder.encode(xml);
  const fileName = '3D/3dmodel.model';
  const nameBytes = encoder.encode(fileName);

  // Build a store-only ZIP manually
  const localHeaderSize = 30 + nameBytes.length;
  const centralHeaderSize = 46 + nameBytes.length;
  const eocdSize = 22;
  const totalSize = localHeaderSize + xmlBytes.length + centralHeaderSize + eocdSize;
  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);
  const arr = new Uint8Array(buf);

  let offset = 0;
  // Local file header
  view.setUint32(offset, 0x04034b50, true);
  offset += 4; // signature
  view.setUint16(offset, 20, true);
  offset += 2; // version needed
  view.setUint16(offset, 0, true);
  offset += 2; // flags
  view.setUint16(offset, 0, true);
  offset += 2; // compression (store)
  view.setUint16(offset, 0, true);
  offset += 2; // mod time
  view.setUint16(offset, 0, true);
  offset += 2; // mod date
  view.setUint32(offset, 0, true);
  offset += 4; // crc32
  view.setUint32(offset, xmlBytes.length, true);
  offset += 4; // compressed size
  view.setUint32(offset, xmlBytes.length, true);
  offset += 4; // uncompressed size
  view.setUint16(offset, nameBytes.length, true);
  offset += 2; // name length
  view.setUint16(offset, 0, true);
  offset += 2; // extra length
  arr.set(nameBytes, offset);
  offset += nameBytes.length;
  arr.set(xmlBytes, offset);
  offset += xmlBytes.length;

  const cdOffset = offset;
  // Central directory header
  view.setUint32(offset, 0x02014b50, true);
  offset += 4;
  view.setUint16(offset, 20, true);
  offset += 2; // version made by
  view.setUint16(offset, 20, true);
  offset += 2; // version needed
  view.setUint16(offset, 0, true);
  offset += 2; // flags
  view.setUint16(offset, 0, true);
  offset += 2; // compression
  view.setUint16(offset, 0, true);
  offset += 2; // mod time
  view.setUint16(offset, 0, true);
  offset += 2; // mod date
  view.setUint32(offset, 0, true);
  offset += 4; // crc32
  view.setUint32(offset, xmlBytes.length, true);
  offset += 4; // compressed
  view.setUint32(offset, xmlBytes.length, true);
  offset += 4; // uncompressed
  view.setUint16(offset, nameBytes.length, true);
  offset += 2; // name len
  view.setUint16(offset, 0, true);
  offset += 2; // extra len
  view.setUint16(offset, 0, true);
  offset += 2; // comment len
  view.setUint16(offset, 0, true);
  offset += 2; // disk start
  view.setUint16(offset, 0, true);
  offset += 2; // internal attrs
  view.setUint32(offset, 0, true);
  offset += 4; // external attrs
  view.setUint32(offset, 0, true);
  offset += 4; // local header offset
  arr.set(nameBytes, offset);
  offset += nameBytes.length;

  const cdSize = offset - cdOffset;
  // EOCD
  view.setUint32(offset, 0x06054b50, true);
  offset += 4;
  view.setUint16(offset, 0, true);
  offset += 2; // disk number
  view.setUint16(offset, 0, true);
  offset += 2; // cd disk
  view.setUint16(offset, 1, true);
  offset += 2; // entries on disk
  view.setUint16(offset, 1, true);
  offset += 2; // total entries
  view.setUint32(offset, cdSize, true);
  offset += 4; // cd size
  view.setUint32(offset, cdOffset, true);
  offset += 4; // cd offset
  view.setUint16(offset, 0, true); // comment len
  return new Blob([arr]);
}

/** A `size` x `size` x `height` box mesh object with its own vertex list and outward winding. */
function cubeObject(id: number, size: number, height = size): string {
  return meshObject(id, [boxMesh(size, height)]);
}

type Vec3 = [number, number, number];

interface Mesh {
  vertices: Vec3[];
  triangles: Vec3[];
}

/** A `size` x `size` x `height` box at `at`, wound outward unless `inward`. */
function boxMesh(size: number, height = size, at: Vec3 = [0, 0, 0], inward = false): Mesh {
  const s = size;
  const h = height;
  const [x, y, z] = at;
  const vertices: Vec3[] = [
    [x, y, z],
    [x + s, y, z],
    [x + s, y + s, z],
    [x, y + s, z],
    [x, y, z + h],
    [x + s, y, z + h],
    [x + s, y + s, z + h],
    [x, y + s, z + h],
  ];
  const triangles: Vec3[] = [
    [0, 2, 1],
    [0, 3, 2],
    [4, 5, 6],
    [4, 6, 7],
    [0, 1, 5],
    [0, 5, 4],
    [3, 7, 6],
    [3, 6, 2],
    [0, 4, 7],
    [0, 7, 3],
    [1, 2, 6],
    [1, 6, 5],
  ];
  return { vertices, triangles: inward ? triangles.map(([a, b, c]) => [a, c, b]) : triangles };
}

/** A unit square at height `z`: an open body of two triangles. */
function sheetMesh(z: number): Mesh {
  return {
    vertices: [
      [0, 0, z],
      [1, 0, z],
      [1, 1, z],
      [0, 1, z],
    ],
    triangles: [
      [0, 1, 2],
      [0, 2, 3],
    ],
  };
}

/** One mesh object holding every mesh of `meshes`, their vertex lists concatenated. */
function meshObject(id: number, meshes: Mesh[]): string {
  const vertices: Vec3[] = [];
  const triangles: Vec3[] = [];
  for (const mesh of meshes) {
    const offset = vertices.length;
    vertices.push(...mesh.vertices);
    triangles.push(
      ...mesh.triangles.map(([a, b, c]): Vec3 => [a + offset, b + offset, c + offset])
    );
  }
  return (
    `<object id="${id}" type="model"><mesh><vertices>` +
    vertices.map(([x, y, z]) => `<vertex x="${x}" y="${y}" z="${z}" />`).join('') +
    '</vertices><triangles>' +
    triangles.map(([a, b, c]) => `<triangle v1="${a}" v2="${b}" v3="${c}" />`).join('') +
    '</triangles></mesh></object>'
  );
}

/** Objects `firstId`..`firstId + levels - 1`, each placing the object just below it twice. */
function doublingChain(firstId: number, levels: number): string[] {
  return Array.from({ length: levels }, (_, i) => {
    const id = firstId + i;
    return (
      `<object id="${id}" type="model"><components>` +
      `<component objectid="${id - 1}" />` +
      `<component objectid="${id - 1}" transform="1 0 0 0 1 0 0 0 1 0 0 1" />` +
      '</components></object>'
    );
  });
}

function model(objects: string[], items: string[], unit = 'millimeter'): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<model unit="${unit}" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">` +
    `<resources>${objects.join('')}</resources>` +
    `<build>${items.join('')}</build></model>`
  );
}

describe('importThreeMF', () => {
  it('round-trips a box through 3MF export/import', async () => {
    const b = box(10, 10, 10);
    const m = mesh(b);
    const threemf = exportThreeMF(m);
    const blob = new Blob([threemf]);
    const result = await importThreeMF(blob);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    if (!isShape3D(result.value)) throw new Error('expected a 3D shape');
    const vol = unwrap(measureVolume(result.value));
    expect(vol).toBeCloseTo(1000, -1);
  });

  it('fails on invalid data', async () => {
    const blob = new Blob([new ArrayBuffer(10)]);
    const result = await importThreeMF(blob);
    expect(result.ok).toBe(false);
  });

  it('imports each object of a multi-object model as its own solid', async () => {
    const xml = model(
      [cubeObject(1, 10), cubeObject(2, 10)],
      ['<item objectid="1" />', '<item objectid="2" transform="1 0 0 0 1 0 0 0 1 20 0 0" />']
    );
    using imported = unwrap(await importThreeMF(modelZip(xml)));
    expect(isCompound(imported)).toBe(true);
    expect(getSolids(imported)).toHaveLength(2);
    expect(unwrap(measureVolume(imported as Shape3D))).toBeCloseTo(2000, 3);
    const bounds = getBounds(imported);
    expect(bounds.xMin).toBeCloseTo(0, 6);
    expect(bounds.xMax).toBeCloseTo(30, 6);
    expect(bounds.zMax).toBeCloseTo(10, 6);
  });

  it('imports an object holding several closed bodies as a solid per body', async (ctx) => {
    skipIfDiverges(ctx, 'threemfImport.bodiesWithinObject');
    const xml = model(
      [meshObject(1, [boxMesh(10), boxMesh(10, 10, [20, 0, 0])])],
      ['<item objectid="1" />']
    );
    using imported = unwrap(await importThreeMF(modelZip(xml)));
    expect(isCompound(imported)).toBe(true);
    expect(getSolids(imported)).toHaveLength(2);
    expect(unwrap(measureVolume(imported as Shape3D))).toBeCloseTo(2000, 3);
  });

  it('keeps a sealed cavity inside an object hollow', async (ctx) => {
    skipIfDiverges(ctx, 'threemfImport.bodiesWithinObject');
    const xml = model(
      [meshObject(1, [boxMesh(20), boxMesh(10, 10, [5, 5, 5], true)])],
      ['<item objectid="1" />']
    );
    using imported = unwrap(await importThreeMF(modelZip(xml)));
    const solids = getSolids(imported);
    expect(solids).toHaveLength(1);
    expect(unwrap(measureVolume(solids[0] as Shape3D))).toBeCloseTo(7000, 3);
    expect(getShells(imported)).toHaveLength(2);
  });

  it('keeps an open body beside a closed one in the same object as a shell', async (ctx) => {
    skipIfDiverges(ctx, 'threemfImport.bodiesWithinObject');
    const xml = model([meshObject(1, [boxMesh(10), sheetMesh(50)])], ['<item objectid="1" />']);
    using imported = unwrap(await importThreeMF(modelZip(xml)));
    const solids = getSolids(imported);
    expect(solids).toHaveLength(1);
    expect(unwrap(measureVolume(solids[0] as Shape3D))).toBeCloseTo(1000, 3);
    expect(getShells(imported)).toHaveLength(2);
    expect(getFaces(imported)).toHaveLength(14);
  });

  it('repairs the winding of bodies that share an object', async (ctx) => {
    skipIfDiverges(ctx, 'threemfImport.bodiesWithinObject');
    const flipped = boxMesh(10, 10, [20, 0, 0]);
    const [a, b, c] = flipped.triangles[0] ?? [0, 0, 0];
    flipped.triangles[0] = [a, c, b];
    const xml = model([meshObject(1, [boxMesh(10), flipped])], ['<item objectid="1" />']);
    using imported = unwrap(await importThreeMF(modelZip(xml)));
    expect(getSolids(imported)).toHaveLength(2);
    expect(unwrap(measureVolume(imported as Shape3D))).toBeCloseTo(2000, 3);
  });

  it.skipIf(currentKernel !== 'occt-wasm')(
    'sews a clean closed object without the orientation repair',
    async () => {
      const kernel = getKernel();
      const repairs = vi.spyOn(kernel, 'sewAndSolidify');
      const indexed = vi.spyOn(kernel, 'buildSolidFromFaces');
      try {
        const xml = model([cubeObject(1, 10)], ['<item objectid="1" />']);
        using imported = unwrap(await importThreeMF(modelZip(xml)));
        expect(isSolid(imported)).toBe(true);
        expect(isValid(imported)).toBe(true);
        expect(unwrap(measureVolume(imported as Shape3D))).toBeCloseTo(1000, 6);
        expect(repairs).not.toHaveBeenCalled();
        expect(indexed).not.toHaveBeenCalled();
      } finally {
        repairs.mockRestore();
        indexed.mockRestore();
      }
    }
  );

  it('applies the build item transform', async () => {
    // Rotate 90 degrees about Z (row-vector convention: x' = -y, y' = x), then translate.
    const xml = model(
      [cubeObject(1, 10, 2)],
      ['<item objectid="1" transform="0 1 0 -1 0 0 0 0 1 5 6 7" />']
    );
    using imported = unwrap(await importThreeMF(modelZip(xml)));
    expect(isSolid(imported)).toBe(true);
    expect(unwrap(measureVolume(imported as Shape3D))).toBeCloseTo(200, 3);
    const bounds = getBounds(imported);
    expect(bounds.xMin).toBeCloseTo(-5, 6);
    expect(bounds.xMax).toBeCloseTo(5, 6);
    expect(bounds.yMin).toBeCloseTo(6, 6);
    expect(bounds.yMax).toBeCloseTo(16, 6);
    expect(bounds.zMin).toBeCloseTo(7, 6);
    expect(bounds.zMax).toBeCloseTo(9, 6);
  });

  it('scales model units to millimeters', async () => {
    const xml = model([cubeObject(1, 1)], ['<item objectid="1" />'], 'inch');
    using imported = unwrap(await importThreeMF(modelZip(xml)));
    expect(unwrap(measureVolume(imported as Shape3D))).toBeCloseTo(25.4 ** 3, 3);
    expect(getBounds(imported).xMax).toBeCloseTo(25.4, 6);
  });

  it('instantiates component objects with their transforms', async () => {
    const assembly =
      '<object id="3" type="model"><components>' +
      '<component objectid="1" />' +
      '<component objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 15" />' +
      '</components></object>';
    const xml = model(
      [cubeObject(1, 10), assembly],
      ['<item objectid="3" transform="1 0 0 0 1 0 0 0 1 100 0 0" />']
    );
    using imported = unwrap(await importThreeMF(modelZip(xml)));
    expect(getSolids(imported)).toHaveLength(2);
    expect(unwrap(measureVolume(imported as Shape3D))).toBeCloseTo(2000, 3);
    const bounds = getBounds(imported);
    expect(bounds.xMin).toBeCloseTo(100, 6);
    expect(bounds.zMax).toBeCloseTo(25, 6);
  });

  it('skips a component that refers back to its own object', async () => {
    const cyclic =
      '<object id="2" type="model"><components>' +
      '<component objectid="1" /><component objectid="2" /><component objectid="2" />' +
      '</components></object>';
    const xml = model([cubeObject(1, 10), cyclic], ['<item objectid="2" />']);
    using imported = unwrap(await importThreeMF(modelZip(xml)));
    expect(isSolid(imported)).toBe(true);
    expect(unwrap(measureVolume(imported as Shape3D))).toBeCloseTo(1000, 3);
  });

  it('refuses a component chain that doubles past the placement limit', async () => {
    // 30 levels, each placing the level below twice: 2^30 cubes from a few KB of XML.
    const xml = model([cubeObject(1, 10), ...doublingChain(2, 30)], ['<item objectid="31" />']);
    const result = await importThreeMF(modelZip(xml));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('THREEMF_IMPORT_FAILED');
    expect(result.error.message).toContain('more than 100,000 objects');
  });

  it('refuses components nested deeper than the limit', async () => {
    // A 100-level chain, each object placing the one below once.
    const chain = Array.from(
      { length: 100 },
      (_, i) =>
        `<object id="${i + 2}" type="model"><components>` +
        `<component objectid="${i + 1}" /></components></object>`
    );
    const xml = model([cubeObject(1, 10), ...chain], ['<item objectid="101" />']);
    const result = await importThreeMF(modelZip(xml));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('THREEMF_IMPORT_FAILED');
    expect(result.error.message).toContain('nest more than 64 levels');
  });

  it('places a cube through a component chain within the depth limit', async () => {
    const chain = Array.from(
      { length: 10 },
      (_, i) =>
        `<object id="${i + 2}" type="model"><components>` +
        `<component objectid="${i + 1}" transform="1 0 0 0 1 0 0 0 1 1 0 0" /></components></object>`
    );
    const xml = model([cubeObject(1, 10), ...chain], ['<item objectid="11" />']);
    using shape = unwrap(await importThreeMF(modelZip(xml)));
    expect(unwrap(measureVolume(shape as Shape3D))).toBeCloseTo(1000, 3);
    expect(getBounds(shape).xMin).toBeCloseTo(10, 6);
  });

  it('refuses a build that places more triangles than the limit', async () => {
    // A 1,000-triangle strip placed 4,096 times through a 12-level doubling chain.
    const strip =
      '<object id="1" type="model"><mesh><vertices>' +
      Array.from({ length: 1002 }, (_, i) => `<vertex x="${i}" y="${i % 2}" z="0" />`).join('') +
      '</vertices><triangles>' +
      Array.from(
        { length: 1000 },
        (_, i) => `<triangle v1="${i}" v2="${i + 1}" v3="${i + 2}" />`
      ).join('') +
      '</triangles></mesh></object>';
    const xml = model([strip, ...doublingChain(2, 12)], ['<item objectid="13" />']);
    const result = await importThreeMF(modelZip(xml));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('THREEMF_IMPORT_FAILED');
    expect(result.error.message).toContain('more than 2,000,000 triangles');
  });

  it('refuses a build that places more vertices than the limit', async () => {
    // One triangle over 1,000 vertices placed 8,192 times: few triangles, 8.2M vertex copies.
    const sparse =
      '<object id="1" type="model"><mesh><vertices>' +
      Array.from({ length: 1000 }, (_, i) => `<vertex x="${i}" y="${i % 2}" z="0" />`).join('') +
      '</vertices><triangles><triangle v1="0" v2="1" v3="2" /></triangles></mesh></object>';
    const xml = model([sparse, ...doublingChain(2, 13)], ['<item objectid="14" />']);
    const result = await importThreeMF(modelZip(xml));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('THREEMF_IMPORT_FAILED');
    expect(result.error.message).toContain('more than 6,000,000 vertices');
  });

  it('fails on empty geometry', async () => {
    const blob = modelZip('<?xml version="1.0"?><model><resources></resources></model>');
    const result = await importThreeMF(blob);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('no valid geometry');
    }
  });
});

describe('exportThreeMF with colors', () => {
  it('includes colorgroup XML when colors option is provided', () => {
    const b = box(10, 10, 10);
    const m = mesh(b);
    const firstGroup = m.faceGroups[0];
    expect(firstGroup).toBeDefined();
    if (!firstGroup) return;

    const colors = new Map<number, [number, number, number, number]>();
    colors.set(firstGroup.faceId, [1, 0, 0, 1]);

    const buf = exportThreeMF(m, { colors });
    const xml = extractModelXmlFromStoreZip(buf);
    expect(xml).toContain('colorgroup');
    expect(xml).toContain('#FF0000FF');
    expect(xml).toContain('pid=');
  });

  it('includes basematerials XML when materials option is provided', () => {
    const b = box(10, 10, 10);
    const m = mesh(b);
    const firstGroup = m.faceGroups[0];
    expect(firstGroup).toBeDefined();
    if (!firstGroup) return;

    const materials = new Map<number, ThreeMFMaterial>();
    materials.set(firstGroup.faceId, { name: 'PLA-Red', displayColor: [1, 0, 0, 1] });

    const buf = exportThreeMF(m, { materials });
    const xml = extractModelXmlFromStoreZip(buf);
    expect(xml).toContain('basematerials');
    expect(xml).toContain('PLA-Red');
    expect(xml).toContain('pid=');
  });

  it('round-trips per-face colors through 3MF export/import', async () => {
    const b = box(10, 10, 10);
    const m = mesh(b);

    const colors = new Map<number, [number, number, number, number]>();
    const firstGroup = m.faceGroups[0];
    expect(firstGroup).toBeDefined();
    if (!firstGroup) return;
    colors.set(firstGroup.faceId, [1, 0, 0, 1]);

    const secondGroup = m.faceGroups[1];
    if (secondGroup) {
      colors.set(secondGroup.faceId, [0, 0, 1, 1]);
    }

    const buf = exportThreeMF(m, { colors });
    const blob = new Blob([buf]);
    const result = await importThreeMF(blob);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const shapeColor = getShapeColor(result.value);
    expect(shapeColor).toBeDefined();
  });

  it('round-trips named materials through 3MF export/import', async () => {
    const b = box(10, 10, 10);
    const m = mesh(b);
    const firstGroup = m.faceGroups[0];
    expect(firstGroup).toBeDefined();
    if (!firstGroup) return;

    const materials = new Map<number, ThreeMFMaterial>();
    materials.set(firstGroup.faceId, {
      name: 'PLA-Red',
      displayColor: [1, 0, 0, 1],
    });

    const buf = exportThreeMF(m, { materials });
    const blob = new Blob([buf]);
    const result = await importThreeMF(blob);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    if (!isShape3D(result.value)) throw new Error('expected a 3D shape');
    const vol = unwrap(measureVolume(result.value));
    expect(vol).toBeCloseTo(1000, -1);
  });
});
