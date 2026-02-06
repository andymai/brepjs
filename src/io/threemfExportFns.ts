/**
 * 3MF export — converts a ShapeMesh into a 3MF archive (ZIP container).
 *
 * Uses store-only ZIP (no compression) with CRC-32 for packaging.
 * No external dependencies required.
 */

import type { ShapeMesh } from '../topology/meshFns.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ThreeMFExportOptions {
  /** Model name. Default: "model". */
  name?: string;
  /** Unit of measurement. Default: "millimeter". */
  unit?: 'micron' | 'millimeter' | 'centimeter' | 'meter' | 'inch' | 'foot';
}

// ---------------------------------------------------------------------------
// CRC-32 lookup table
// ---------------------------------------------------------------------------

const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[i] = c;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- typed array access
    crc = (crcTable[(crc ^ byte) & 0xff] as any) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------
// ZIP store-only builder
// ---------------------------------------------------------------------------

interface ZipEntry {
  name: Uint8Array;
  data: Uint8Array;
  crc: number;
}

function buildZip(entries: ZipEntry[]): ArrayBuffer {
  // Calculate sizes
  let offset = 0;
  const localHeaders: { offset: number; entry: ZipEntry }[] = [];

  for (const entry of entries) {
    localHeaders.push({ offset, entry });
    offset += 30 + entry.name.length + entry.data.length;
  }

  const centralStart = offset;
  let centralSize = 0;
  for (const entry of entries) {
    centralSize += 46 + entry.name.length;
  }

  const totalSize = offset + centralSize + 22;
  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  let pos = 0;

  // Local file headers + data
  for (const { entry } of localHeaders) {
    view.setUint32(pos, 0x04034b50, true);
    pos += 4; // signature
    view.setUint16(pos, 20, true);
    pos += 2; // version needed
    view.setUint16(pos, 0, true);
    pos += 2; // flags
    view.setUint16(pos, 0, true);
    pos += 2; // compression (store)
    view.setUint16(pos, 0, true);
    pos += 2; // mod time
    view.setUint16(pos, 0, true);
    pos += 2; // mod date
    view.setUint32(pos, entry.crc, true);
    pos += 4; // crc32
    view.setUint32(pos, entry.data.length, true);
    pos += 4; // compressed size
    view.setUint32(pos, entry.data.length, true);
    pos += 4; // uncompressed size
    view.setUint16(pos, entry.name.length, true);
    pos += 2; // name length
    view.setUint16(pos, 0, true);
    pos += 2; // extra length
    bytes.set(entry.name, pos);
    pos += entry.name.length;
    bytes.set(entry.data, pos);
    pos += entry.data.length;
  }

  // Central directory
  for (const { offset: localOff, entry } of localHeaders) {
    view.setUint32(pos, 0x02014b50, true);
    pos += 4; // signature
    view.setUint16(pos, 20, true);
    pos += 2; // version made by
    view.setUint16(pos, 20, true);
    pos += 2; // version needed
    view.setUint16(pos, 0, true);
    pos += 2; // flags
    view.setUint16(pos, 0, true);
    pos += 2; // compression
    view.setUint16(pos, 0, true);
    pos += 2; // mod time
    view.setUint16(pos, 0, true);
    pos += 2; // mod date
    view.setUint32(pos, entry.crc, true);
    pos += 4; // crc32
    view.setUint32(pos, entry.data.length, true);
    pos += 4; // compressed
    view.setUint32(pos, entry.data.length, true);
    pos += 4; // uncompressed
    view.setUint16(pos, entry.name.length, true);
    pos += 2; // name length
    view.setUint16(pos, 0, true);
    pos += 2; // extra length
    view.setUint16(pos, 0, true);
    pos += 2; // comment length
    view.setUint16(pos, 0, true);
    pos += 2; // disk start
    view.setUint16(pos, 0, true);
    pos += 2; // internal attrs
    view.setUint32(pos, 0, true);
    pos += 4; // external attrs
    view.setUint32(pos, localOff, true);
    pos += 4; // local header offset
    bytes.set(entry.name, pos);
    pos += entry.name.length;
  }

  // End of central directory
  view.setUint32(pos, 0x06054b50, true);
  pos += 4;
  view.setUint16(pos, 0, true);
  pos += 2; // disk number
  view.setUint16(pos, 0, true);
  pos += 2; // central dir disk
  view.setUint16(pos, entries.length, true);
  pos += 2; // entries on disk
  view.setUint16(pos, entries.length, true);
  pos += 2; // total entries
  view.setUint32(pos, centralSize, true);
  pos += 4; // central dir size
  view.setUint32(pos, centralStart, true);
  pos += 4; // central dir offset
  view.setUint16(pos, 0, true); // comment length

  return buf;
}

// ---------------------------------------------------------------------------
// 3MF XML construction
// ---------------------------------------------------------------------------

function build3MFModel(mesh: ShapeMesh, name: string, unit: string): string {
  const vertices: string[] = [];
  for (let i = 0; i < mesh.vertices.length; i += 3) {
    vertices.push(
      `        <vertex x="${mesh.vertices[i]}" y="${mesh.vertices[i + 1]}" z="${mesh.vertices[i + 2]}" />`
    );
  }

  const triangles: string[] = [];
  for (let i = 0; i < mesh.triangles.length; i += 3) {
    triangles.push(
      `        <triangle v1="${mesh.triangles[i]}" v2="${mesh.triangles[i + 1]}" v3="${mesh.triangles[i + 2]}" />`
    );
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="${unit}" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" name="${name}" type="model">
      <mesh>
      <vertices>
${vertices.join('\n')}
      </vertices>
      <triangles>
${triangles.join('\n')}
      </triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="1" />
  </build>
</model>`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Export a ShapeMesh to 3MF format (ArrayBuffer).
 *
 * 3MF is the standard format for modern 3D printing slicers (PrusaSlicer, Cura, etc.).
 */
export function exportThreeMF(mesh: ShapeMesh, options: ThreeMFExportOptions = {}): ArrayBuffer {
  const { name = 'model', unit = 'millimeter' } = options;
  const encoder = new TextEncoder();

  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" />
</Relationships>`;

  const model = build3MFModel(mesh, name, unit);

  function entry(path: string, content: string): ZipEntry {
    const nameBytes = encoder.encode(path);
    const dataBytes = encoder.encode(content);
    return { name: nameBytes, data: dataBytes, crc: crc32(dataBytes) };
  }

  return buildZip([
    entry('[Content_Types].xml', contentTypes),
    entry('_rels/.rels', rels),
    entry('3D/3dmodel.model', model),
  ]);
}
