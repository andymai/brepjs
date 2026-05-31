import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { MeshData } from './types.js';

export interface SelectionHighlightProps {
  data: MeshData;
  selectedFaceIds?: number[];
  selectedEdgeIds?: number[];
  hoverFaceId?: number | null;
  hoverEdgeId?: number | null;
}

const FACE_COLOR = '#4ACECC';
const EDGE_COLOR = '#fbbf24';

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

export default function SelectionHighlight({
  data,
  selectedFaceIds = [],
  selectedEdgeIds = [],
  hoverFaceId = null,
  hoverEdgeId = null,
}: SelectionHighlightProps) {
  // Stable cache keys: ids only, so unrelated selection drift (e.g. screenPos
  // updates from re-clicking the same face) doesn't rebuild geometry.
  const selectedFaceKey = selectedFaceIds.join(',');
  const selectedEdgeKey = selectedEdgeIds.join(',');
  const faceIds = useMemo(
    () => selectedFaceIds.filter((id) => data.faceGroups?.some((g) => g.faceId === id)),
    [data, selectedFaceKey]
  );
  const edgeIds = useMemo(
    () => selectedEdgeIds.filter((id) => data.edgeGroups?.some((g) => g.edgeId === id)),
    [data, selectedEdgeKey]
  );
  const faceKey = faceIds.join(',');
  const edgeKey = edgeIds.join(',');

  const faceGeometry = useMemo(() => buildFaceHighlightGeometry(data, faceIds), [data, faceKey]);
  const edgeGeometry = useMemo(() => buildEdgeHighlightGeometry(data, edgeIds), [data, edgeKey]);

  const resolvedHoverFaceId = useMemo(() => {
    if (hoverFaceId === null) return null;
    if (!data.faceGroups?.some((g) => g.faceId === hoverFaceId)) return null;
    return hoverFaceId;
  }, [hoverFaceId, data.faceGroups]);
  const resolvedHoverEdgeId = useMemo(() => {
    if (hoverEdgeId === null) return null;
    if (!data.edgeGroups?.some((g) => g.edgeId === hoverEdgeId)) return null;
    return hoverEdgeId;
  }, [hoverEdgeId, data.edgeGroups]);

  const hoverFaceGeometry = useMemo(
    () => (resolvedHoverFaceId !== null ? buildFaceHighlightGeometry(data, [resolvedHoverFaceId]) : null),
    [data, resolvedHoverFaceId]
  );
  const hoverEdgeGeometry = useMemo(
    () => (resolvedHoverEdgeId !== null ? buildEdgeHighlightGeometry(data, [resolvedHoverEdgeId]) : null),
    [data, resolvedHoverEdgeId]
  );

  // Skip rendering the hover overlay when the hovered entity is already in
  // selections — the committed overlay covers the same triangles, and two
  // transparent quads at the same poly-offset would just produce flicker.
  const shouldRenderHoverFace =
    resolvedHoverFaceId !== null && !faceIds.includes(resolvedHoverFaceId);
  const shouldRenderHoverEdge =
    resolvedHoverEdgeId !== null && !edgeIds.includes(resolvedHoverEdgeId);

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

  useEffect(() => {
    return () => {
      hoverFaceGeometry?.dispose();
    };
  }, [hoverFaceGeometry]);

  useEffect(() => {
    return () => {
      hoverEdgeGeometry?.dispose();
    };
  }, [hoverEdgeGeometry]);

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
      {hoverFaceGeometry && shouldRenderHoverFace && (
        // renderOrder one below the committed overlay (which is `2`) so the
        // committed face always composites on top when both happen to be
        // visible on adjacent faces — three.js sorts transparent objects by
        // renderOrder, so equal values would blend in unspecified order.
        <mesh geometry={hoverFaceGeometry} raycast={skipRaycast} renderOrder={1}>
          <meshStandardMaterial
            color={FACE_COLOR}
            emissive={FACE_COLOR}
            emissiveIntensity={0.35}
            metalness={0}
            roughness={0.3}
            side={THREE.DoubleSide}
            transparent
            opacity={0.22}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-2}
            polygonOffsetUnits={-2}
          />
        </mesh>
      )}
      {hoverEdgeGeometry && shouldRenderHoverEdge && (
        // renderOrder=2 keeps it below the committed edge overlay (=3) for
        // the same blending-stability reason as the face hover above.
        <lineSegments geometry={hoverEdgeGeometry} raycast={skipRaycast} renderOrder={2}>
          <lineBasicMaterial color={EDGE_COLOR} depthTest={false} transparent opacity={0.55} />
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
