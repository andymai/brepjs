import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { MeshData } from '../../stores/playgroundStore';
import { usePlaygroundStore } from '../../stores/playgroundStore';
import type { FaceInfo } from '../../workers/workerProtocol';
import { useViewerStore } from '../../stores/viewerStore';

export default function ShapeRenderer({ data }: { data: MeshData }) {
  const viewMode = useViewerStore((s) => s.viewMode);
  const pickSelection = usePlaygroundStore((s) => s.pickSelection);
  const setHoverEntity = usePlaygroundStore((s) => s.setHoverEntity);
  const openContextMenu = usePlaygroundStore((s) => s.openContextMenu);
  const pickable = Boolean(data.faceGroups && data.faceInfos);
  // Tracks the faceId we last advertised to the global hover store so
  // pointerOut only nulls hover when *we* are the current target. R3F can
  // fire a sibling's pointerMove before our pointerOut in the same tick;
  // unconditionally nulling here would clobber a freshly-set hover.
  const lastAdvertisedFaceId = useRef<number | null>(null);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3));
    geo.setIndex(new THREE.BufferAttribute(data.index, 1));
    // Add per-face groups so raycaster intersections expose `materialIndex`,
    // which we map back to faceId via `data.faceGroups`.
    if (data.faceGroups) {
      for (let i = 0; i < data.faceGroups.length; i++) {
        const group = data.faceGroups[i]!;
        geo.addGroup(group.start, group.count, i);
      }
    }
    return geo;
  }, [data.position, data.normal, data.index, data.faceGroups]);

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  const faceInfoById = useMemo(() => {
    if (!data.faceInfos) return null;
    const byId = new Map<number, FaceInfo>();
    for (const info of data.faceInfos) byId.set(info.faceId, info);
    return byId;
  }, [data.faceInfos]);

  const resolveFace = useCallback(
    (event: ThreeEvent<PointerEvent | MouseEvent>): FaceInfo | null => {
      if (!data.faceGroups || !faceInfoById) return null;
      const materialIndex = event.face?.materialIndex;
      if (materialIndex === undefined) return null;
      const group = data.faceGroups[materialIndex];
      if (!group) return null;
      return faceInfoById.get(group.faceId) ?? null;
    },
    [data.faceGroups, faceInfoById]
  );

  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      const info = resolveFace(event);
      if (!info) return;
      event.stopPropagation();
      pickSelection(
        { kind: 'face', info, screenPos: { x: event.clientX, y: event.clientY } },
        event.shiftKey
      );
    },
    [resolveFace, pickSelection]
  );

  const handleContextMenu = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      const info = resolveFace(event);
      if (!info) return;
      event.stopPropagation();
      event.nativeEvent.preventDefault();
      openContextMenu(
        { kind: 'face', info, screenPos: { x: event.clientX, y: event.clientY } },
        { x: event.clientX, y: event.clientY }
      );
    },
    [resolveFace, openContextMenu]
  );

  const handlePointerOver = useCallback(() => {
    document.body.style.cursor = 'pointer';
  }, []);
  const handlePointerOut = useCallback(() => {
    document.body.style.cursor = '';
    // Only null hover if WE are the current target. A sibling pointerMove
    // (e.g. an edge in the same canvas) may have already overwritten the
    // store with its own entity in the same tick — clobbering it here
    // produced the "+Z tops only" symptom by nulling face hovers seconds
    // after they were set.
    const cur = usePlaygroundStore.getState().hoverEntity;
    if (cur?.kind === 'face' && cur.info.faceId === lastAdvertisedFaceId.current) {
      setHoverEntity(null);
    }
    lastAdvertisedFaceId.current = null;
  }, [setHoverEntity]);

  // pointermove fires per-frame while hovering. We update on every tick so
  // the tooltip follows the cursor — cost is one shallow store merge per
  // move and re-renders only the tooltip via zustand selectors.
  const handlePointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const info = resolveFace(event);
      if (!info) return;
      lastAdvertisedFaceId.current = info.faceId;
      setHoverEntity({
        kind: 'face',
        info,
        screenPos: { x: event.clientX, y: event.clientY },
      });
    },
    [resolveFace, setHoverEntity]
  );

  // R3F doesn't synthesize `pointerout` for an object that gets unmounted
  // mid-hover (e.g. a new eval drops the previous mesh). Without this
  // cleanup the body cursor stays `pointer` for the rest of the session
  // and the hover tooltip would linger pointing at a destroyed mesh.
  useEffect(() => {
    return () => {
      document.body.style.cursor = '';
      const cur = usePlaygroundStore.getState().hoverEntity;
      if (cur?.kind === 'face' && cur.info.faceId === lastAdvertisedFaceId.current) {
        setHoverEntity(null);
      }
    };
  }, [setHoverEntity]);

  return (
    <mesh
      geometry={geometry}
      onClick={pickable ? handleClick : undefined}
      onContextMenu={pickable ? handleContextMenu : undefined}
      onPointerOver={pickable ? handlePointerOver : undefined}
      onPointerOut={pickable ? handlePointerOut : undefined}
      onPointerMove={pickable ? handlePointerMove : undefined}
    >
      <meshStandardMaterial
        color="#d4d8dc"
        metalness={0}
        roughness={0.45}
        emissive="#d4d8dc"
        emissiveIntensity={0.08}
        side={THREE.DoubleSide}
        polygonOffset
        polygonOffsetFactor={1}
        polygonOffsetUnits={1}
        wireframe={viewMode === 'wireframe'}
        transparent={viewMode === 'xray'}
        opacity={viewMode === 'xray' ? 0.35 : 1}
        depthWrite={viewMode !== 'xray'}
      />
    </mesh>
  );
}
