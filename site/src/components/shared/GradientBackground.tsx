import { useEffect, useRef } from 'react';
import * as THREE from 'three';

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.9999, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 colorTop;
  uniform vec3 colorBottom;
  varying vec2 vUv;
  void main() {
    gl_FragColor = vec4(mix(colorBottom, colorTop, vUv.y), 1.0);
  }
`;

interface GradientBackgroundProps {
  colorTop?: string;
  colorBottom?: string;
}

export default function GradientBackground({
  colorTop = '#191920',
  colorBottom = '#0c0c10',
}: GradientBackgroundProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  useEffect(() => {
    return () => {
      matRef.current?.dispose();
    };
  }, []);

  return (
    <mesh renderOrder={-1} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={{
          colorTop: { value: new THREE.Color(colorTop) },
          colorBottom: { value: new THREE.Color(colorBottom) },
        }}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  );
}
