import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { MeshData } from '../../stores/playgroundStore';
import type { Selection } from '../../stores/playgroundStore';

interface Props {
  data: MeshData;
  selections: Selection[];
}

const FACE_COLOR = '#4ACECC';
const EDGE_COLOR = '#fbbf24';

/**
 * Walk the selections list and pull out the ids that match this mesh's
 * face/edge groups. With multi-shape evals the worker doesn't emit picking
 * metadata at all (see workerProtocol.MeshTransfer comment), so each id
 * matches at most one mesh in practice.
 */
function partitionIds(
  data: MeshData,
  selections: Selection[]
): { faceIds: number[]; edgeIds: number[] } {
  const faceById = new Map<number, true>();
  if (data.faceGroups) for (const g of data.faceGroups) faceById.set(g.faceId, true);
  const edgeById = new Map<number, true>();
  if (data.edgeGroups) for (const g of data.edgeGroups) edgeById.set(g.edgeId, true);

  const faceIds: number[] = [];
  const edgeIds: number[] = [];
  for (const sel of selections) {
    if (sel.kind === 'face' && faceById.has(sel.info.faceId)) {
      faceIds.push(sel.info.faceId);
    } else if (sel.kind === 'edge' && edgeById.has(sel.info.edgeId)) {
      edgeIds.push(sel.info.edgeId);
    }
  }
  return { faceIds, edgeIds };
}

function buildFaceHighlightGeometry(
  data: MeshData,
  faceIds: number[]
): THREE.BufferGeometry | null {
  if (faceIds.length === 0 || !data.faceGroups || !data.index) return null;
  const groupById = new Map(data.faceGroups.map((g) => [g.faceId, g]));

  let total = 0;
  const ranges: { start: number; count: number }[] = [];
  for (const id of faceIds) {
    const g = groupById.get(id);
    if (g) {
      ranges.push({ start: g.start, count: g.count });
      total += g.count;
    }
  }
  if (total === 0) return null;

  const newIndex = new Uint32Array(total);
  let off = 0;
  for (const r of ranges) {
    newIndex.set(data.index.subarray(r.start, r.start + r.count), off);
    off += r.count;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3));
  geo.setIndex(new THREE.BufferAttribute(newIndex, 1));
  return geo;
}

function buildEdgeHighlightGeometry(
  data: MeshData,
  edgeIds: number[]
): THREE.BufferGeometry | null {
  if (edgeIds.length === 0 || !data.edgeGroups) return null;
  const groupById = new Map(data.edgeGroups.map((g) => [g.edgeId, g]));

  let totalVerts = 0;
  const ranges: { start: number; count: number }[] = [];
  for (const id of edgeIds) {
    const g = groupById.get(id);
    if (g) {
      ranges.push({ start: g.start, count: g.count });
      totalVerts += g.count;
    }
  }
  if (totalVerts === 0) return null;

  const newPos = new Float32Array(totalVerts * 3);
  let off = 0;
  for (const r of ranges) {
    newPos.set(data.edges.subarray(r.start * 3, (r.start + r.count) * 3), off);
    off += r.count * 3;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(newPos, 3));
  return geo;
}

export default function SelectionHighlight({ data, selections }: Props) {
  // Stable cache keys: ids only, so unrelated selection drift (e.g. screenPos
  // updates from re-clicking the same face) doesn't rebuild geometry.
  const { faceIds, edgeIds } = useMemo(() => partitionIds(data, selections), [data, selections]);
  const faceKey = faceIds.join(',');
  const edgeKey = edgeIds.join(',');

  const faceGeometry = useMemo(
    () => buildFaceHighlightGeometry(data, faceIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- faceIds is captured via faceKey
    [data, faceKey]
  );
  const edgeGeometry = useMemo(
    () => buildEdgeHighlightGeometry(data, edgeIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- edgeIds is captured via edgeKey
    [data, edgeKey]
  );

  useEffect(() => {
    return () => {
      faceGeometry?.dispose();
    };
  }, [faceGeometry]);

  useEffect(() => {
    return () => {
      edgeGeometry?.dispose();
    };
  }, [edgeGeometry]);

  return (
    <>
      {faceGeometry && (
        <mesh geometry={faceGeometry} raycast={skipRaycast} renderOrder={2}>
          <meshStandardMaterial
            color={FACE_COLOR}
            emissive={FACE_COLOR}
            emissiveIntensity={0.6}
            metalness={0}
            roughness={0.3}
            side={THREE.DoubleSide}
            transparent
            opacity={0.55}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-2}
          />
        </mesh>
      )}
      {edgeGeometry && (
        <lineSegments geometry={edgeGeometry} raycast={skipRaycast} renderOrder={3}>
          {/* `linewidth` is silently clamped to 1 in WebGL2 across every major
              browser, so we lean on the bright color + depthTest=false (renders
              on top of the base edges) to make the highlight readable. */}
          <lineBasicMaterial color={EDGE_COLOR} depthTest={false} transparent />
        </lineSegments>
      )}
    </>
  );
}

// The highlight overlay must never absorb pointer events — it sits on top of
// the pickable mesh/edges and would otherwise block re-clicking the same
// entity (or shift-click toggle-off).
function skipRaycast() {
  // intentionally empty
}
