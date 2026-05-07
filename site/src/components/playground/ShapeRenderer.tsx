import { useCallback, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { MeshData } from '../../stores/playgroundStore';
import { usePlaygroundStore } from '../../stores/playgroundStore';
import type { FaceInfo } from '../../workers/workerProtocol';
import { useViewerStore } from '../../stores/viewerStore';
import { buildFaceFinderSnippet } from '../../lib/finderSnippet';
import { copyToClipboard } from '../../lib/copyToClipboard';
import { useToastStore } from '../../stores/toastStore';

export default function ShapeRenderer({ data }: { data: MeshData }) {
  const showWireframe = useViewerStore((s) => s.showWireframe);
  const setSelection = usePlaygroundStore((s) => s.setSelection);
  const addToast = useToastStore((s) => s.addToast);
  const pickable = Boolean(data.faceGroups && data.faceInfos);

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

  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      if (!data.faceGroups || !faceInfoById) return;
      const materialIndex = event.face?.materialIndex;
      if (materialIndex === undefined) return;
      const group = data.faceGroups[materialIndex];
      if (!group) return;
      const info = faceInfoById.get(group.faceId);
      if (!info) return;
      event.stopPropagation();
      setSelection({ kind: 'face', info });
      const snippet = buildFaceFinderSnippet(info);
      void copyToClipboard(snippet).then((copied) =>
        addToast(copied ? 'Face finder copied' : 'Face selected (clipboard unavailable)')
      );
    },
    [data.faceGroups, faceInfoById, setSelection, addToast]
  );

  const handlePointerOver = useCallback(() => {
    document.body.style.cursor = 'pointer';
  }, []);
  const handlePointerOut = useCallback(() => {
    document.body.style.cursor = '';
  }, []);

  // R3F doesn't synthesize `pointerout` for an object that gets unmounted
  // mid-hover (e.g. a new eval drops the previous mesh). Without this
  // cleanup the body cursor stays `pointer` for the rest of the session.
  useEffect(() => {
    return () => {
      document.body.style.cursor = '';
    };
  }, []);

  return (
    <mesh
      geometry={geometry}
      onClick={pickable ? handleClick : undefined}
      onPointerOver={pickable ? handlePointerOver : undefined}
      onPointerOut={pickable ? handlePointerOut : undefined}
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
        wireframe={showWireframe}
      />
    </mesh>
  );
}
