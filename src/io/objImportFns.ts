/**
 * OBJ mesh import — parses Wavefront OBJ text and builds a solid via sewing.
 */

import { getKernel } from '../kernel/index.js';
import type { KernelShape } from '../kernel/types.js';
import type { AnyShape } from '../core/shapeTypes.js';
import { castShape } from '../core/shapeTypes.js';
import { type Result, ok, err } from '../core/result.js';
import { ioError, BrepErrorCode } from '../core/errors.js';

/**
 * Import a Wavefront OBJ file from a Blob.
 *
 * Parses vertex (`v`) and face (`f`) lines, triangulates n-gons via fan
 * triangulation, and builds a solid by sewing the resulting triangular faces.
 *
 * @param blob - A Blob or File containing OBJ text data (.obj).
 * @returns A `Result` wrapping the imported solid, or an error if parsing fails.
 *
 * @example
 * ```ts
 * const file = new File([objData], 'model.obj');
 * const shape = unwrap(await importOBJ(file));
 * ```
 */
export async function importOBJ(blob: Blob): Promise<Result<AnyShape>> {
  const text = await blob.text();
  const lines = text.split('\n');

  const vertices: Array<[number, number, number]> = [];
  const faces: Array<number[]> = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('v ')) {
      const parts = line.split(/\s+/);
      const x = parseFloat(parts[1] ?? '');
      const y = parseFloat(parts[2] ?? '');
      const z = parseFloat(parts[3] ?? '');
      if (isNaN(x) || isNaN(y) || isNaN(z)) continue;
      vertices.push([x, y, z]);
    } else if (line.startsWith('f ')) {
      const parts = line.split(/\s+/).slice(1);
      const indices: number[] = [];
      for (const p of parts) {
        // OBJ format: v or v/vt or v/vt/vn or v//vn — extract first number
        const idx = parseInt(p.split('/')[0] ?? '', 10);
        if (!isNaN(idx)) indices.push(idx);
      }
      if (indices.length >= 3) faces.push(indices);
    }
  }

  if (vertices.length === 0 || faces.length === 0) {
    return err(ioError(BrepErrorCode.OBJ_IMPORT_FAILED, 'OBJ file contains no valid geometry'));
  }

  // Triangulate faces via fan triangulation and build solid
  try {
    return buildSolidFromMesh(vertices, faces);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(ioError(BrepErrorCode.OBJ_IMPORT_FAILED, `OBJ import failed: ${msg}`, e));
  }
}

function buildSolidFromMesh(
  vertices: Array<[number, number, number]>,
  faces: Array<number[]>
): Result<AnyShape> {
  const kernel = getKernel();
  const triFaces: KernelShape[] = [];

  for (const face of faces) {
    for (let i = 1; i < face.length - 1; i++) {
      const rawA = face[0] ?? 0;
      const rawB = face[i] ?? 0;
      const rawC = face[i + 1] ?? 0;
      const ai = rawA > 0 ? rawA - 1 : vertices.length + rawA;
      const bi = rawB > 0 ? rawB - 1 : vertices.length + rawB;
      const ci = rawC > 0 ? rawC - 1 : vertices.length + rawC;

      const va = vertices[ai];
      const vb = vertices[bi];
      const vc = vertices[ci];
      if (!va || !vb || !vc) continue;

      const triFace = kernel.buildTriFace(va, vb, vc);
      if (triFace !== null) {
        triFaces.push(triFace);
      }
    }
  }

  if (triFaces.length === 0) {
    return err(
      ioError(BrepErrorCode.OBJ_IMPORT_FAILED, 'No valid triangular faces could be built')
    );
  }

  try {
    return ok(castShape(kernel.sewAndSolidify(triFaces, 1e-6)));
  } catch {
    // If sewing/solid fails, try sewing alone
    try {
      return ok(castShape(kernel.sew(triFaces, 1e-6)));
    } catch {
      return err(ioError(BrepErrorCode.OBJ_IMPORT_FAILED, 'Failed to sew triangular faces'));
    }
  }
}
