/**
 * 3MF import — parses a 3MF ZIP archive and builds a solid via sewing.
 */

import { getKernel } from '@/kernel/index.js';
import type { UnknownDimShape } from '@/core/shapeTypes.js';
import { castShape } from '@/core/shapeTypes.js';
import { type Result, ok, err } from '@/core/result.js';
import { ioError, BrepErrorCode } from '@/core/errors.js';
import { sewMeshToSolid } from './ioUtils.js';
import { colorShape } from '@/topology/metadata/colorFns.js';

// ---------------------------------------------------------------------------
// ZIP extraction (store-only, no compression)
// ---------------------------------------------------------------------------

function extractFromZip(data: Uint8Array, target: string): Uint8Array | null {
  // Find end-of-central-directory record (search backwards)
  let eocdOffset = -1;
  for (let i = data.length - 22; i >= 0; i--) {
    if (data[i] === 0x50 && data[i + 1] === 0x4b && data[i + 2] === 0x05 && data[i + 3] === 0x06) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) return null;

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const cdOffset = view.getUint32(eocdOffset + 16, true);
  const cdSize = view.getUint32(eocdOffset + 12, true);
  const cdEnd = cdOffset + cdSize;

  // Walk central directory entries
  let pos = cdOffset;
  const decoder = new TextDecoder();
  while (pos < cdEnd) {
    const sig = view.getUint32(pos, true);
    if (sig !== 0x02014b50) break;

    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const localOffset = view.getUint32(pos + 42, true);
    const name = decoder.decode(data.subarray(pos + 46, pos + 46 + nameLen));

    if (name === target) {
      // Read from local file header
      const compressionMethod = view.getUint16(localOffset + 8, true);
      if (compressionMethod !== 0) {
        return null; // Compressed entry — only store (method 0) is supported
      }
      const localNameLen = view.getUint16(localOffset + 26, true);
      const localExtraLen = view.getUint16(localOffset + 28, true);
      const compressedSize = view.getUint32(localOffset + 18, true);
      const dataStart = localOffset + 30 + localNameLen + localExtraLen;
      return data.subarray(dataStart, dataStart + compressedSize);
    }

    pos += 46 + nameLen + extraLen + commentLen;
  }

  return null;
}

// ---------------------------------------------------------------------------
// XML parsing (indexOf-based, no regex — CodeQL safe)
// ---------------------------------------------------------------------------

interface ParsedMesh {
  vertices: Array<[number, number, number]>;
  triangles: Array<[number, number, number]>;
  /** Per-triangle color from colorgroup/basematerials. Index matches triangles array. */
  triangleColors: Array<[number, number, number, number] | null>;
}

/** Check if a char code is a valid XML attribute name character [a-zA-Z0-9_]. */
function isAttrChar(code: number): boolean {
  return (
    (code >= 97 && code <= 122) || // a-z
    (code >= 65 && code <= 90) || // A-Z
    (code >= 48 && code <= 57) || // 0-9
    code === 95 // _
  );
}

/** Extract name="value" attributes from an XML tag string using indexOf (no regex). */
function parseTagAttrs(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let pos = 0;
  while (pos < tag.length) {
    const eq = tag.indexOf('="', pos);
    if (eq < 0) break;

    // Walk backward to find attribute name start
    let nameStart = eq;
    while (nameStart > 0 && isAttrChar(tag.charCodeAt(nameStart - 1))) nameStart--;
    if (nameStart === eq) {
      pos = eq + 2;
      continue;
    }
    const name = tag.slice(nameStart, eq);

    const valStart = eq + 2;
    const closeQuote = tag.indexOf('"', valStart);
    if (closeQuote < 0) break;
    attrs[name] = tag.slice(valStart, closeQuote);
    pos = closeQuote + 1;
  }
  return attrs;
}

/** Collect all tags matching `<tagName ...>` using indexOf (O(n), no regex). */
function findTags(xml: string, tagName: string): string[] {
  const tags: string[] = [];
  const needle = `<${tagName} `;
  let pos = 0;
  while (pos < xml.length) {
    const start = xml.indexOf(needle, pos);
    if (start < 0) break;
    const end = xml.indexOf('>', start);
    if (end < 0) break;
    tags.push(xml.slice(start, end + 1));
    pos = end + 1;
  }
  return tags;
}

/**
 * Extract a block `<tagName ...>...</tagName>` from xml.
 * Returns the full block string including open/close tags, or null if not found.
 */
function findTagBlock(xml: string, tagName: string): string | null {
  const open = xml.indexOf(`<${tagName}`);
  if (open < 0) return null;
  const close = xml.indexOf(`</${tagName}>`, open);
  if (close < 0) return null;
  return xml.slice(open, close + tagName.length + 3);
}

/** Parse a hex color string like #RRGGBB or #RRGGBBAA into [r,g,b,a] floats. */
function parseHexColor(hex: string): [number, number, number, number] {
  const h = hex.startsWith('#') ? hex.slice(1) : hex;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return [r, g, b, a];
}

/**
 * Build a combined resource map from colorgroup and basematerials blocks.
 * Returns: Map<resourceId, Array<[r,g,b,a]>>
 */
function parseResourceColors(xml: string): Map<number, Array<[number, number, number, number]>> {
  const resources = new Map<number, Array<[number, number, number, number]>>();

  // Parse <colorgroup> blocks
  let searchPos = 0;
  while (searchPos < xml.length) {
    const cgStart = xml.indexOf('<colorgroup', searchPos);
    if (cgStart < 0) break;
    const cgClose = xml.indexOf('</colorgroup>', cgStart);
    if (cgClose < 0) break;
    const cgBlock = xml.slice(cgStart, cgClose + '</colorgroup>'.length);
    searchPos = cgClose + '</colorgroup>'.length;

    const cgTagEnd = xml.indexOf('>', cgStart);
    if (cgTagEnd < 0) continue;
    const cgTag = xml.slice(cgStart, cgTagEnd + 1);
    const cgAttrs = parseTagAttrs(cgTag);
    const idStr = cgAttrs['id'];
    if (idStr === undefined) continue;
    const resourceId = parseInt(idStr, 10);

    const colorArr: Array<[number, number, number, number]> = [];
    for (const colorTag of findTags(cgBlock, 'color')) {
      const ca = parseTagAttrs(colorTag);
      const colorVal = ca['color'];
      if (colorVal !== undefined) {
        colorArr.push(parseHexColor(colorVal));
      }
    }
    resources.set(resourceId, colorArr);
  }

  // Parse <basematerials> blocks
  let bmSearchPos = 0;
  while (bmSearchPos < xml.length) {
    const bmStart = xml.indexOf('<basematerials', bmSearchPos);
    if (bmStart < 0) break;
    const bmClose = xml.indexOf('</basematerials>', bmStart);
    if (bmClose < 0) break;
    const bmBlock = xml.slice(bmStart, bmClose + '</basematerials>'.length);
    bmSearchPos = bmClose + '</basematerials>'.length;

    const bmTagEnd = xml.indexOf('>', bmStart);
    if (bmTagEnd < 0) continue;
    const bmTag = xml.slice(bmStart, bmTagEnd + 1);
    const bmAttrs = parseTagAttrs(bmTag);
    const idStr = bmAttrs['id'];
    if (idStr === undefined) continue;
    const resourceId = parseInt(idStr, 10);

    const colorArr: Array<[number, number, number, number]> = [];
    for (const baseTag of findTags(bmBlock, 'base')) {
      const ba = parseTagAttrs(baseTag);
      const displayColor = ba['displaycolor'];
      if (displayColor !== undefined) {
        colorArr.push(parseHexColor(displayColor));
      } else {
        // Placeholder for bases without color — still takes an index slot
        colorArr.push([0, 0, 0, 1]);
      }
    }
    resources.set(resourceId, colorArr);
  }

  return resources;
}

function parseModelXml(xml: string): ParsedMesh {
  const vertices: Array<[number, number, number]> = [];
  const triangles: Array<[number, number, number]> = [];
  const triangleColors: Array<[number, number, number, number] | null> = [];

  // Build resource color map (colorgroup + basematerials)
  const resourceColors = parseResourceColors(xml);

  // Attribute-order-independent vertex extraction (no regex — CodeQL safe)
  for (const tag of findTags(xml, 'vertex')) {
    const a = parseTagAttrs(tag);
    if (a['x'] !== undefined && a['y'] !== undefined && a['z'] !== undefined) {
      vertices.push([parseFloat(a['x']), parseFloat(a['y']), parseFloat(a['z'])]);
    }
  }

  // Parse object-level default pid/pindex
  let objectDefaultPid: number | null = null;
  let objectDefaultPindex: number | null = null;
  const objectBlock = findTagBlock(xml, 'object');
  if (objectBlock !== null) {
    const objTagEnd = objectBlock.indexOf('>');
    if (objTagEnd >= 0) {
      const objTag = objectBlock.slice(0, objTagEnd + 1);
      const objAttrs = parseTagAttrs(objTag);
      if (objAttrs['pid'] !== undefined) {
        objectDefaultPid = parseInt(objAttrs['pid'], 10);
      }
      if (objAttrs['pindex'] !== undefined) {
        objectDefaultPindex = parseInt(objAttrs['pindex'], 10);
      }
    }
  }

  // Attribute-order-independent triangle extraction
  for (const tag of findTags(xml, 'triangle')) {
    const a = parseTagAttrs(tag);
    if (a['v1'] !== undefined && a['v2'] !== undefined && a['v3'] !== undefined) {
      triangles.push([parseInt(a['v1'], 10), parseInt(a['v2'], 10), parseInt(a['v3'], 10)]);

      // Resolve per-triangle color via pid/p1, falling back to object defaults
      let color: [number, number, number, number] | null = null;
      const pidStr = a['pid'] ?? (objectDefaultPid !== null ? String(objectDefaultPid) : undefined);
      const p1Str =
        a['p1'] ?? (objectDefaultPindex !== null ? String(objectDefaultPindex) : undefined);

      if (pidStr !== undefined && p1Str !== undefined) {
        const pid = parseInt(pidStr, 10);
        const p1 = parseInt(p1Str, 10);
        const palette = resourceColors.get(pid);
        if (palette !== undefined && p1 < palette.length) {
          color = palette[p1] ?? null;
        }
      }
      triangleColors.push(color);
    }
  }

  return { vertices, triangles, triangleColors };
}

/** Find the most common non-null color across all triangle colors. */
function findDominantColor(
  triangleColors: Array<[number, number, number, number] | null>
): [number, number, number, number] | null {
  const counts = new Map<string, { count: number; color: [number, number, number, number] }>();
  for (const c of triangleColors) {
    if (c === null) continue;
    const key = c.join(',');
    const entry = counts.get(key);
    if (entry !== undefined) {
      entry.count++;
    } else {
      counts.set(key, { count: 1, color: c });
    }
  }
  let best: { count: number; color: [number, number, number, number] } | null = null;
  for (const entry of counts.values()) {
    if (best === null || entry.count > best.count) {
      best = entry;
    }
  }
  return best !== null ? best.color : null;
}

// ---------------------------------------------------------------------------
// Sewing
// ---------------------------------------------------------------------------

function buildSolidFromMesh(mesh: ParsedMesh): Result<UnknownDimShape> {
  const kernel = getKernel();

  // Use buildSolidFromFaces (indexed mesh) for native import when available.
  // This avoids building individual face objects and sewing them, which can
  // introduce volume errors in some backends.
  const points = mesh.vertices.map(([x, y, z]) => ({ x, y, z }));
  const faces = mesh.triangles as Array<readonly [number, number, number]>;

  try {
    const solid = kernel.buildSolidFromFaces(points, faces, 1e-6);
    return ok(castShape(solid));
  } catch {
    // Fallback: resolve indexed triangles to vertex triples and sew
    const triangles: Array<
      [[number, number, number], [number, number, number], [number, number, number]]
    > = [];

    for (const [v1, v2, v3] of mesh.triangles) {
      const va = mesh.vertices[v1];
      const vb = mesh.vertices[v2];
      const vc = mesh.vertices[v3];
      if (!va || !vb || !vc) continue;

      triangles.push([va, vb, vc]);
    }

    return sewMeshToSolid(triangles, BrepErrorCode.THREEMF_IMPORT_FAILED);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Import a 3MF file from a Blob.
 *
 * Extracts the model XML from the ZIP archive, parses vertices and triangles,
 * and builds a solid by sewing the resulting triangular faces.
 *
 * @param blob - A Blob or File containing 3MF data (.3mf).
 * @returns A `Result` wrapping the imported solid, or an error if parsing fails.
 *
 * @example
 * ```ts
 * const file = new File([data], 'model.3mf');
 * const shape = unwrap(await importThreeMF(file));
 * ```
 */
export async function importThreeMF(blob: Blob): Promise<Result<UnknownDimShape>> {
  try {
    const arrayBuf = await blob.arrayBuffer();
    const data = new Uint8Array(arrayBuf);

    const modelData = extractFromZip(data, '3D/3dmodel.model');
    if (!modelData) {
      return err(
        ioError(
          BrepErrorCode.THREEMF_IMPORT_FAILED,
          '3MF archive does not contain 3D/3dmodel.model (or uses unsupported compression)'
        )
      );
    }

    const xml = new TextDecoder().decode(modelData);
    const parsed = parseModelXml(xml);

    if (parsed.vertices.length === 0 || parsed.triangles.length === 0) {
      return err(
        ioError(BrepErrorCode.THREEMF_IMPORT_FAILED, '3MF model contains no valid geometry')
      );
    }

    const solid = buildSolidFromMesh(parsed);
    if (solid.ok) {
      // Apply dominant color if any triangle colors were parsed
      const dominantColor = findDominantColor(parsed.triangleColors);
      if (dominantColor !== null) {
        colorShape(solid.value, dominantColor);
      }
    }
    return solid;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(ioError(BrepErrorCode.THREEMF_IMPORT_FAILED, `3MF import failed: ${msg}`, e));
  }
}
