import * as THREE from 'three';
import type { MeshData, FaceGroup } from './types.js';

export function buildGeometry(data: MeshData): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3));
  geo.setIndex(new THREE.BufferAttribute(data.index, 1));
  return geo;
}

export function findFaceGroupAt(groups: FaceGroup[], triangleIndex: number): FaceGroup | null {
  const off = triangleIndex * 3;
  let lo = 0;
  let hi = groups.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const g = groups[mid];
    if (!g) break;
    if (off < g.start) hi = mid - 1;
    else if (off >= g.start + g.count) lo = mid + 1;
    else return g;
  }
  return null;
}
