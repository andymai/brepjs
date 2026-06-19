import { useCallback, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { buildGeometry, findFaceGroupAt } from './geometry.js';
import { useTouchLongPress } from './longPress.js';
import type { MeshData, FaceInfo, ViewMode, ScreenPos } from './types.js';

export interface RendererProps {
  data: MeshData;
  viewMode?: ViewMode;
  clippingPlanes?: THREE.Plane[];
  onFacePick?: (info: FaceInfo, additive: boolean, pos: ScreenPos) => void;
  onFaceHover?: (info: FaceInfo | null, pos?: ScreenPos) => void;
  onFaceContextMenu?: (info: FaceInfo, pos: ScreenPos) => void;
}

export function Renderer({
  data,
  viewMode = 'solid',
  clippingPlanes,
  onFacePick,
  onFaceHover,
  onFaceContextMenu,
}: RendererProps) {
  const pickable = Boolean(
    data.faceGroups && data.faceInfos && (onFacePick || onFaceHover || onFaceContextMenu)
  );
  const geometry = useMemo(() => buildGeometry(data), [data.position, data.normal, data.index]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  // R3F doesn't synthesize pointerOut for a mesh unmounted mid-hover (e.g. a new model replaces
  // this one), so reset the body cursor on unmount or it stays `pointer` for the session.
  useEffect(
    () => () => {
      document.body.style.cursor = '';
    },
    []
  );

  const faceInfoById = useMemo(() => {
    if (!data.faceInfos) return null;
    const m = new Map<number, FaceInfo>();
    for (const i of data.faceInfos) m.set(i.faceId, i);
    return m;
  }, [data.faceInfos]);

  const resolveFace = useCallback(
    (e: ThreeEvent<PointerEvent | MouseEvent>): FaceInfo | null => {
      if (!data.faceGroups || !faceInfoById) return null;
      const t = e.faceIndex;
      if (t === undefined || t === null) return null;
      const g = findFaceGroupAt(data.faceGroups, t);
      return g ? (faceInfoById.get(g.faceId) ?? null) : null;
    },
    [data.faceGroups, faceInfoById]
  );

  const longPress = useTouchLongPress(resolveFace, onFaceContextMenu);

  const onClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      // Swallow the tap the browser synthesizes when a touch long-press just
      // opened the context menu, so it doesn't also select the entity.
      if (longPress.consumeFired()) return;
      const info = resolveFace(e);
      if (!info) return;
      e.stopPropagation();
      onFacePick?.(info, e.shiftKey, { x: e.clientX, y: e.clientY });
    },
    [resolveFace, onFacePick, longPress]
  );
  const onCtx = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      const info = resolveFace(e);
      if (!info) return;
      e.stopPropagation();
      e.nativeEvent.preventDefault();
      onFaceContextMenu?.(info, { x: e.clientX, y: e.clientY });
    },
    [resolveFace, onFaceContextMenu]
  );
  const onMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      longPress.trackMove(e);
      const info = resolveFace(e);
      if (!info) return;
      onFaceHover?.(info, { x: e.clientX, y: e.clientY });
    },
    [resolveFace, onFaceHover, longPress]
  );
  const onOver = useCallback(() => {
    document.body.style.cursor = 'pointer';
  }, []);
  const onOut = useCallback(() => {
    document.body.style.cursor = '';
    longPress.cancel();
    onFaceHover?.(null);
  }, [onFaceHover, longPress]);

  const handlers = pickable
    ? {
        onClick,
        onContextMenu: onCtx,
        onPointerDown: longPress.start,
        onPointerUp: longPress.cancel,
        onPointerCancel: longPress.cancel,
        onPointerOver: onOver,
        onPointerOut: onOut,
        onPointerMove: onMove,
      }
    : {};

  return (
    <mesh geometry={geometry} {...handlers}>
      <meshStandardMaterial
        color={data.color ?? '#d4d8dc'}
        metalness={0}
        roughness={0.45}
        emissive={data.color ?? '#d4d8dc'}
        emissiveIntensity={0.08}
        side={viewMode === 'solid' ? THREE.FrontSide : THREE.DoubleSide}
        polygonOffset
        polygonOffsetFactor={1}
        polygonOffsetUnits={1}
        wireframe={viewMode === 'wireframe'}
        transparent={viewMode === 'xray'}
        opacity={viewMode === 'xray' ? 0.35 : 1}
        depthWrite={viewMode !== 'xray'}
        clippingPlanes={clippingPlanes ?? null}
      />
    </mesh>
  );
}
