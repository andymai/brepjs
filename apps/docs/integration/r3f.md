---
title: React Three Fiber
description: 'Render brepjs solids declaratively in React Three Fiber. The <BrepShape> pattern, memoization, selection, and live-edit workflows.'
---

# React Three Fiber

[React Three Fiber](https://docs.pmnd.rs/react-three-fiber/) (R3F) renders Three.js declaratively as React components. brepjs slots in cleanly: build a brepjs shape, memo the mesh data, return a `<mesh>` with a `<bufferGeometry>` child. This chapter is the patterns layer on top of [Three.js Integration](./threejs).

## Minimal `<BrepShape>` component

<!-- @no-test -->

```typescript
import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { shape, toBufferGeometryData, type Shape3D } from 'brepjs/quick';

function BrepMesh({ part, tolerance = 0.1 }: { part: Shape3D; tolerance?: number }) {
  const data = useMemo(() => toBufferGeometryData(shape(part).mesh({ tolerance })), [part, tolerance]);

  return (
    <mesh>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={data.position} itemSize={3} count={data.position.length / 3} />
        <bufferAttribute attach="attributes-normal" array={data.normal} itemSize={3} count={data.normal.length / 3} />
        <bufferAttribute attach="index" array={data.index} itemSize={1} count={data.index.length} />
      </bufferGeometry>
      <meshStandardMaterial color="#c0c0c0" metalness={0.4} roughness={0.6} />
    </mesh>
  );
}
```

`useMemo` keyed on the shape and tolerance prevents re-meshing on every render. R3F handles disposal of `BufferGeometry` and `BufferAttribute` automatically when the component unmounts.

## App scaffold

<!-- @no-test -->

```typescript
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { box } from 'brepjs/quick';

declare function BrepMesh(props: { part: import('brepjs').Shape3D }): JSX.Element;

export function App() {
  const part = box(20, 20, 20);

  return (
    <Canvas camera={{ position: [60, 60, 60], fov: 50 }}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[50, 100, 50]} intensity={0.8} />
      <BrepMesh part={part} />
      <OrbitControls />
    </Canvas>
  );
}
```

## Async parts (built in a worker)

Real apps build parts in a worker to avoid blocking. The component receives mesh data, not a brepjs shape:

<!-- @no-test -->

```typescript
import { useEffect, useState } from 'react';

interface MeshData {
  position: Float32Array;
  normal: Float32Array;
  index: Uint32Array;
}

declare const buildInWorker: (params: object) => Promise<MeshData>;

function PartFromWorker({ params }: { params: object }) {
  const [data, setData] = useState<MeshData | null>(null);

  useEffect(() => {
    let cancelled = false;
    buildInWorker(params).then((m) => {
      if (!cancelled) setData(m);
    });
    return () => { cancelled = true; };
  }, [params]);

  if (!data) return null;

  return (
    <mesh>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={data.position} itemSize={3} count={data.position.length / 3} />
        <bufferAttribute attach="attributes-normal" array={data.normal} itemSize={3} count={data.normal.length / 3} />
        <bufferAttribute attach="index" array={data.index} itemSize={1} count={data.index.length} />
      </bufferGeometry>
      <meshStandardMaterial color="#c0c0c0" />
    </mesh>
  );
}
```

The brepjs handles never cross the React tree; only typed arrays do. This is what gridfinity-layout-tool's worker pipeline looks like.

## Picking and selection

To make faces or edges clickable, project Three.js raycasts back to brepjs entities. The trick: store a mapping from triangle index to face ID at mesh time:

<!-- @no-test -->

```typescript
import { useMemo, useState } from 'react';
import { shape, toBufferGeometryData, faceFinder, type Shape3D } from 'brepjs/quick';

interface Picked { faceId: number; }

function SelectableBrepMesh({ part }: { part: Shape3D }) {
  const [selected, setSelected] = useState<Picked | null>(null);
  const data = useMemo(() => {
    const m = shape(part).mesh({ tolerance: 0.1, includeFaceMap: true });
    return { ...toBufferGeometryData(m), faceMap: m.faceMap }; // map[triangleIndex] = faceId
  }, [part]);

  return (
    <mesh
      onClick={(e) => {
        e.stopPropagation();
        if (e.face && data.faceMap) {
          const triIdx = e.face.a / 3 | 0;
          setSelected({ faceId: data.faceMap[triIdx] ?? -1 });
        }
      }}
    >
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={data.position} itemSize={3} count={data.position.length / 3} />
        <bufferAttribute attach="attributes-normal" array={data.normal} itemSize={3} count={data.normal.length / 3} />
        <bufferAttribute attach="index" array={data.index} itemSize={1} count={data.index.length} />
      </bufferGeometry>
      <meshStandardMaterial color={selected ? '#3399ff' : '#c0c0c0'} />
    </mesh>
  );
}
```

`includeFaceMap: true` returns a per-triangle face index. R3F's pointer events give you the triangle that was hit; look it up in the map to find the brepjs face.

## Hover highlighting

A common pattern: highlight the face under the cursor.

<!-- @no-test -->

```typescript
import { useState } from 'react';

function HoverableMesh() {
  const [hovered, setHovered] = useState(false);
  return (
    <mesh onPointerOver={() => setHovered(true)} onPointerOut={() => setHovered(false)}>
      <boxGeometry />
      <meshStandardMaterial color={hovered ? '#ff9900' : '#c0c0c0'} />
    </mesh>
  );
}
```

For face-level highlighting (not whole-mesh), combine the technique above with a per-face colour buffer.

## Edge overlay component

<!-- @no-test -->

```typescript
import { useMemo } from 'react';
import * as THREE from 'three';
import { edgeFinder, meshEdges, type Shape3D } from 'brepjs/quick';

function BrepEdges({ part, tolerance = 0.05 }: { part: Shape3D; tolerance?: number }) {
  const data = useMemo(() => {
    const edges = edgeFinder().findAll(part);
    return meshEdges(edges, { tolerance });
  }, [part, tolerance]);

  return (
    <lineSegments>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={data.position} itemSize={3} count={data.position.length / 3} />
        <bufferAttribute attach="index" array={data.index} itemSize={1} count={data.index.length} />
      </bufferGeometry>
      <lineBasicMaterial color="#111111" />
    </lineSegments>
  );
}
```

Render the edges alongside the filled mesh; combined they look like proper engineering drawings.

## drei helpers worth knowing

- `<OrbitControls>`: drag to rotate, pinch to zoom, the right behaviour for CAD UIs
- `<Bounds>`: fit-camera-to-content; essential for "I just loaded a STEP, frame it"
- `<Environment preset="studio" />`: instant-good HDRi reflections
- `<ContactShadows>`: soft ground shadow that makes parts feel "placed"
- `<GizmoHelper>`: small axis triad for orientation

## Instancing repeated parts

For an assembly of the _same_ part repeated many times, N `<mesh>` nodes is N tessellations and N draw calls. Mesh once and draw many with an `<instancedMesh>`: brepjs `instancedMesh()` gives the single geometry plus one matrix per placement, which you set on the instanced mesh's ref.

<!-- @no-test -->

```typescript
import { useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { instanceGrid, instancedMesh, toBufferGeometryData, type Shape3D } from 'brepjs/quick';

// brepjs row-major 4x4 -> THREE.Matrix4 (THREE.Matrix4.set is row-major).
const toM4 = ([r0, r1, r2, r3]: readonly number[][]) =>
  new THREE.Matrix4().set(r0[0], r0[1], r0[2], r0[3], r1[0], r1[1], r1[2], r1[3], r2[0], r2[1], r2[2], r2[3], r3[0], r3[1], r3[2], r3[3]);

function InstancedGrid({ cell }: { cell: Shape3D }) {
  const ref = useRef<THREE.InstancedMesh>(null);

  const { geo, instances } = useMemo(() => {
    const payload = instancedMesh(instanceGrid(cell, { cols: 6, rows: 4, pitchX: 42, pitchY: 42 }), {
      tolerance: 0.1,
    });
    const d = toBufferGeometryData(payload.geometry);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(d.position, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(d.normal, 3));
    geo.setIndex(new THREE.BufferAttribute(d.index, 1));
    return { geo, instances: payload.instances };
  }, [cell]);

  // The BufferGeometry is created imperatively, so React won't free it — dispose
  // its GPU buffers when `cell` changes or the component unmounts.
  useEffect(() => () => geo.dispose(), [geo]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    instances.forEach((rows, i) => mesh.setMatrixAt(i, toM4(rows)));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [instances]);

  return (
    <instancedMesh ref={ref} args={[geo, undefined, instances.length]}>
      <meshStandardMaterial color="#c0c0c0" />
    </instancedMesh>
  );
}
```

One geometry, one draw call, N matrices — far cheaper than N `<mesh>` nodes for a large assembly of identical parts. This is the answer to "virtualization for assemblies of many parts" below when the parts are repeats rather than unique.

## Performance

- **Memoize meshing**: `useMemo` keyed on the shape, the tolerance, and any pose params.
- **Avoid React state for camera position**: use Three.js controls or refs; React state changes re-render the tree.
- **Lazy-mount heavy parts**: render only what's visible; Suspense or virtualization for assemblies of many parts.
- **Throttle interactive sliders**: debounce parameter changes that re-mesh.

## Next steps

- [Three.js](./threejs): the underlying Three.js patterns
- [Vite, Next.js, Astro](./frameworks): getting R3F + brepjs working in your bundler
- [Web Workers](../advanced/workers): moving heavy meshing off the render thread
