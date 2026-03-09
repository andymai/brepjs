/**
 * 3MF import — parses a 3MF ZIP archive and builds a solid via sewing.
 */

import { getKernel } from '../kernel/index.js';
import type { KernelShape } from '../kernel/types.js';
import type { UnknownDimShape } from '../core/shapeTypes.js';
import { castShape } from '../core/shapeTypes.js';
import { type Result, ok, err } from '../core/result.js';
import { ioError, BrepErrorCode } from '../core/errors.js';

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

function parseModelXml(xml: string): ParsedMesh {
  const vertices: Array<[number, number, number]> = [];
  const triangles: Array<[number, number, number]> = [];

  // Attribute-order-independent vertex extraction (no regex — CodeQL safe)
  for (const tag of findTags(xml, 'vertex')) {
    const a = parseTagAttrs(tag);
    if (a['x'] !== undefined && a['y'] !== undefined && a['z'] !== undefined) {
      vertices.push([parseFloat(a['x']), parseFloat(a['y']), parseFloat(a['z'])]);
    }
  }

  // Attribute-order-independent triangle extraction
  for (const tag of findTags(xml, 'triangle')) {
    const a = parseTagAttrs(tag);
    if (a['v1'] !== undefined && a['v2'] !== undefined && a['v3'] !== undefined) {
      triangles.push([parseInt(a['v1'], 10), parseInt(a['v2'], 10), parseInt(a['v3'], 10)]);
    }
  }

  return { vertices, triangles };
}

// ---------------------------------------------------------------------------
// Sewing (same pattern as OBJ import)
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
    // Fallback: build individual triangle faces and sew
    const triFaces: KernelShape[] = [];

    for (const [v1, v2, v3] of mesh.triangles) {
      const va = mesh.vertices[v1];
      const vb = mesh.vertices[v2];
      const vc = mesh.vertices[v3];
      if (!va || !vb || !vc) continue;

      const triFace = kernel.buildTriFace(va, vb, vc);
      if (triFace !== null) {
        triFaces.push(triFace);
      }
    }

    if (triFaces.length === 0) {
      return err(
        ioError(BrepErrorCode.THREEMF_IMPORT_FAILED, 'No valid triangular faces could be built')
      );
    }

    try {
      return ok(castShape(kernel.sewAndSolidify(triFaces, 1e-6)));
    } catch {
      try {
        return ok(castShape(kernel.sew(triFaces, 1e-6)));
      } catch {
        return err(ioError(BrepErrorCode.THREEMF_IMPORT_FAILED, 'Failed to sew triangular faces'));
      }
    }
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

    return buildSolidFromMesh(parsed);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(ioError(BrepErrorCode.THREEMF_IMPORT_FAILED, `3MF import failed: ${msg}`, e));
  }
}
