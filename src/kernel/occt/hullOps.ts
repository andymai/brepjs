/**
 * 3D convex hull for the OCCT adapter: shared QuickHull + OCCT vertex
 * extraction and BREP reconstruction.
 *
 * Used by DefaultAdapter.
 */

import type { KernelInstance, KernelShape } from '@/kernel/types.js';
import type { KernelAdapter } from '@/kernel/interfaces/index.js';
import { quickHull, type Vec3, type HullResult } from '@/kernel/hullGeometry.js';
import { makeTriFace } from './constructorOps.js';

/** Safe array access — throws on out-of-bounds instead of returning undefined. */
function at(arr: readonly Vec3[], i: number): Vec3 {
  const v = arr[i];
  if (v === undefined) throw new Error(`Index ${i} out of bounds`);
  return v;
}

// ---------------------------------------------------------------------------
// Vertex extraction from OCCT shapes
// ---------------------------------------------------------------------------

function extractVertices(oc: KernelInstance, shapes: KernelShape[], tolerance: number): Vec3[] {
  const vertices: Vec3[] = [];
  // Use a coarser mesh for hull vertex extraction to avoid excessive point counts.
  // For curved surfaces, fine meshes generate thousands of points which makes
  // QuickHull very slow. A deflection of 1.0 is sufficient for hull approximation.
  const meshDeflection = Math.max(tolerance, 1.0);

  for (const shape of shapes) {
    // Mesh the shape
    const mesh = new oc.BRepMesh_IncrementalMeshWrapper(
      shape,
      meshDeflection,
      false,
      meshDeflection * 0.5,
      false
    );
    mesh.delete();

    // Iterate faces to get triangulation nodes
    const explorer = new oc.TopExp_Explorer_2(
      shape,
      oc.TopAbs_ShapeEnum.TopAbs_FACE,
      oc.TopAbs_ShapeEnum.TopAbs_SHAPE
    );

    while (explorer.More()) {
      const face = oc.TopoDS_Cast.Face(explorer.Current());
      const location = new oc.TopLoc_Location_1();
      const tri = oc.BRep_Tool_Triangulation(face, location, 0);

      if (!tri.IsNull()) {
        const trsf = location.Transformation();
        const nbNodes = tri.get().NbNodes();

        for (let i = 1; i <= nbNodes; i++) {
          const node = tri.get().Node(i);
          const transformed = node.Transformed(trsf);
          vertices.push({
            x: transformed.X(),
            y: transformed.Y(),
            z: transformed.Z(),
          });
          transformed.delete();
          node.delete();
        }

        trsf.delete();
      }

      location.delete();
      explorer.Next();
    }

    explorer.delete();
  }

  return vertices;
}

// ---------------------------------------------------------------------------
// BREP reconstruction from hull facets
// ---------------------------------------------------------------------------

function reconstructBrep(
  oc: KernelInstance,
  hullResult: HullResult,
  tolerance: number
): KernelShape {
  const { faces: hullFaces, points } = hullResult;

  // Phase 1: Build all triangular faces
  const ocFaces: KernelShape[] = [];
  for (const [ia, ib, ic] of hullFaces) {
    const pa = at(points, ia),
      pb = at(points, ib),
      pc = at(points, ic);
    const face = makeTriFace(oc, [pa.x, pa.y, pa.z], [pb.x, pb.y, pb.z], [pc.x, pc.y, pc.z]);
    if (face !== null) {
      ocFaces.push(face);
    }
  }

  if (ocFaces.length < 4) {
    throw new Error(`hull: only ${ocFaces.length} faces built, need at least 4 for a solid`);
  }

  // Phase 2: Sew faces into a shell
  // Use generous sewing tolerance to ensure shared edges/vertices are merged
  const sewTolerance = Math.max(tolerance, 1e-4);
  const sewing = new oc.BRepBuilderAPI_Sewing(sewTolerance, true, true, true, false);
  for (const face of ocFaces) {
    sewing.Add(face);
  }
  const sewProgress = new oc.Message_ProgressRange_1();
  sewing.Perform(sewProgress);
  sewProgress.delete();

  const sewn = sewing.SewedShape();
  sewing.delete();

  // Phase 3: Extract shell and build solid
  // Use MakeSolid_1 (empty constructor) + Add pattern from sweepOps.ts
  const shellExplorer = new oc.TopExp_Explorer_2(
    sewn,
    oc.TopAbs_ShapeEnum.TopAbs_SHELL,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE
  );

  if (shellExplorer.More()) {
    const shell = oc.TopoDS_Cast.Shell(shellExplorer.Current());
    shellExplorer.delete();

    const solidMaker = new oc.BRepBuilderAPI_MakeSolid_1();
    solidMaker.Add(shell);
    const solidProgress = new oc.Message_ProgressRange_1();
    solidMaker.Build(solidProgress);
    solidProgress.delete();

    if (solidMaker.IsDone()) {
      const solid = solidMaker.Solid();
      solidMaker.delete();
      shell.delete();
      // Check volume sign — if negative, normals point inward; reverse orientation
      const props = new oc.GProp_GProps_1();
      oc.BRepGProp.VolumeProperties_1(solid, props, false, false, false);
      const vol = props.Mass();
      props.delete();
      if (vol < 0) {
        solid.Complement();
      }
      return solid;
    }

    shell.delete();
    solidMaker.delete();
    return sewn;
  }

  shellExplorer.delete();
  return sewn;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute the 3D convex hull of one or more OCCT shapes.
 *
 * Extracts mesh vertices from all input shapes, runs QuickHull,
 * and reconstructs a BREP solid from the hull facets.
 */
export function hull(oc: KernelInstance, shapes: KernelShape[], tolerance: number): KernelShape {
  if (shapes.length === 0) {
    throw new Error('hull: no shapes provided');
  }

  const vertices = extractVertices(oc, shapes, tolerance);

  if (vertices.length < 4) {
    throw new Error('hull: fewer than 4 vertices extracted from input shapes');
  }

  const hullResult = quickHull(vertices, tolerance);

  if (hullResult.faces.length < 4) {
    throw new Error('hull: degenerate hull (fewer than 4 faces)');
  }

  return reconstructBrep(oc, hullResult, tolerance);
}

/**
 * Compute the 3D convex hull from raw 3D point coordinates.
 *
 * Runs QuickHull on the supplied points and reconstructs a BREP solid.
 * Used by minkowski to avoid meshing bare vertex shapes.
 */
export function buildSolidFromFaces(
  oc: KernelInstance,
  points: Vec3[],
  faces: Array<readonly [number, number, number]>,
  tolerance: number
): KernelShape {
  const hullResult: HullResult = { points, faces };
  return reconstructBrep(oc, hullResult, tolerance);
}

export function hullFromPoints(oc: KernelInstance, points: Vec3[], tolerance: number): KernelShape {
  if (points.length < 4) {
    throw new Error('hullFromPoints: fewer than 4 points');
  }

  const hullResult = quickHull(points, tolerance);

  if (hullResult.faces.length < 4) {
    throw new Error('hullFromPoints: degenerate hull (fewer than 4 faces)');
  }

  return reconstructBrep(oc, hullResult, tolerance);
}

/** Co-located factory: returns the hull/builder slice of {@link KernelAdapter} bound to `oc`. */
export function makeHullOps(oc: KernelInstance) {
  return {
    hull: (shapes, tolerance) => hull(oc, shapes, tolerance),
    hullFromPoints: (points, tolerance) => hullFromPoints(oc, points, tolerance),
    buildSolidFromFaces: (points, faces, tolerance) =>
      buildSolidFromFaces(oc, points, faces, tolerance),
  } satisfies Pick<KernelAdapter, 'hull' | 'hullFromPoints' | 'buildSolidFromFaces'>;
}
