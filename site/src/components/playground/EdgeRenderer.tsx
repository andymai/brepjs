import { useCallback, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { EdgeGroup, EdgeInfo } from '../../workers/workerProtocol';
import { usePlaygroundStore } from '../../stores/playgroundStore';
import { useToastStore } from '../../stores/toastStore';
import { buildEdgeFinderSnippet } from '../../lib/finderSnippet';
import { copyToClipboard } from '../../lib/copyToClipboard';

interface Props {
  edges: Float32Array;
  edgeGroups?: EdgeGroup[];
  edgeInfos?: EdgeInfo[];
}

// Edge groups are sorted by start offset, so binary search the (start, count)
// ranges to find the group containing a given vertex index.
function findGroupAt(groups: EdgeGroup[], vertexIndex: number): EdgeGroup | null {
  let lo = 0;
  let hi = groups.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const group = groups[mid]!;
    if (vertexIndex < group.start) hi = mid - 1;
    else if (vertexIndex >= group.start + group.count) lo = mid + 1;
    else return group;
  }
  return null;
}

export default function EdgeRenderer({ edges, edgeGroups, edgeInfos }: Props) {
  const pickSelection = usePlaygroundStore((s) => s.pickSelection);
  const setHoverEntity = usePlaygroundStore((s) => s.setHoverEntity);
  const addToast = useToastStore((s) => s.addToast);
  const pickable = Boolean(edgeGroups && edgeInfos);

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
    const byId = new Map<number, EdgeInfo>();
    for (const info of edgeInfos) byId.set(info.edgeId, info);
    return byId;
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
      const additive = event.shiftKey;
      pickSelection(
        { kind: 'edge', info, screenPos: { x: event.clientX, y: event.clientY } },
        additive
      );
      const snippet = buildEdgeFinderSnippet(info);
      void copyToClipboard(snippet).then((copied) =>
        addToast(copied ? 'Edge finder copied' : 'Edge selected (clipboard unavailable)')
      );
    },
    [edgeGroups, edgeInfoById, pickSelection, addToast]
  );

  const handlePointerOver = useCallback(() => {
    document.body.style.cursor = 'pointer';
  }, []);
  const handlePointerOut = useCallback(() => {
    document.body.style.cursor = '';
    setHoverEntity(null);
  }, [setHoverEntity]);

  // pointermove updates hoverEntity each frame so the tooltip tracks the
  // cursor across the same edge. Cost is one shallow store merge per move
  // and re-renders only the tooltip via zustand selectors. Stop propagation
  // so the underlying face mesh's onPointerMove doesn't fire after this and
  // overwrite the hoverEntity with a face — R3F dispatches to every
  // intersected object in the same frame, so without this the edge would
  // never win.
  const handlePointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (!edgeGroups || !edgeInfoById) return;
      const vertexIndex = event.index;
      if (vertexIndex === undefined) return;
      const group = findGroupAt(edgeGroups, vertexIndex);
      if (!group) return;
      const info = edgeInfoById.get(group.edgeId);
      if (!info) return;
      event.stopPropagation();
      setHoverEntity({
        kind: 'edge',
        info,
        screenPos: { x: event.clientX, y: event.clientY },
      });
    },
    [edgeGroups, edgeInfoById, setHoverEntity]
  );

  // R3F doesn't synthesize `pointerout` for an object that gets unmounted
  // mid-hover (e.g. a new eval drops the previous mesh). Without this
  // cleanup the body cursor stays `pointer` for the rest of the session
  // and the hover tooltip would linger pointing at a destroyed mesh.
  useEffect(() => {
    return () => {
      document.body.style.cursor = '';
      setHoverEntity(null);
    };
  }, [setHoverEntity]);

  return (
    <lineSegments
      geometry={geometry}
      renderOrder={1}
      onClick={pickable ? handleClick : undefined}
      onPointerOver={pickable ? handlePointerOver : undefined}
      onPointerOut={pickable ? handlePointerOut : undefined}
      onPointerMove={pickable ? handlePointerMove : undefined}
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
  const lineParams = raycaster.params.Line;
  if (!lineParams) {
    THREE.LineSegments.prototype.raycast.call(this, raycaster, intersects);
    return;
  }
  const previousThreshold = lineParams.threshold;
  lineParams.threshold = PICK_THRESHOLD_WORLD;
  THREE.LineSegments.prototype.raycast.call(this, raycaster, intersects);
  lineParams.threshold = previousThreshold;
}
