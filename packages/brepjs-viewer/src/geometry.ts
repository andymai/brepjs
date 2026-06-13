import * as THREE from 'three';
import type { MeshData, FaceGroup } from './types.js';

export function buildGeometry(data: MeshData): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3));
  geo.setIndex(new THREE.BufferAttribute(data.index, 1));
  return geo;
}

// Axis-aligned bounding-box extents (width, depth, height) of the mesh in its own
// coordinates. Mesh-derived, so it's within tessellation tolerance of the kernel's
// exact bbox — fine for a viewer readout, not a substitute for the verify report.
export function meshSize(data: MeshData): [number, number, number] {
  const p = data.position;
  if (p.length < 3) return [0, 0, 0];
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (let i = 0; i + 2 < p.length; i += 3) {
    const x = p[i] as number;
    const y = p[i + 1] as number;
    const z = p[i + 2] as number;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return [maxX - minX, maxY - minY, maxZ - minZ];
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
