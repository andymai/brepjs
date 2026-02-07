import { useEffect, useRef } from 'react';
import * as THREE from 'three';

const vertexShader = /* glsl */ `
  varying vec2 vWorldPos;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float cellSize;
  uniform vec3 lineColor;
  uniform float lineOpacity;
  uniform float fadeStart;
  uniform float fadeEnd;

  varying vec2 vWorldPos;

  void main() {
    vec2 coord = vWorldPos / cellSize;
    vec2 grid = abs(fract(coord - 0.5) - 0.5);
    vec2 line = fwidth(coord);
    vec2 gridAA = smoothstep(line * 0.5, line * 1.5, grid);
    float gridLine = 1.0 - min(gridAA.x, gridAA.y);

    float dist = length(vWorldPos);
    float fade = 1.0 - smoothstep(fadeStart, fadeEnd, dist);

    float alpha = gridLine * lineOpacity * fade;
    if (alpha < 0.001) discard;

    gl_FragColor = vec4(lineColor, alpha);
  }
`;

interface InfiniteGridProps {
  cellSize?: number;
  lineColor?: string;
  lineOpacity?: number;
  fadeStart?: number;
  fadeEnd?: number;
}

export default function InfiniteGrid({
  cellSize = 10,
  lineColor = '#888898',
  lineOpacity = 0.1,
  fadeStart = 50,
  fadeEnd = 200,
}: InfiniteGridProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const planeSize = fadeEnd * 2.5;

  useEffect(() => {
    return () => {
      matRef.current?.dispose();
    };
  }, []);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
      <planeGeometry args={[planeSize, planeSize]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={{
          cellSize: { value: cellSize },
          lineColor: { value: new THREE.Color(lineColor) },
          lineOpacity: { value: lineOpacity },
          fadeStart: { value: fadeStart },
          fadeEnd: { value: fadeEnd },
        }}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
