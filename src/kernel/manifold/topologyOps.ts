import type { KernelTopologyOps } from '@/kernel/interfaces/topologyOps.js';
import type { KernelAdapter } from '@/kernel/interfaces/index.js';
import type { KernelShape, ShapeOrientation, ShapeType } from '@/kernel/types.js';
import type { ManifoldModule } from './helpers.js';
import { asManifoldShape, brepCache, occtOrThrow, resolveOcct, unwrap } from './meshHandle.js';
import { replay } from './replay.js';
import { extractFaces } from './nativeFaces.js';
import { extractEdges, extractVertices } from './nativeEdges.js';

function brepOf(shape: KernelShape, method: string): { occt: KernelAdapter; brep: KernelShape } {
  const ms = asManifoldShape(shape);
  if (!ms) {
    throw new Error(`manifold: ${method} requires a manifold shape handle`);
  }
  if (!ms.node.replayable) {
    throw new Error(
      `manifold: ${method} unsupported; shape originates from a non-replayable op (raw mesh import or mesh boolean)`
    );
  }
  const occt = occtOrThrow(method);
  const cached = brepCache.get(ms.node);
  if (cached !== undefined) {
    return { occt, brep: cached };
  }
  const brep = replay(ms.node, occt);
  brepCache.set(ms.node, brep);
  return { occt, brep };
}

function shapeType(shape: KernelShape): ShapeType {
  // A manifold-3d solid is, by construction, a watertight solid. Answer
  // natively so castShape() can wrap boolean/primitive results without
  // replaying the whole op-graph onto OCCT — the replay would erase the
  // point of a fast mesh-CSG preview kernel (and require an occt kernel to
  // even classify a shape). Non-manifold handles still classify via OCCT.
  if (asManifoldShape(shape)) return 'solid';
  const { occt, brep } = brepOf(shape, 'shapeType');
  return occt.shapeType(brep);
}

function isSame(a: KernelShape, b: KernelShape): boolean {
  const sa = asManifoldShape(a);
  const sb = asManifoldShape(b);
  if (!sa || !sb) return false;
  return sa.manifold === sb.manifold;
}

function hashCode(shape: KernelShape, upperBound: number): number {
  const ms = asManifoldShape(shape);
  if (!ms) return 0;
  // No per-node cache: occt.hashCode depends on upperBound (a node-keyed cache
  // returns a stale out-of-range value when the bound changes). The expensive
  // replay is already memoized in brepCache via brepOf.
  const { occt, brep } = brepOf(shape, 'hashCode');
  return occt.hashCode(brep, upperBound);
}

function isNull(shape: KernelShape): boolean {
  const s = asManifoldShape(shape);
  if (!s) return true;
  // Only a genuinely absent solid is "null". An EMPTY-but-present manifold
  // (e.g. the result of cut(a, a) or a disjoint intersection) is a valid
  // zero-volume solid, matching OCCT — so measureVolume returns 0 instead of
  // throwing NULL_SHAPE_INPUT.
  return !unwrap(s);
}

function iterShapes(shape: KernelShape, type: ShapeType): KernelShape[] {
  const s = asManifoldShape(shape);
  if (!s) return [];
  if (type === 'solid') return [shape];
  // Native B-rep vertices: mesh corners where ≥3 faces meet, no OCCT replay.
  if (type === 'vertex') {
    const solid = unwrap(s);
    if (solid && typeof solid.getMesh === 'function') {
      return extractVertices(solid.getMesh()).map((v, index) => ({
        ...v,
        __manifoldSub: true,
        index,
        box: { min: v.point, max: v.point },
        parent: s.node,
        subType: 'vertex' as const,
      }));
    }
    return [];
  }
  if (type !== 'edge' && type !== 'face') return [];
  // Native fast path for faces: group the manifold mesh by faceID — real planar
  // faces with normal/center/area/provenance, NO OCCT replay. This is the
  // faceFinder unlock (shell/scoops) that previously forced a full op-graph
  // rebuild onto OCCT per query.
  if (type === 'face') {
    const solid = unwrap(s);
    if (solid && typeof solid.getMesh === 'function') {
      return extractFaces(solid.getMesh()).map((f, index) => ({
        ...f,
        __manifoldSub: true,
        index,
        box: { min: f.min, max: f.max },
        parent: s.node,
        subType: 'face' as const,
      }));
    }
  }
  // Native fast path for edges: face-pair boundaries from the mesh — real edges
  // with tangent/length/provenance, NO OCCT replay (edgeFinder for lip fillets).
  if (type === 'edge') {
    const solid = unwrap(s);
    if (solid && typeof solid.getMesh === 'function') {
      return extractEdges(solid.getMesh()).map((e, index) => ({
        ...e,
        __manifoldSub: true,
        index,
        box: { min: e.min, max: e.max },
        parent: s.node,
        subType: 'edge' as const,
      }));
    }
  }
  // Faces/edges without a mesh fall back to the OCCT replay: expose each
  // sub-shape as a witness carrying its OCCT shape + bounding box.
  if (!s.node.replayable) return [];
  const occt = resolveOcct();
  if (!occt) return [];
  const brep =
    brepCache.get(s.node) ??
    (() => {
      const b = replay(s.node, occt);
      brepCache.set(s.node, b);
      return b;
    })();
  // Witnesses carry the OCCT sub-shape directly (so geometry/topology queries
  // delegate straight to OCCT) plus the box + parent node for selection
  // re-identification on a later replay. This is what unblocks faceFinder.
  return occt.iterShapes(brep, type).map((sub, index) => ({
    __manifoldSub: true,
    index,
    box: occt.boundingBox(sub),
    occt: sub,
    parent: s.node,
    subType: type,
  }));
}

function edgeToFaceMap(shape: KernelShape): string {
  const { occt, brep } = brepOf(shape, 'edgeToFaceMap');
  return occt.edgeToFaceMap(brep);
}

function adjacentFaces(shape: KernelShape, face: KernelShape): KernelShape[] {
  const { occt, brep } = brepOf(shape, 'adjacentFaces');
  return occt.adjacentFaces(brep, face);
}

export function makeTopologyOps(_module: ManifoldModule): KernelTopologyOps {
  return {
    iterShapes,
    iterShapeList: (list, callback) => {
      occtOrThrow('iterShapeList').iterShapeList(list, callback);
    },
    shapeType,
    isSame,
    isEqual: isSame,
    downcast: (shape) => shape,
    hashCode,
    isNull,
    shapeOrientation: (_shape: KernelShape): ShapeOrientation => 'forward',
    edgeToFaceMap,
    sharedEdges: (faceA, faceB) => occtOrThrow('sharedEdges').sharedEdges(faceA, faceB),
    adjacentFaces,
    sew: () => {
      throw new Error('manifold: sew is unsupported on the mesh kernel; use a B-rep kernel');
    },
  };
}
