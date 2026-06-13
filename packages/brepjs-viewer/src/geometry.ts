import * as THREE from 'three';
import type { MeshData, FaceGroup } from './types.js';

export function buildGeometry(data: MeshData): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3));
  geo.setIndex(new THREE.BufferAttribute(data.index, 1));
  return geo;
}

export interface MeshBounds {
  min: [number, number, number];
  max: [number, number, number];
}

// Axis-aligned bounding box of the mesh in its own coordinates. Mesh-derived, so it's
// within tessellation tolerance of the kernel's exact bbox — fine for a viewer readout
// or a clip-plane range, not a substitute for the verify report.
export function meshBounds(data: MeshData): MeshBounds {
  const p = data.position;
  if (p.length < 3) return { min: [0, 0, 0], max: [0, 0, 0] };
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
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

// Bounding-box extents (width, depth, height).
export function meshSize(data: MeshData): [number, number, number] {
  const { min, max } = meshBounds(data);
  return [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
}

export type SectionAxis = 'x' | 'y' | 'z';

// A clipping plane normal to `axis` at world `position`. three.js clips points where
// plane.distanceToPoint < 0, so the kept half is `axis·point >= position`; `flip`
// keeps the other half. Coordinates are model-space (the viewer applies no rotation).
export function sectionPlane(axis: SectionAxis, position: number, flip = false): THREE.Plane {
  const normal = new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0);
  if (flip) normal.negate();
  const point = new THREE.Vector3(
    axis === 'x' ? position : 0,
    axis === 'y' ? position : 0,
    axis === 'z' ? position : 0,
  );
  return new THREE.Plane(normal, -normal.dot(point));
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
