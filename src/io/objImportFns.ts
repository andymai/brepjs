/**
 * OBJ mesh import — parses Wavefront OBJ text and builds a solid via sewing.
 */

import { getKernel } from '../kernel/index.js';
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
  const oc = getKernel().oc;
  const sewing = new oc.BRepBuilderAPI_Sewing(1e-6, true, true, true, false);
  let faceCount = 0;

  try {
    for (const face of faces) {
      // Fan triangulation: vertex 0, then pairs (i, i+1)
      for (let i = 1; i < face.length - 1; i++) {
        const rawA = face[0] ?? 0;
        const rawB = face[i] ?? 0;
        const rawC = face[i + 1] ?? 0;
        // OBJ is 1-based; negative indices count backward from current vertex list end
        const ai = rawA > 0 ? rawA - 1 : vertices.length + rawA;
        const bi = rawB > 0 ? rawB - 1 : vertices.length + rawB;
        const ci = rawC > 0 ? rawC - 1 : vertices.length + rawC;

        const va = vertices[ai];
        const vb = vertices[bi];
        const vc = vertices[ci];
        if (!va || !vb || !vc) continue;

        const triFace = buildTriFace(oc, va, vb, vc);
        if (triFace !== null) {
          sewing.Add(triFace);
          faceCount++;
        }
      }
    }

    if (faceCount === 0) {
      return err(
        ioError(BrepErrorCode.OBJ_IMPORT_FAILED, 'No valid triangular faces could be built')
      );
    }

    const progress = new oc.Message_ProgressRange_1();
    sewing.Perform(progress);
    progress.delete();

    const sewn = sewing.SewedShape();

    // Try to make a solid from the sewn shell, fixing orientation
    const fixer = new oc.ShapeFix_Solid_1();
    try {
      const shell = oc.TopoDS.Shell_1(sewn);
      const solid = fixer.SolidFromShell(shell);
      return ok(castShape(solid));
    } catch {
      // If solid creation fails, return the sewn shape as-is
      return ok(castShape(sewn));
    } finally {
      fixer.delete();
    }
  } finally {
    sewing.delete();
  }
}

function buildTriFace(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT kernel type
  oc: any,
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number]
) {
  const gpA = new oc.gp_Pnt_3(a[0], a[1], a[2]);
  const gpB = new oc.gp_Pnt_3(b[0], b[1], b[2]);
  const gpC = new oc.gp_Pnt_3(c[0], c[1], c[2]);

  const e1 = new oc.BRepBuilderAPI_MakeEdge_3(gpA, gpB);
  const e2 = new oc.BRepBuilderAPI_MakeEdge_3(gpB, gpC);
  const e3 = new oc.BRepBuilderAPI_MakeEdge_3(gpC, gpA);

  const wireBuilder = new oc.BRepBuilderAPI_MakeWire_1();
  wireBuilder.Add_1(e1.Edge());
  wireBuilder.Add_1(e2.Edge());
  wireBuilder.Add_1(e3.Edge());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT face type
  let face: any = null;
  if (wireBuilder.IsDone()) {
    const makeFace = new oc.BRepBuilderAPI_MakeFace_15(wireBuilder.Wire(), false);
    if (makeFace.IsDone()) {
      face = makeFace.Face();
    }
    makeFace.delete();
  }

  wireBuilder.delete();
  e1.delete();
  e2.delete();
  e3.delete();
  gpA.delete();
  gpB.delete();
  gpC.delete();

  return face;
}
