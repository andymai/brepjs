/**
 * The triangles of an STL file, read in JavaScript so the importer can check the
 * mesh's topology before the kernel sews it.
 */

const HEADER_BYTES = 80;
const FACET_BYTES = 50;
/** OCCT's reader takes anything shorter than one binary facet as text. */
const MIN_BINARY_BYTES = HEADER_BYTES + 4 + FACET_BYTES;
const VERTEX_LINE = /^[ \t]*vertex[ \t]+(\S+)[ \t]+(\S+)[ \t]+(\S+)/gim;

/**
 * The corner coordinates of every facet, nine per triangle in file order, or
 * `null` when the file is malformed. Text versus binary is decided as OCCT's
 * reader decides it: binary when any of the first 134 bytes is above `~`.
 */
export function stlTrianglePositions(data: ArrayBuffer): Float64Array | null {
  const bytes = new Uint8Array(data);
  return isText(bytes) ? textPositions(bytes) : binaryPositions(data);
}

function isText(bytes: Uint8Array): boolean {
  if (bytes.length < MIN_BINARY_BYTES) return true;
  for (let i = 0; i < MIN_BINARY_BYTES; i++) {
    if ((bytes[i] ?? 0) > 0x7e) return false;
  }
  return true;
}

function textPositions(bytes: Uint8Array): Float64Array | null {
  const coords: number[] = [];
  for (const [, x, y, z] of new TextDecoder().decode(bytes).matchAll(VERTEX_LINE)) {
    coords.push(Number(x), Number(y), Number(z));
  }
  return coords.length % 9 === 0 ? Float64Array.from(coords) : null;
}

function binaryPositions(data: ArrayBuffer): Float64Array | null {
  const view = new DataView(data);
  const count = view.getUint32(HEADER_BYTES, true);
  if (HEADER_BYTES + 4 + count * FACET_BYTES > data.byteLength) return null;
  const positions = new Float64Array(count * 9);
  for (let t = 0; t < count; t++) {
    // Each facet is a normal, three corners, and a two-byte attribute.
    const corners = HEADER_BYTES + 4 + t * FACET_BYTES + 12;
    for (let k = 0; k < 9; k++) {
      positions[t * 9 + k] = view.getFloat32(corners + k * 4, true);
    }
  }
  return positions;
}
