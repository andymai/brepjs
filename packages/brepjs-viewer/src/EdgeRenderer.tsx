import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import type { EdgeGroup, EdgeInfo, ScreenPos } from './types.js';

export interface EdgeRendererProps {
  edges: Float32Array;
  edgeGroups?: EdgeGroup[];
  edgeInfos?: EdgeInfo[];
  clippingPlanes?: THREE.Plane[];
  onEdgePick?: (info: EdgeInfo, additive: boolean, pos: ScreenPos) => void;
  onEdgeHover?: (info: EdgeInfo | null, pos?: ScreenPos) => void;
  onEdgeContextMenu?: (info: EdgeInfo, pos: ScreenPos) => void;
}

// Edge groups are sorted by start offset, so binary search the (start, count)
// ranges to find the group containing a given vertex index.
function findGroupAt(groups: EdgeGroup[], vertexIndex: number): EdgeGroup | null {
  let lo = 0;
  let hi = groups.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const group = groups[mid];
    if (!group) break;
    if (vertexIndex < group.start) hi = mid - 1;
    else if (vertexIndex >= group.start + group.count) lo = mid + 1;
    else return group;
  }
  return null;
}

export default function EdgeRenderer({
  edges,
  edgeGroups,
  edgeInfos,
  clippingPlanes,
  onEdgePick,
  onEdgeHover,
  onEdgeContextMenu,
}: EdgeRendererProps) {
  const pickable = Boolean(edgeGroups && edgeInfos && (onEdgePick || onEdgeHover || onEdgeContextMenu));
  const viewportHeight = useThree((s) => s.size.height);
  const viewportHeightRef = useRef(viewportHeight);
  viewportHeightRef.current = viewportHeight;
  const lastEdgeId = useRef<number | null>(null);

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

  const resolveEdge = useCallback(
    (event: ThreeEvent<PointerEvent | MouseEvent>): EdgeInfo | null => {
      if (!edgeGroups || !edgeInfoById) return null;
      const vertexIndex = event.index;
      if (vertexIndex === undefined) return null;
      const group = findGroupAt(edgeGroups, vertexIndex);
      if (!group) return null;
      return edgeInfoById.get(group.edgeId) ?? null;
    },
    [edgeGroups, edgeInfoById]
  );

  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      const info = resolveEdge(event);
      if (!info) return;
      event.stopPropagation();
      onEdgePick?.(info, event.shiftKey, { x: event.clientX, y: event.clientY });
    },
    [resolveEdge, onEdgePick]
  );

  const handleContextMenu = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      const info = resolveEdge(event);
      if (!info) return;
      event.stopPropagation();
      event.nativeEvent.preventDefault();
      onEdgeContextMenu?.(info, { x: event.clientX, y: event.clientY });
    },
    [resolveEdge, onEdgeContextMenu]
  );

  const handlePointerOver = useCallback(() => {
    document.body.style.cursor = 'pointer';
  }, []);
  const handlePointerOut = useCallback(() => {
    document.body.style.cursor = '';
    onEdgeHover?.(null);
    lastEdgeId.current = null;
  }, [onEdgeHover]);

  // pointermove updates hover each frame so the tooltip tracks the cursor
  // across the same edge. Stop propagation so the underlying face mesh's
  // onPointerMove doesn't fire after this and overwrite the hover with a
  // face — R3F dispatches to every intersected object in the same frame, so
  // without this the edge would never win.
  const handlePointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const info = resolveEdge(event);
      if (!info) return;
      event.stopPropagation();
      lastEdgeId.current = info.edgeId;
      onEdgeHover?.(info, { x: event.clientX, y: event.clientY });
    },
    [resolveEdge, onEdgeHover]
  );

  // R3F doesn't synthesize `pointerout` for an object that gets unmounted
  // mid-hover (e.g. a new eval drops the previous mesh). Without this
  // cleanup the body cursor stays `pointer` for the rest of the session.
  useEffect(() => {
    return () => {
      document.body.style.cursor = '';
      onEdgeHover?.(null);
    };
  }, [onEdgeHover]);

  const raycastLines = useCallback(function (
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
    lineParams.threshold = computeWorldThreshold(this, raycaster, viewportHeightRef.current);
    THREE.LineSegments.prototype.raycast.call(this, raycaster, intersects);
    lineParams.threshold = previousThreshold;
  }, []);

  const handlers = pickable
    ? {
        onClick: handleClick,
        onContextMenu: handleContextMenu,
        onPointerOver: handlePointerOver,
        onPointerOut: handlePointerOut,
        onPointerMove: handlePointerMove,
      }
    : {};
  return (
    <lineSegments geometry={geometry} renderOrder={1} raycast={raycastLines} {...handlers}>
      <lineBasicMaterial
        color="#000000"
        depthTest={true}
        linewidth={2}
        clippingPlanes={clippingPlanes ?? null}
      />
    </lineSegments>
  );
}

const PICK_THRESHOLD_PX = 6;
const FALLBACK_WORLD_THRESHOLD = 0.15;

function computeWorldThreshold(
  lines: THREE.LineSegments,
  raycaster: THREE.Raycaster,
  viewportHeight: number
): number {
  const camera = raycaster.camera as THREE.Camera | null;
  if (!camera || viewportHeight <= 0) return FALLBACK_WORLD_THRESHOLD;
  if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
    const persp = camera as THREE.PerspectiveCamera;
    if (!lines.geometry.boundingSphere) lines.geometry.computeBoundingSphere();
    const sphere = lines.geometry.boundingSphere;
    if (!sphere) return FALLBACK_WORLD_THRESHOLD;
    const center = new THREE.Vector3().copy(sphere.center).applyMatrix4(lines.matrixWorld);
    const distance = persp.position.distanceTo(center);
    const fovRad = (persp.fov * Math.PI) / 180;
    const worldPerPixel = (2 * distance * Math.tan(fovRad / 2)) / viewportHeight;
    return worldPerPixel * PICK_THRESHOLD_PX;
  }
  if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
    const ortho = camera as THREE.OrthographicCamera;
    const worldPerPixel = (ortho.top - ortho.bottom) / ortho.zoom / viewportHeight;
    return worldPerPixel * PICK_THRESHOLD_PX;
  }
  return FALLBACK_WORLD_THRESHOLD;
}
