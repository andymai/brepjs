import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls, Bounds } from '@react-three/drei';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Suspense, useEffect, useMemo } from 'react';
import { Mesh, MeshStandardMaterial } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Brepjs blue-grey palette, consistent with the playground renderer
const SHAPE_COLOR = '#7eb8d4';

function Model({ uri }: { uri: string }) {
  const gltf = useLoader(GLTFLoader, uri) as GLTF;
  const material = useMemo(
    () => new MeshStandardMaterial({ color: SHAPE_COLOR, metalness: 0.05, roughness: 0.65 }),
    [],
  );

  // Release the GPU resource when the component unmounts (triggered by key={glbUri} on Suspense)
  useEffect(() => () => { material.dispose(); }, [material]);

  useEffect(() => {
    gltf.scene.traverse((child) => {
      if (child instanceof Mesh) child.material = material;
    });
  }, [gltf, material]);

  return <primitive object={gltf.scene} />;
}

export function Viewer({ glbUri }: { glbUri: string }) {
  return (
    <Canvas
      camera={{ position: [60, 60, 60], fov: 45 }}
      style={{ width: '100%', height: '100%' }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 10, 5]} intensity={1.2} />
      <directionalLight position={[-4, -4, -4]} intensity={0.25} />
      {/*
       * Bounds auto-fits the camera to the model's bounding box when it first loads
       * and whenever the model changes (observe). makeDefault on OrbitControls links it
       * to the Bounds camera rig so fit/clip work together.
       */}
      <Bounds fit clip observe margin={1.2}>
        <Suspense key={glbUri} fallback={null}>
          <Model uri={glbUri} />
        </Suspense>
      </Bounds>
      <OrbitControls makeDefault />
    </Canvas>
  );
}
