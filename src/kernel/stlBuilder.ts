/**
 * Kernel-agnostic STL serializers.
 *
 * Both writers take a triangle soup (positions + indices) and emit STL. Facet
 * normals are derived from triangle winding (right-hand rule) rather than the
 * mesh's per-vertex normals, matching the per-facet STL format.
 * @module
 */

interface Facet {
  nx: number;
  ny: number;
  nz: number;
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  cx: number;
  cy: number;
  cz: number;
}

function facetAt(vertices: ArrayLike<number>, triangles: ArrayLike<number>, i: number): Facet {
  const ia = (triangles[i * 3] ?? 0) * 3;
  const ib = (triangles[i * 3 + 1] ?? 0) * 3;
  const ic = (triangles[i * 3 + 2] ?? 0) * 3;
  const ax = vertices[ia] ?? 0,
    ay = vertices[ia + 1] ?? 0,
    az = vertices[ia + 2] ?? 0;
  const bx = vertices[ib] ?? 0,
    by = vertices[ib + 1] ?? 0,
    bz = vertices[ib + 2] ?? 0;
  const cx = vertices[ic] ?? 0,
    cy = vertices[ic + 1] ?? 0,
    cz = vertices[ic + 2] ?? 0;
  const ux = bx - ax,
    uy = by - ay,
    uz = bz - az;
  const vx = cx - ax,
    vy = cy - ay,
    vz = cz - az;
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len;
  ny /= len;
  nz /= len;
  return { nx, ny, nz, ax, ay, az, bx, by, bz, cx, cy, cz };
}

/** Serialize a triangle soup as a binary STL (80-byte header + uint32 count + 50B/tri). */
export function buildBinarySTL(
  vertices: ArrayLike<number>,
  triangles: ArrayLike<number>
): ArrayBuffer {
  const triCount = Math.floor(triangles.length / 3);
  const buffer = new ArrayBuffer(84 + triCount * 50);
  const view = new DataView(buffer);
  view.setUint32(80, triCount, true);
  let offset = 84;
  for (let i = 0; i < triCount; i++) {
    const f = facetAt(vertices, triangles, i);
    view.setFloat32(offset, f.nx, true);
    view.setFloat32(offset + 4, f.ny, true);
    view.setFloat32(offset + 8, f.nz, true);
    view.setFloat32(offset + 12, f.ax, true);
    view.setFloat32(offset + 16, f.ay, true);
    view.setFloat32(offset + 20, f.az, true);
    view.setFloat32(offset + 24, f.bx, true);
    view.setFloat32(offset + 28, f.by, true);
    view.setFloat32(offset + 32, f.bz, true);
    view.setFloat32(offset + 36, f.cx, true);
    view.setFloat32(offset + 40, f.cy, true);
    view.setFloat32(offset + 44, f.cz, true);
    view.setUint16(offset + 48, 0, true);
    offset += 50;
  }
  return buffer;
}

/** Serialize a triangle soup as an ASCII STL. */
export function buildAsciiSTL(vertices: ArrayLike<number>, triangles: ArrayLike<number>): string {
  const triCount = Math.floor(triangles.length / 3);
  const lines: string[] = ['solid brepjs'];
  for (let i = 0; i < triCount; i++) {
    const f = facetAt(vertices, triangles, i);
    lines.push(`facet normal ${f.nx} ${f.ny} ${f.nz}`);
    lines.push('outer loop');
    lines.push(`vertex ${f.ax} ${f.ay} ${f.az}`);
    lines.push(`vertex ${f.bx} ${f.by} ${f.bz}`);
    lines.push(`vertex ${f.cx} ${f.cy} ${f.cz}`);
    lines.push('endloop');
    lines.push('endfacet');
  }
  lines.push('endsolid brepjs');
  return lines.join('\n') + '\n';
}
