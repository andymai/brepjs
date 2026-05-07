import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import type { EdgeGroup, EdgeInfo } from '../../workers/workerProtocol';
import { usePlaygroundStore } from '../../stores/playgroundStore';

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
  const openContextMenu = usePlaygroundStore((s) => s.openContextMenu);
  const pickable = Boolean(edgeGroups && edgeInfos);
  const viewportHeight = useThree((s) => s.size.height);
  const viewportHeightRef = useRef(viewportHeight);
  viewportHeightRef.current = viewportHeight;
  // See ShapeRenderer for the rationale — pointerOut nulls hover state only
  // when *we* are still the published target. Without this guard, an edge
  // moving out of intersection while the cursor is still on a face would
  // wipe the freshly-set face hover.
  const lastAdvertisedEdgeId = useRef<number | null>(null);

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
      pickSelection(
        { kind: 'edge', info, screenPos: { x: event.clientX, y: event.clientY } },
        event.shiftKey
      );
    },
    [resolveEdge, pickSelection]
  );

  const handleContextMenu = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      const info = resolveEdge(event);
      if (!info) return;
      event.stopPropagation();
      event.nativeEvent.preventDefault();
      openContextMenu(
        { kind: 'edge', info, screenPos: { x: event.clientX, y: event.clientY } },
        { x: event.clientX, y: event.clientY }
      );
    },
    [resolveEdge, openContextMenu]
  );

  const handlePointerOver = useCallback(() => {
    document.body.style.cursor = 'pointer';
  }, []);
  const handlePointerOut = useCallback(() => {
    document.body.style.cursor = '';
    const cur = usePlaygroundStore.getState().hoverEntity;
    if (cur?.kind === 'edge' && cur.info.edgeId === lastAdvertisedEdgeId.current) {
      setHoverEntity(null);
    }
    lastAdvertisedEdgeId.current = null;
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
      const info = resolveEdge(event);
      if (!info) return;
      event.stopPropagation();
      lastAdvertisedEdgeId.current = info.edgeId;
      setHoverEntity({
        kind: 'edge',
        info,
        screenPos: { x: event.clientX, y: event.clientY },
      });
    },
    [resolveEdge, setHoverEntity]
  );

  // R3F doesn't synthesize `pointerout` for an object that gets unmounted
  // mid-hover (e.g. a new eval drops the previous mesh). Without this
  // cleanup the body cursor stays `pointer` for the rest of the session
  // and the hover tooltip would linger pointing at a destroyed mesh.
  useEffect(() => {
    return () => {
      document.body.style.cursor = '';
      const cur = usePlaygroundStore.getState().hoverEntity;
      if (cur?.kind === 'edge' && cur.info.edgeId === lastAdvertisedEdgeId.current) {
        setHoverEntity(null);
      }
    };
  }, [setHoverEntity]);

  const raycastLines = useCallback(
    function (
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
    },
    []
  );

  return (
    <lineSegments
      geometry={geometry}
      renderOrder={1}
      onClick={pickable ? handleClick : undefined}
      onContextMenu={pickable ? handleContextMenu : undefined}
      onPointerOver={pickable ? handlePointerOver : undefined}
      onPointerOut={pickable ? handlePointerOut : undefined}
      onPointerMove={pickable ? handlePointerMove : undefined}
      raycast={raycastLines}
    >
      <lineBasicMaterial color="#000000" depthTest={true} linewidth={2} />
    </lineSegments>
  );
}

const PICK_THRESHOLD_PX = 6;
const FALLBACK_WORLD_THRESHOLD = 0.15;
const _center = new THREE.Vector3();

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
    _center.copy(sphere.center).applyMatrix4(lines.matrixWorld);
    const distance = persp.position.distanceTo(_center);
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
