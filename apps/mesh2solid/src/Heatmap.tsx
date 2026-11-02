import { useEffect, useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { Heatmap as HeatmapData } from './protocol.js';

/**
 * Sequential blue ramp, from zero deviation to the scale's top. On the viewer's
 * dark background the low end stays dark but distinct from it, and larger
 * distances read lighter.
 */
export const RAMP = [
  '#184f95',
  '#1c5cab',
  '#256abf',
  '#2a78d6',
  '#3987e5',
  '#5598e7',
  '#6da7ec',
  '#86b6ef',
  '#9ec5f4',
  '#b7d3f6',
  '#cde2fb',
] as const;

const STOPS = RAMP.map((hex) => new THREE.Color(hex));

function rampColor(t: number, out: THREE.Color): THREE.Color {
  const x = Math.min(Math.max(t, 0), 1) * (STOPS.length - 1);
  const i = Math.min(Math.floor(x), STOPS.length - 2);
  const a = STOPS[i];
  const b = STOPS[i + 1];
  if (a === undefined || b === undefined) return out;
  return out.copy(a).lerp(b, x - i);
}

/** The top of the color scale: the largest distance, rounded up to 1, 2, or 5 times a power of ten. */
export function scaleFor(max: number): number {
  const top = Math.max(max, 0.01);
  const p = 10 ** Math.floor(Math.log10(top));
  for (const m of [1, 2, 5, 10]) if (top <= m * p) return m * p;
  return 10 * p;
}

interface Props {
  readonly data: HeatmapData;
  readonly scale: number;
  readonly onHover: (deviation: number | null) => void;
}

/** The input mesh colored by each vertex's distance to the rebuilt part, unlit so color is the value. */
export function Heatmap({ data, scale, onHover }: Props) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
    g.setIndex(new THREE.BufferAttribute(data.index, 1));
    const colors = new Float32Array(data.position.length);
    const c = new THREE.Color();
    for (let v = 0; v < data.deviation.length; v++) {
      rampColor((data.deviation[v] ?? 0) / scale, c);
      colors[3 * v] = c.r;
      colors[3 * v + 1] = c.g;
      colors[3 * v + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  }, [data, scale]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const hover = (e: ThreeEvent<PointerEvent>) => {
    const face = e.face;
    if (!face) return;
    // The face corner nearest the pointer.
    let best = face.a;
    let bestD = Infinity;
    for (const v of [face.a, face.b, face.c]) {
      const d = e.point.distanceToSquared(
        new THREE.Vector3(data.position[3 * v], data.position[3 * v + 1], data.position[3 * v + 2])
      );
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    onHover(data.deviation[best] ?? null);
  };

  return (
    <mesh geometry={geometry} onPointerMove={hover} onPointerOut={() => onHover(null)}>
      <meshBasicMaterial vertexColors side={THREE.DoubleSide} />
    </mesh>
  );
}
