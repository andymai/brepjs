import { OrbitControls } from '@react-three/drei';
import type { RefObject } from 'react';
import type { Vector3Tuple } from 'three';
import GradientBackground from './GradientBackground.js';
import InfiniteGrid from './InfiniteGrid.js';
import SceneLighting from './SceneLighting.js';

export interface ControlsProps {
  enableDamping?: boolean;
  dampingFactor?: number;
  rotateSpeed?: number;
  zoomSpeed?: number;
  enablePan?: boolean;
  minDistance?: number;
  maxDistance?: number;
  minPolarAngle?: number;
  maxPolarAngle?: number;
}

interface GridProps {
  cellSize?: number;
  lineColor?: string;
  lineOpacity?: number;
  fadeStart?: number;
  fadeEnd?: number;
}

interface SceneSetupProps {
  autoRotate?: boolean;
  target?: Vector3Tuple;
  gridVisible?: boolean;
  gridProps?: GridProps;
  controlsProps?: ControlsProps;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- drei OrbitControls ref type
  controlsRef?: RefObject<any>;
  onControlsStart?: () => void;
}

export default function SceneSetup({
  autoRotate = false,
  target,
  gridVisible = true,
  gridProps,
  controlsProps,
  controlsRef,
  onControlsStart,
}: SceneSetupProps) {
  const optionalControls = {
    ...(controlsRef ? { ref: controlsRef } : {}),
    ...(target ? { target } : {}),
    ...(onControlsStart ? { onStart: onControlsStart } : {}),
  };
  return (
    <>
      <SceneLighting />
      <GradientBackground />
      <OrbitControls
        makeDefault
        autoRotate={autoRotate}
        autoRotateSpeed={1.5}
        {...optionalControls}
        {...controlsProps}
      />
      {gridVisible && <InfiniteGrid {...gridProps} />}
    </>
  );
}
