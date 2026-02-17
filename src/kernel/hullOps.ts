/**
 * 3D convex hull via QuickHull algorithm + OCCT vertex extraction and BREP reconstruction.
 *
 * Used by OCCTAdapter.
 */

import type { OpenCascadeInstance, OcShape } from './types.js';

// ---------------------------------------------------------------------------
// Point type
// ---------------------------------------------------------------------------

interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

// ---------------------------------------------------------------------------
// Vector math helpers
// ---------------------------------------------------------------------------

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function lengthVec(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function distSq(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

/** Safe array access — throws on out-of-bounds instead of returning undefined. */
function at(arr: readonly Vec3[], i: number): Vec3 {
  const v = arr[i];
  if (v === undefined) throw new Error(`Index ${i} out of bounds`);
  return v;
}

/** Safe number array access. */
function atN(arr: readonly number[], i: number): number {
  const v = arr[i];
  if (v === undefined) throw new Error(`Index ${i} out of bounds`);
  return v;
}

// ---------------------------------------------------------------------------
// QuickHull face
// ---------------------------------------------------------------------------

interface HullFace {
  readonly a: number; // indices into points array
  readonly b: number;
  readonly c: number;
  readonly normal: Vec3;
  readonly offset: number; // dot(normal, points[a])
  alive: boolean;
  outsidePoints: number[];
}

function makeFace(points: readonly Vec3[], a: number, b: number, c: number): HullFace {
  const normal = cross(sub(at(points, b), at(points, a)), sub(at(points, c), at(points, a)));
  const len = lengthVec(normal);
  const n = len > 1e-14 ? { x: normal.x / len, y: normal.y / len, z: normal.z / len } : normal;
  return {
    a,
    b,
    c,
    normal: n,
    offset: dot(n, at(points, a)),
    alive: true,
    outsidePoints: [],
  };
}

function signedDist(face: HullFace, point: Vec3): number {
  return dot(face.normal, point) - face.offset;
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

function deduplicatePoints(points: Vec3[], tolerance: number): Vec3[] {
  const tolSq = tolerance * tolerance;
  const result: Vec3[] = [];
  for (const p of points) {
    let isDuplicate = false;
    for (const q of result) {
      if (distSq(p, q) < tolSq) {
        isDuplicate = true;
        break;
      }
    }
    if (!isDuplicate) result.push(p);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Initial tetrahedron
// ---------------------------------------------------------------------------

function findInitialTetrahedron(points: readonly Vec3[]): [number, number, number, number] | null {
  const n = points.length;
  if (n < 4) return null;

  // Find two most distant points along each axis, pick the pair with max distance
  let i0 = 0;
  let i1 = 1;
  let maxDist = distSq(at(points, 0), at(points, 1));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = distSq(at(points, i), at(points, j));
      if (d > maxDist) {
        maxDist = d;
        i0 = i;
        i1 = j;
      }
    }
  }

  if (maxDist < 1e-20) return null;

  // Find point most distant from line i0-i1
  const lineDir = sub(at(points, i1), at(points, i0));
  let i2 = -1;
  let maxLineDist = -1;

  for (let i = 0; i < n; i++) {
    if (i === i0 || i === i1) continue;
    const v = sub(at(points, i), at(points, i0));
    const c = cross(lineDir, v);
    const d = dot(c, c);
    if (d > maxLineDist) {
      maxLineDist = d;
      i2 = i;
    }
  }

  if (i2 === -1 || maxLineDist < 1e-20) return null;

  // Find point most distant from plane i0-i1-i2
  const planeNormal = cross(
    sub(at(points, i1), at(points, i0)),
    sub(at(points, i2), at(points, i0))
  );
  const planeLen = lengthVec(planeNormal);
  if (planeLen < 1e-14) return null;

  const pn = {
    x: planeNormal.x / planeLen,
    y: planeNormal.y / planeLen,
    z: planeNormal.z / planeLen,
  };
  const planeOffset = dot(pn, at(points, i0));

  let i3 = -1;
  let maxPlaneDist = -1;

  for (let i = 0; i < n; i++) {
    if (i === i0 || i === i1 || i === i2) continue;
    const d = Math.abs(dot(pn, at(points, i)) - planeOffset);
    if (d > maxPlaneDist) {
      maxPlaneDist = d;
      i3 = i;
    }
  }

  if (i3 === -1 || maxPlaneDist < 1e-14) return null;

  // Orient tetrahedron so that i3 is "above" the base triangle
  const sd = dot(pn, at(points, i3)) - planeOffset;
  if (sd > 0) {
    return [i0, i2, i1, i3]; // flip base winding
  }
  return [i0, i1, i2, i3];
}

// ---------------------------------------------------------------------------
// QuickHull
// ---------------------------------------------------------------------------

interface HullResult {
  readonly faces: ReadonlyArray<readonly [number, number, number]>;
  readonly points: readonly Vec3[];
}

function quickHull(inputPoints: Vec3[], tolerance: number): HullResult {
  const points = deduplicatePoints(inputPoints, tolerance);

  if (points.length < 4) {
    throw new Error(
      points.length === 0
        ? 'No points provided for convex hull'
        : 'Fewer than 4 non-coincident points; cannot form a 3D convex hull'
    );
  }

  const tet = findInitialTetrahedron(points);
  if (tet === null) {
    throw new Error('All points are coplanar; cannot form a 3D convex hull');
  }

  const [t0, t1, t2, t3] = tet;

  // Centroid of initial tetrahedron for ensuring outward normals
  const centroid: Vec3 = {
    x: (at(points, t0).x + at(points, t1).x + at(points, t2).x + at(points, t3).x) / 4,
    y: (at(points, t0).y + at(points, t1).y + at(points, t2).y + at(points, t3).y) / 4,
    z: (at(points, t0).z + at(points, t1).z + at(points, t2).z + at(points, t3).z) / 4,
  };

  // Build initial 4 faces of tetrahedron, ensuring outward normals
  function makeOutwardFace(a: number, b: number, c: number): HullFace {
    const face = makeFace(points, a, b, c);
    // If normal points toward centroid, flip the winding
    const faceCenter: Vec3 = {
      x: (at(points, a).x + at(points, b).x + at(points, c).x) / 3,
      y: (at(points, a).y + at(points, b).y + at(points, c).y) / 3,
      z: (at(points, a).z + at(points, b).z + at(points, c).z) / 3,
    };
    const toCentroid = sub(centroid, faceCenter);
    if (dot(face.normal, toCentroid) > 0) {
      // Normal points inward, flip
      return makeFace(points, a, c, b);
    }
    return face;
  }

  const faces: HullFace[] = [
    makeOutwardFace(t0, t1, t2),
    makeOutwardFace(t0, t2, t3),
    makeOutwardFace(t0, t3, t1),
    makeOutwardFace(t1, t3, t2),
  ];

  const tetSet = new Set([t0, t1, t2, t3]);

  // Use a small geometric epsilon for "outside" tests, independent of mesh tolerance.
  // Mesh tolerance controls deduplication; hull geometry uses a much tighter epsilon.
  const epsilon = 1e-10;

  // Assign each non-tet point to the first visible face
  for (let i = 0; i < points.length; i++) {
    if (tetSet.has(i)) continue;
    for (const face of faces) {
      if (signedDist(face, at(points, i)) > epsilon) {
        face.outsidePoints.push(i);
        break;
      }
    }
  }

  for (let iteration = 0; iteration < points.length * 4; iteration++) {
    // Find a face with outside points
    let currentFace: HullFace | null = null;
    for (const face of faces) {
      if (face.alive && face.outsidePoints.length > 0) {
        currentFace = face;
        break;
      }
    }
    if (currentFace === null) break;

    // Find the furthest point from this face
    let furthestIdx = atN(currentFace.outsidePoints, 0);
    let furthestDist = signedDist(currentFace, at(points, furthestIdx));
    for (let i = 1; i < currentFace.outsidePoints.length; i++) {
      const idx = atN(currentFace.outsidePoints, i);
      const d = signedDist(currentFace, at(points, idx));
      if (d > furthestDist) {
        furthestDist = d;
        furthestIdx = idx;
      }
    }

    // Find all visible faces from this point
    const visibleFaces: HullFace[] = [];
    for (const face of faces) {
      if (face.alive && signedDist(face, at(points, furthestIdx)) > epsilon) {
        visibleFaces.push(face);
      }
    }

    // Find horizon edges (edges shared by exactly one visible face)
    const edgeCount = new Map<string, { a: number; b: number; count: number }>();
    for (const face of visibleFaces) {
      const edges: [number, number][] = [
        [face.a, face.b],
        [face.b, face.c],
        [face.c, face.a],
      ];
      for (const [ea, eb] of edges) {
        const key = ea < eb ? `${ea}-${eb}` : `${eb}-${ea}`;
        const entry = edgeCount.get(key);
        if (entry) {
          entry.count++;
        } else {
          // Store in the order from the visible face
          edgeCount.set(key, { a: ea, b: eb, count: 1 });
        }
      }
    }

    const horizonEdges: Array<{ a: number; b: number }> = [];
    for (const entry of edgeCount.values()) {
      if (entry.count === 1) {
        // Keep edge in same direction as the visible face; makeFace with apex
        // produces outward normal by winding convention
        horizonEdges.push({ a: entry.a, b: entry.b });
      }
    }

    // Collect orphaned outside points from visible faces
    const orphanedPoints: number[] = [];
    for (const face of visibleFaces) {
      for (const idx of face.outsidePoints) {
        if (idx !== furthestIdx) {
          orphanedPoints.push(idx);
        }
      }
      face.alive = false;
      face.outsidePoints = [];
    }

    // Create new faces from horizon edges to the furthest point
    const newFaces: HullFace[] = [];
    for (const edge of horizonEdges) {
      const newFaceObj = makeFace(points, edge.a, edge.b, furthestIdx);
      newFaces.push(newFaceObj);
      faces.push(newFaceObj);
    }

    // Reassign orphaned points to new faces
    for (const idx of orphanedPoints) {
      for (const face of newFaces) {
        if (signedDist(face, at(points, idx)) > epsilon) {
          face.outsidePoints.push(idx);
          break;
        }
      }
    }
  }

  // Collect alive faces
  const resultFaces: Array<readonly [number, number, number]> = [];
  for (const face of faces) {
    if (face.alive) {
      resultFaces.push([face.a, face.b, face.c] as const);
    }
  }

  return { faces: resultFaces, points };
}

// ---------------------------------------------------------------------------
// Vertex extraction from OCCT shapes
// ---------------------------------------------------------------------------

function extractVertices(oc: OpenCascadeInstance, shapes: OcShape[], tolerance: number): Vec3[] {
  const vertices: Vec3[] = [];
  // Use a coarser mesh for hull vertex extraction to avoid excessive point counts.
  // For curved surfaces, fine meshes generate thousands of points which makes
  // QuickHull very slow. A deflection of 1.0 is sufficient for hull approximation.
  const meshDeflection = Math.max(tolerance, 1.0);

  for (const shape of shapes) {
    // Mesh the shape
    const mesh = new oc.BRepMesh_IncrementalMesh_2(
      shape,
      meshDeflection,
      false,
      meshDeflection * 0.5,
      false
    );
    const progress = new oc.Message_ProgressRange_1();
    mesh.Perform(progress);
    progress.delete();
    mesh.delete();

    // Iterate faces to get triangulation nodes
    const explorer = new oc.TopExp_Explorer_2(
      shape,
      oc.TopAbs_ShapeEnum.TopAbs_FACE,
      oc.TopAbs_ShapeEnum.TopAbs_SHAPE
    );

    while (explorer.More()) {
      const face = oc.TopoDS.Face_1(explorer.Current());
      const location = new oc.TopLoc_Location_1();
      const tri = oc.BRep_Tool.Triangulation(face, location, 0);

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

function buildTriFace(oc: OpenCascadeInstance, pa: Vec3, pb: Vec3, pc: Vec3): OcShape | null {
  const gpA = new oc.gp_Pnt_3(pa.x, pa.y, pa.z);
  const gpB = new oc.gp_Pnt_3(pb.x, pb.y, pb.z);
  const gpC = new oc.gp_Pnt_3(pc.x, pc.y, pc.z);

  const e1 = new oc.BRepBuilderAPI_MakeEdge_3(gpA, gpB);
  const e2 = new oc.BRepBuilderAPI_MakeEdge_3(gpB, gpC);
  const e3 = new oc.BRepBuilderAPI_MakeEdge_3(gpC, gpA);

  const wireBuilder = new oc.BRepBuilderAPI_MakeWire_1();
  wireBuilder.Add_1(e1.Edge());
  wireBuilder.Add_1(e2.Edge());
  wireBuilder.Add_1(e3.Edge());

  let face: OcShape | null = null;
  if (wireBuilder.IsDone()) {
    const makeFaceBuilder = new oc.BRepBuilderAPI_MakeFace_15(wireBuilder.Wire(), false);
    if (makeFaceBuilder.IsDone()) {
      face = makeFaceBuilder.Face();
    }
    makeFaceBuilder.delete();
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

function reconstructBrep(
  oc: OpenCascadeInstance,
  hullResult: HullResult,
  tolerance: number
): OcShape {
  const { faces: hullFaces, points } = hullResult;

  // Phase 1: Build all triangular faces
  const ocFaces: OcShape[] = [];
  for (const [ia, ib, ic] of hullFaces) {
    const face = buildTriFace(oc, at(points, ia), at(points, ib), at(points, ic));
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
    const shell = oc.TopoDS.Shell_1(shellExplorer.Current());
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
export function hull(oc: OpenCascadeInstance, shapes: OcShape[], tolerance: number): OcShape {
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
export function hullFromPoints(
  oc: OpenCascadeInstance,
  points: Vec3[],
  tolerance: number
): OcShape {
  if (points.length < 4) {
    throw new Error('hullFromPoints: fewer than 4 points');
  }

  const hullResult = quickHull(points, tolerance);

  if (hullResult.faces.length < 4) {
    throw new Error('hullFromPoints: degenerate hull (fewer than 4 faces)');
  }

  return reconstructBrep(oc, hullResult, tolerance);
}
