import { ContactShadows, Grid, OrbitControls } from '@react-three/drei';
import type { Vector3Tuple } from 'three';

interface SceneSetupProps {
  autoRotate?: boolean;
  target?: Vector3Tuple;
  gridVisible?: boolean;
}

export default function SceneSetup({ autoRotate = false, target, gridVisible = true }: SceneSetupProps) {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 20, 15]} intensity={0.6} />
      <directionalLight position={[-10, -5, -10]} intensity={0.3} />
      <ContactShadows
        position={[0, -0.02, 0]}
        opacity={0.35}
        scale={80}
        blur={2.5}
        far={20}
        resolution={512}
      />
      <OrbitControls
        makeDefault
        autoRotate={autoRotate}
        autoRotateSpeed={1.5}
        target={target}
      />
      {gridVisible && (
        <Grid
          args={[100, 100]}
          position={[0, -0.01, 0]}
          cellSize={5}
          cellThickness={0.5}
          cellColor="#18182a"
          sectionSize={25}
          sectionThickness={1}
          sectionColor="#252545"
          fadeDistance={80}
          fadeStrength={1}
          infiniteGrid
        />
      )}
    </>
  );
}
