import { useCallback, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { MeshData } from '../../stores/playgroundStore';
import { usePlaygroundStore } from '../../stores/playgroundStore';
import { useViewerStore } from '../../stores/viewerStore';
import { buildFaceFinderSnippet } from '../../lib/finderSnippet';
import { useToastStore } from '../../stores/toastStore';

export default function ShapeRenderer({ data }: { data: MeshData }) {
  const showWireframe = useViewerStore((s) => s.showWireframe);
  const setSelection = usePlaygroundStore((s) => s.setSelection);
  const addToast = useToastStore((s) => s.addToast);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3));
    geo.setIndex(new THREE.BufferAttribute(data.index, 1));
    // Add per-face groups so raycaster intersections expose `materialIndex`,
    // which we map back to faceId via `data.faceGroups`.
    if (data.faceGroups) {
      for (let i = 0; i < data.faceGroups.length; i++) {
        const g = data.faceGroups[i]!;
        geo.addGroup(g.start, g.count, i);
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
    const m = new Map<number, (typeof data.faceInfos)[number]>();
    for (const info of data.faceInfos) m.set(info.faceId, info);
    return m;
  }, [data.faceInfos]);

  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      if (!data.faceGroups || !faceInfoById) return;
      const idx = event.face?.materialIndex;
      if (idx === undefined) return;
      const group = data.faceGroups[idx];
      if (!group) return;
      const info = faceInfoById.get(group.faceId);
      if (!info) return;
      event.stopPropagation();
      setSelection({ kind: 'face', info });
      const snippet = buildFaceFinderSnippet(info);
      void navigator.clipboard?.writeText(snippet).then(
        () => addToast('Face finder copied'),
        () => addToast('Face selected (copy failed)')
      );
    },
    [data.faceGroups, faceInfoById, setSelection, addToast]
  );

  return (
    <mesh geometry={geometry} onClick={handleClick}>
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
