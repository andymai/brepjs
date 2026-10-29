/**
 * 3MF import: parses a 3MF ZIP archive and builds one solid per placed object via sewing.
 */

import { getKernel } from '@/kernel/index.js';
import type { UnknownDimShape } from '@/core/shapeTypes.js';
import { castResultShape } from '@/core/shapeTypes.js';
import { type Result, ok, err } from '@/core/result.js';
import { ioError, BrepErrorCode } from '@/core/errors.js';
import { sewMeshToSolid } from './ioUtils.js';
import { colorShape } from '@/topology/metadata/colorFns.js';
import { makeCompound } from '@/topology/solidBuilders.js';

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

type Vec3 = [number, number, number];
type Rgba = [number, number, number, number];
/** A 3MF `transform`: a 4x3 matrix in row-major order that multiplies row vectors. */
type Transform = readonly number[];

interface ParsedMesh {
  vertices: Vec3[];
  triangles: Array<[number, number, number]>;
  /** Per-triangle color from colorgroup/basematerials. Index matches triangles array. */
  triangleColors: Array<Rgba | null>;
}

interface ObjectRef {
  objectId: string;
  transform: Transform | null;
}

interface ModelObject {
  mesh: ParsedMesh | null;
  components: ObjectRef[];
}

/** Millimeters per model unit, keyed by the values the 3MF `unit` attribute allows. */
const MM_PER_UNIT: Readonly<Record<string, number>> = {
  micron: 0.001,
  millimeter: 1,
  centimeter: 10,
  inch: 25.4,
  foot: 304.8,
  meter: 1000,
};

/**
 * Components nest and repeat, so a few KB of XML can describe billions of
 * placements; stop expanding long before that exhausts memory.
 */
const MAX_PLACED_OBJECTS = 100_000;
/** At roughly 2.5 s per 10,000 sewn triangles, more than this would take hours to build. */
const MAX_PLACED_TRIANGLES = 2_000_000;
/** Each placement copies its object's vertices; three per triangle fits any mesh under the triangle limit. */
const MAX_PLACED_VERTICES = 3 * MAX_PLACED_TRIANGLES;
/** Assemblies nest a few levels deep; a far deeper chain only serves to exhaust the stack. */
const MAX_COMPONENT_DEPTH = 64;

/** The placed meshes so far, with running totals checked against the limits above. */
interface Expansion {
  meshes: ParsedMesh[];
  objects: number;
  triangles: number;
  vertices: number;
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

/** True when `<tagName` at `start` names that exact element (not a longer one like `<vertices`). */
function isTagStart(xml: string, start: number, tagName: string): boolean {
  const next = xml.charCodeAt(start + tagName.length + 1);
  // whitespace, '/' or '>'
  return next === 32 || next === 9 || next === 10 || next === 13 || next === 47 || next === 62;
}

/** Index of the next `<tagName` start tag at or after `from`, or -1. */
function indexOfTag(xml: string, tagName: string, from: number): number {
  const needle = `<${tagName}`;
  let pos = from;
  for (;;) {
    const start = xml.indexOf(needle, pos);
    if (start < 0 || isTagStart(xml, start, tagName)) return start;
    pos = start + needle.length;
  }
}

/** Collect all tags matching `<tagName ...>` using indexOf (O(n), no regex). */
function findTags(xml: string, tagName: string): string[] {
  const tags: string[] = [];
  let pos = 0;
  while (pos < xml.length) {
    const start = indexOfTag(xml, tagName, pos);
    if (start < 0) break;
    const end = xml.indexOf('>', start);
    if (end < 0) break;
    tags.push(xml.slice(start, end + 1));
    pos = end + 1;
  }
  return tags;
}

/**
 * Collect every `<tagName ...>...</tagName>` element as its start tag plus inner
 * content. A self-closing `<tagName ... />` yields an empty body.
 */
function findElements(xml: string, tagName: string): Array<{ tag: string; body: string }> {
  const elements: Array<{ tag: string; body: string }> = [];
  const close = `</${tagName}>`;
  let pos = 0;
  while (pos < xml.length) {
    const start = indexOfTag(xml, tagName, pos);
    if (start < 0) break;
    const tagEnd = xml.indexOf('>', start);
    if (tagEnd < 0) break;
    const tag = xml.slice(start, tagEnd + 1);
    if (xml.charCodeAt(tagEnd - 1) === 47) {
      elements.push({ tag, body: '' });
      pos = tagEnd + 1;
      continue;
    }
    const closeAt = xml.indexOf(close, tagEnd);
    if (closeAt < 0) break;
    elements.push({ tag, body: xml.slice(tagEnd + 1, closeAt) });
    pos = closeAt + close.length;
  }
  return elements;
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

function parseMesh(
  body: string,
  objectAttrs: Record<string, string>,
  resourceColors: Map<number, Rgba[]>
): ParsedMesh {
  const vertices: Vec3[] = [];
  const triangles: Array<[number, number, number]> = [];
  const triangleColors: Array<Rgba | null> = [];

  // Attribute-order-independent vertex extraction (no regex, CodeQL safe)
  for (const tag of findTags(body, 'vertex')) {
    const a = parseTagAttrs(tag);
    if (a['x'] !== undefined && a['y'] !== undefined && a['z'] !== undefined) {
      vertices.push([parseFloat(a['x']), parseFloat(a['y']), parseFloat(a['z'])]);
    }
  }

  // Attribute-order-independent triangle extraction
  for (const tag of findTags(body, 'triangle')) {
    const a = parseTagAttrs(tag);
    if (a['v1'] !== undefined && a['v2'] !== undefined && a['v3'] !== undefined) {
      triangles.push([parseInt(a['v1'], 10), parseInt(a['v2'], 10), parseInt(a['v3'], 10)]);

      // Resolve per-triangle color via pid/p1, falling back to object defaults
      let color: Rgba | null = null;
      const pidStr = a['pid'] ?? objectAttrs['pid'];
      const p1Str = a['p1'] ?? objectAttrs['pindex'];

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

function parseTransform(value: string | undefined): Transform | null {
  if (value === undefined) return null;
  const m = value.trim().split(/\s+/).map(Number);
  return m.length === 12 && m.every(Number.isFinite) ? m : null;
}

function parseObjectRefs(tags: string[]): ObjectRef[] {
  const refs: ObjectRef[] = [];
  for (const tag of tags) {
    const a = parseTagAttrs(tag);
    const objectId = a['objectid'];
    if (objectId !== undefined) refs.push({ objectId, transform: parseTransform(a['transform']) });
  }
  return refs;
}

/** `inner` then `outer`: with row vectors that is the matrix product inner × outer. */
function composeTransforms(inner: Transform | null, outer: Transform | null): Transform | null {
  if (inner === null) return outer;
  if (outer === null) return inner;
  const out: number[] = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 3; col++) {
      let sum = row === 3 ? (outer[9 + col] ?? 0) : 0;
      for (let k = 0; k < 3; k++) sum += (inner[row * 3 + k] ?? 0) * (outer[k * 3 + col] ?? 0);
      out.push(sum);
    }
  }
  return out;
}

function transformMesh(mesh: ParsedMesh, m: Transform | null): ParsedMesh {
  if (m === null) return mesh;
  const [m0 = 0, m1 = 0, m2 = 0, m3 = 0, m4 = 0, m5 = 0, m6 = 0, m7 = 0, m8 = 0] = m;
  const [m9 = 0, m10 = 0, m11 = 0] = m.slice(9);
  const vertices = mesh.vertices.map(([x, y, z]): Vec3 => [
    x * m0 + y * m3 + z * m6 + m9,
    x * m1 + y * m4 + z * m7 + m10,
    x * m2 + y * m5 + z * m8 + m11,
  ]);
  // A mirroring transform turns the winding inside out; swap two corners to keep normals outward.
  const det = m0 * (m4 * m8 - m5 * m7) - m1 * (m3 * m8 - m5 * m6) + m2 * (m3 * m7 - m4 * m6);
  const triangles =
    det < 0
      ? mesh.triangles.map(([a, b, c]): [number, number, number] => [a, c, b])
      : mesh.triangles;
  return { vertices, triangles, triangleColors: mesh.triangleColors };
}

/** Place `ref` and its components into `out`; returns why it stopped early, or `null`. */
function instantiate(
  objects: Map<string, ModelObject>,
  ref: ObjectRef,
  outer: Transform | null,
  ancestors: Set<string>,
  out: Expansion
): string | null {
  const object = objects.get(ref.objectId);
  // A component that refers back to an enclosing object (malformed file) would recurse forever.
  if (object === undefined || ancestors.has(ref.objectId)) return null;
  if (ancestors.size > MAX_COMPONENT_DEPTH) {
    return `components nest more than ${MAX_COMPONENT_DEPTH} levels deep`;
  }
  if (++out.objects > MAX_PLACED_OBJECTS) {
    return `the build places more than ${MAX_PLACED_OBJECTS.toLocaleString('en-US')} objects`;
  }
  const transform = composeTransforms(ref.transform, outer);
  if (object.mesh !== null && object.mesh.triangles.length > 0) {
    out.triangles += object.mesh.triangles.length;
    if (out.triangles > MAX_PLACED_TRIANGLES) {
      return `the build places more than ${MAX_PLACED_TRIANGLES.toLocaleString('en-US')} triangles`;
    }
    out.vertices += object.mesh.vertices.length;
    if (out.vertices > MAX_PLACED_VERTICES) {
      return `the build places more than ${MAX_PLACED_VERTICES.toLocaleString('en-US')} vertices`;
    }
    out.meshes.push(transformMesh(object.mesh, transform));
  }
  // One set shared down the chain, so memory grows with depth rather than depth squared.
  ancestors.add(ref.objectId);
  try {
    for (const component of object.components) {
      const stopped = instantiate(objects, component, transform, ancestors, out);
      if (stopped !== null) return stopped;
    }
  } finally {
    ancestors.delete(ref.objectId);
  }
  return null;
}

/**
 * Parse the model XML into one mesh per placed object, in millimeters.
 *
 * Each object keeps its own vertex list (triangle indices are per object), build
 * items and components contribute their transforms, and the model `unit` scales
 * coordinates to millimeters. Fails once the build expands past
 * {@link MAX_PLACED_OBJECTS} placements, {@link MAX_PLACED_TRIANGLES} triangles,
 * or {@link MAX_PLACED_VERTICES} vertices, or nests deeper than
 * {@link MAX_COMPONENT_DEPTH} levels.
 */
function parseModelXml(xml: string): Result<ParsedMesh[]> {
  const resourceColors = parseResourceColors(xml);

  const modelTag = findTags(xml, 'model')[0];
  const unit = modelTag !== undefined ? parseTagAttrs(modelTag)['unit'] : undefined;
  const mm = MM_PER_UNIT[unit ?? 'millimeter'] ?? 1;
  const toMillimeters: Transform | null = mm === 1 ? null : [mm, 0, 0, 0, mm, 0, 0, 0, mm, 0, 0, 0];

  const objects = new Map<string, ModelObject>();
  for (const { tag, body } of findElements(xml, 'object')) {
    const attrs = parseTagAttrs(tag);
    const id = attrs['id'];
    if (id === undefined) continue;
    const meshElement = findElements(body, 'mesh')[0];
    objects.set(id, {
      mesh: meshElement ? parseMesh(meshElement.body, attrs, resourceColors) : null,
      components: parseObjectRefs(findTags(body, 'component')),
    });
  }

  const build = findElements(xml, 'build')[0];
  let items = build ? parseObjectRefs(findTags(build.body, 'item')) : [];
  if (items.length === 0) {
    // No build items: place every mesh object as authored.
    items = [...objects]
      .filter(([, object]) => object.mesh !== null)
      .map(([objectId]) => ({ objectId, transform: null }));
  }

  const expansion: Expansion = { meshes: [], objects: 0, triangles: 0, vertices: 0 };
  for (const item of items) {
    const stopped = instantiate(objects, item, toMillimeters, new Set(), expansion);
    if (stopped !== null) {
      return err(
        ioError(BrepErrorCode.THREEMF_IMPORT_FAILED, `3MF model is too large to import: ${stopped}`)
      );
    }
  }
  return ok(expansion.meshes.filter((m) => m.vertices.length > 0 && m.triangles.length > 0));
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
    return ok(castResultShape(solid));
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

/** One solid per mesh; several are grouped into a compound that takes ownership of them. */
function buildShapeFromMeshes(meshes: ParsedMesh[]): Result<UnknownDimShape> {
  const solids: UnknownDimShape[] = [];
  for (const mesh of meshes) {
    const solid = buildSolidFromMesh(mesh);
    if (!solid.ok) {
      for (const built of solids) built[Symbol.dispose]();
      return solid;
    }
    solids.push(solid.value);
  }
  const [first] = solids;
  if (solids.length === 1 && first !== undefined) return ok(first);
  const compound = makeCompound(solids);
  for (const built of solids) built[Symbol.dispose]();
  return ok(compound);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Import a 3MF file from a Blob.
 *
 * Extracts the model XML from the ZIP archive and builds one solid per placed
 * object by sewing its triangles. Build-item and component transforms are
 * applied, and coordinates are scaled from the model `unit` to millimeters.
 *
 * @param blob - A Blob or File containing 3MF data (.3mf).
 * @returns A `Result` wrapping the imported solid (a `Compound` of solids when the
 *   build places several objects), or an error if parsing fails or the build
 *   expands to more than 100,000 placed objects or 2,000,000 triangles.
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
    if (!parsed.ok) return parsed;
    const meshes = parsed.value;

    if (meshes.length === 0) {
      return err(
        ioError(BrepErrorCode.THREEMF_IMPORT_FAILED, '3MF model contains no valid geometry')
      );
    }

    const shape = buildShapeFromMeshes(meshes);
    if (shape.ok) {
      // Apply dominant color if any triangle colors were parsed
      const dominantColor = findDominantColor(meshes.flatMap((m) => m.triangleColors));
      if (dominantColor !== null) {
        colorShape(shape.value, dominantColor);
      }
    }
    return shape;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(ioError(BrepErrorCode.THREEMF_IMPORT_FAILED, `3MF import failed: ${msg}`, e));
  }
}
