import { useCallback, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { EdgeGroup, EdgeInfo } from '../../workers/workerProtocol';
import { usePlaygroundStore } from '../../stores/playgroundStore';
import { useToastStore } from '../../stores/toastStore';
import { buildEdgeFinderSnippet } from '../../lib/finderSnippet';

interface Props {
  edges: Float32Array;
  edgeGroups?: EdgeGroup[];
  edgeInfos?: EdgeInfo[];
}

// Map a vertex index in the line buffer to its edge group via binary search
// over (start, count) ranges. Edge groups are sorted by start offset so the
// search is O(log n) per pick.
function findGroupAt(groups: EdgeGroup[], vertexIndex: number): EdgeGroup | null {
  let lo = 0;
  let hi = groups.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const g = groups[mid]!;
    if (vertexIndex < g.start) hi = mid - 1;
    else if (vertexIndex >= g.start + g.count) lo = mid + 1;
    else return g;
  }
  return null;
}

export default function EdgeRenderer({ edges, edgeGroups, edgeInfos }: Props) {
  const setSelection = usePlaygroundStore((s) => s.setSelection);
  const addToast = useToastStore((s) => s.addToast);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(edges, 3));
    return geo;
  }, [edges]);

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  const edgeInfoById = useMemo(() => {
    if (!edgeInfos) return null;
    const m = new Map<number, EdgeInfo>();
    for (const info of edgeInfos) m.set(info.edgeId, info);
    return m;
  }, [edgeInfos]);

  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      if (!edgeGroups || !edgeInfoById) return;
      const vertexIndex = event.index;
      if (vertexIndex === undefined) return;
      const group = findGroupAt(edgeGroups, vertexIndex);
      if (!group) return;
      const info = edgeInfoById.get(group.edgeId);
      if (!info) return;
      event.stopPropagation();
      setSelection({ kind: 'edge', info });
      const snippet = buildEdgeFinderSnippet(info);
      void navigator.clipboard?.writeText(snippet).then(
        () => addToast('Edge finder copied'),
        () => addToast('Edge selected (copy failed)')
      );
    },
    [edgeGroups, edgeInfoById, setSelection, addToast]
  );

  return (
    <lineSegments
      geometry={geometry}
      renderOrder={1}
      onClick={handleClick}
      raycast={raycastLines}
    >
      <lineBasicMaterial color="#000000" depthTest={true} linewidth={2} />
    </lineSegments>
  );
}

// Bumps the line-pick threshold so users don't need to hit the 1-pixel-wide
// line dead-on; the default threshold is too tight on hi-DPI displays.
const PICK_THRESHOLD_WORLD = 0.5;
function raycastLines(
  this: THREE.LineSegments,
  raycaster: THREE.Raycaster,
  intersects: THREE.Intersection[]
) {
  const prev = raycaster.params.Line?.threshold;
  if (raycaster.params.Line) raycaster.params.Line.threshold = PICK_THRESHOLD_WORLD;
  THREE.LineSegments.prototype.raycast.call(this, raycaster, intersects);
  if (raycaster.params.Line && prev !== undefined) raycaster.params.Line.threshold = prev;
}
