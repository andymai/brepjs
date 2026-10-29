/**
 * OBJ mesh import — parses Wavefront OBJ text and builds a solid via sewing.
 *
 * ADR-0006: OBJ text parsing and fan triangulation stay in TypeScript —
 * this is format-specific text processing. The kernel builds B-Rep faces
 * from the parsed vertex/index data.
 */

import type { UnknownDimShape } from '@/core/shapeTypes.js';
import { type Result, err } from '@/core/result.js';
import { ioError, BrepErrorCode } from '@/core/errors.js';
import { sewMeshToSolid } from './ioUtils.js';

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

function parseVertex(parts: string[]): [number, number, number] | null {
  const x = parseFloat(parts[1] ?? '');
  const y = parseFloat(parts[2] ?? '');
  const z = parseFloat(parts[3] ?? '');
  if (isNaN(x) || isNaN(y) || isNaN(z)) return null;
  return [x, y, z];
}

/**
 * Face corners as 0-based vertex indices. A negative OBJ index counts back from
 * the vertices defined so far, so it resolves against `vertexCount` at this line.
 */
function parseFaceIndices(parts: string[], vertexCount: number): number[] {
  const indices: number[] = [];
  for (const part of parts.slice(1)) {
    const raw = parseInt(part.split('/')[0] ?? '', 10);
    if (isNaN(raw)) continue;
    indices.push(raw > 0 ? raw - 1 : raw < 0 ? vertexCount + raw : -1);
  }
  return indices;
}

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
export async function importOBJ(blob: Blob): Promise<Result<UnknownDimShape>> {
  const text = await blob.text();
  const lines = text.split('\n');

  const vertices: Array<[number, number, number]> = [];
  const faces: Array<number[]> = [];

  for (const raw of lines) {
    const parts = raw.trim().split(/\s+/);
    if (parts[0] === 'v') {
      const vertex = parseVertex(parts);
      if (vertex) vertices.push(vertex);
    } else if (parts[0] === 'f') {
      const indices = parseFaceIndices(parts, vertices.length);
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
): Result<UnknownDimShape> {
  // Fan-triangulate n-gon faces (indices are already resolved to 0-based)
  const triangles: Array<
    [[number, number, number], [number, number, number], [number, number, number]]
  > = [];

  for (const face of faces) {
    for (let i = 1; i < face.length - 1; i++) {
      const va = vertices[face[0] ?? -1];
      const vb = vertices[face[i] ?? -1];
      const vc = vertices[face[i + 1] ?? -1];
      if (!va || !vb || !vc) continue;

      triangles.push([va, vb, vc]);
    }
  }

  return sewMeshToSolid(triangles, BrepErrorCode.OBJ_IMPORT_FAILED);
}
