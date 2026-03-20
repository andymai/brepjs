/**
 * 3MF export — converts a ShapeMesh into a 3MF archive (ZIP container).
 *
 * Uses store-only ZIP (no compression) with CRC-32 for packaging.
 * No external dependencies required.
 */

import type { ShapeMesh } from '@/topology/meshFns.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Named material for 3MF basematerials resource. */
export interface ThreeMFMaterial {
  /** Display name (e.g. 'PLA-Red'). */
  name: string;
  /** Display color as RGBA 0-1. Falls back to white if omitted. */
  displayColor?: [number, number, number, number];
}

/** Options controlling 3MF archive export. */
export interface ThreeMFExportOptions {
  /** Name of the model object inside the 3MF archive. Default: `"model"`. */
  name?: string;
  /** Unit of measurement for vertex coordinates. Default: `"millimeter"`. */
  unit?: 'micron' | 'millimeter' | 'centimeter' | 'meter' | 'inch' | 'foot';
  /** Per-face colors keyed by faceId from ShapeMesh.faceGroups. RGBA 0-1 floats. */
  colors?: Map<number, [number, number, number, number]>;
  /** Per-face named materials keyed by faceId from ShapeMesh.faceGroups. */
  materials?: Map<number, ThreeMFMaterial>;
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

/** Escape XML special characters in attribute values. */
function escapeXmlAttr(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function colorToHex(rgba: [number, number, number, number]): string {
  const to8 = (v: number) =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
  return `#${to8(rgba[0])}${to8(rgba[1])}${to8(rgba[2])}${to8(rgba[3])}`;
}

interface TriangleAttrs {
  pid: number;
  p1: number;
}

function build3MFModel(
  mesh: ShapeMesh,
  name: string,
  unit: string,
  colors?: Map<number, [number, number, number, number]>,
  materials?: Map<number, ThreeMFMaterial>
): string {
  const vertices: string[] = [];
  for (let i = 0; i < mesh.vertices.length; i += 3) {
    const x = mesh.vertices[i] ?? 0;
    const y = mesh.vertices[i + 1] ?? 0;
    const z = mesh.vertices[i + 2] ?? 0;
    vertices.push(`        <vertex x="${x}" y="${y}" z="${z}" />`);
  }

  // Build deduped color palette (hex → index), resource id=2
  const colorIndexByHex = new Map<string, number>();
  const colorHexList: string[] = [];
  if (colors !== undefined && colors.size > 0) {
    for (const rgba of colors.values()) {
      const hex = colorToHex(rgba);
      if (!colorIndexByHex.has(hex)) {
        colorIndexByHex.set(hex, colorHexList.length);
        colorHexList.push(hex);
      }
    }
  }

  // Build deduped materials list (name → index), resource id=3
  // Use material name as dedup key since ThreeMFMaterial has no id.
  const materialIndexByName = new Map<string, number>();
  const materialList: ThreeMFMaterial[] = [];
  if (materials !== undefined && materials.size > 0) {
    for (const mat of materials.values()) {
      if (!materialIndexByName.has(mat.name)) {
        materialIndexByName.set(mat.name, materialList.length);
        materialList.push(mat);
      }
    }
  }

  // Build per-triangle pid/p1 lookup.
  // Materials take priority over colors when both are present.
  const triangleAttrs = new Map<number, TriangleAttrs>();
  for (const group of mesh.faceGroups) {
    const triStart = group.start / 3; // group.start is index offset into triangles array
    const triCount = group.count / 3;
    const faceId = group.faceId;

    let attrs: TriangleAttrs | undefined;

    // Materials take priority
    if (materials !== undefined) {
      const mat = materials.get(faceId);
      if (mat !== undefined) {
        const matIdx = materialIndexByName.get(mat.name);
        if (matIdx !== undefined) {
          attrs = { pid: 3, p1: matIdx };
        }
      }
    }

    // Fall back to colors
    if (attrs === undefined && colors !== undefined) {
      const rgba = colors.get(faceId);
      if (rgba !== undefined) {
        const hex = colorToHex(rgba);
        const colorIdx = colorIndexByHex.get(hex);
        if (colorIdx !== undefined) {
          attrs = { pid: 2, p1: colorIdx };
        }
      }
    }

    if (attrs !== undefined) {
      for (let t = triStart; t < triStart + triCount; t++) {
        triangleAttrs.set(t, attrs);
      }
    }
  }

  const triangles: string[] = [];
  for (let i = 0; i < mesh.triangles.length; i += 3) {
    const triIdx = i / 3;
    const v1 = mesh.triangles[i] ?? 0;
    const v2 = mesh.triangles[i + 1] ?? 0;
    const v3 = mesh.triangles[i + 2] ?? 0;
    const attrs = triangleAttrs.get(triIdx);
    if (attrs !== undefined) {
      triangles.push(
        `        <triangle v1="${v1}" v2="${v2}" v3="${v3}" pid="${attrs.pid}" p1="${attrs.p1}" />`
      );
    } else {
      triangles.push(`        <triangle v1="${v1}" v2="${v2}" v3="${v3}" />`);
    }
  }

  // Build resource blocks
  const resourceBlocks: string[] = [];

  if (colorHexList.length > 0) {
    const colorItems = colorHexList.map((hex) => `      <color color="${hex}" />`).join('\n');
    resourceBlocks.push(`    <colorgroup id="2">\n${colorItems}\n    </colorgroup>`);
  }

  if (materialList.length > 0) {
    const matItems = materialList
      .map((mat) => {
        const hexColor =
          mat.displayColor !== undefined ? colorToHex(mat.displayColor) : '#FFFFFFFF';
        return `      <base name="${escapeXmlAttr(mat.name)}" displaycolor="${hexColor}" />`;
      })
      .join('\n');
    resourceBlocks.push(`    <basematerials id="3">\n${matItems}\n    </basematerials>`);
  }

  const hasMaterials = materialList.length > 0;
  const materialsNs = hasMaterials
    ? '\n  xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02"'
    : '';

  const extraResources = resourceBlocks.length > 0 ? '\n' + resourceBlocks.join('\n') : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="${unit}" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"${materialsNs}>
  <resources>${extraResources}
    <object id="1" name="${escapeXmlAttr(name)}" type="model">
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
 * 3MF is the standard format for modern 3D printing slicers
 * (PrusaSlicer, Cura, etc.). The output is a store-only ZIP archive
 * containing the OPC content types, relationships, and 3D model XML.
 *
 * @param mesh - Triangulated mesh from `meshShape()`.
 * @param options - Model name and unit settings.
 * @returns An ArrayBuffer containing the 3MF ZIP archive.
 *
 * @remarks No external compression library is needed; the archive uses
 * store-only (uncompressed) ZIP entries with CRC-32 integrity checks.
 *
 * @example
 * ```ts
 * const mesh = meshShape(solid);
 * const buf = exportThreeMF(mesh, { unit: 'millimeter' });
 * const blob = new Blob([buf], { type: 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml' });
 * ```
 */
export function exportThreeMF(mesh: ShapeMesh, options: ThreeMFExportOptions = {}): ArrayBuffer {
  const { name = 'model', unit = 'millimeter', colors, materials } = options;
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

  const model = build3MFModel(mesh, name, unit, colors, materials);

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
