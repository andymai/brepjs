import * as THREE from 'three';
import type { MeshData, FaceGroup, ViewMode } from './types.js';

export function buildGeometry(data: MeshData): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3));
  geo.setIndex(new THREE.BufferAttribute(data.index, 1));
  return geo;
}

/** A per-instance transform: a THREE.Matrix4 or a brepjs row-major 4x4. */
export type InstancePlacement = THREE.Matrix4 | ReadonlyArray<ReadonlyArray<number>>;

/**
 * Convert a brepjs row-major 4x4 (`[[row0],[row1],[row2],[row3]]`, as returned
 * by brepjs `instancedMesh().instances`) to a THREE.Matrix4. THREE.Matrix4.set
 * is row-major, so the rows map directly.
 */
export function instanceMatrix(m: ReadonlyArray<ReadonlyArray<number>>): THREE.Matrix4 {
  const r0 = m[0] as readonly number[];
  const r1 = m[1] as readonly number[];
  const r2 = m[2] as readonly number[];
  const r3 = m[3] as readonly number[];
  // prettier-ignore
  return new THREE.Matrix4().set(
    r0[0] as number, r0[1] as number, r0[2] as number, r0[3] as number,
    r1[0] as number, r1[1] as number, r1[2] as number, r1[3] as number,
    r2[0] as number, r2[1] as number, r2[2] as number, r2[3] as number,
    r3[0] as number, r3[1] as number, r3[2] as number, r3[3] as number,
  );
}

export interface InstancedMeshOptions {
  /** Material color (defaults to data.color, then the viewer's neutral grey). */
  color?: string;
  /** Render mode, mirroring Renderer: 'solid' (default) | 'wireframe' | 'xray'. */
  viewMode?: ViewMode;
  /** Section clipping planes, as built by `sectionPlane`. */
  clippingPlanes?: THREE.Plane[] | null;
}

/**
 * Build a THREE.InstancedMesh from one source mesh (meshed once) plus N
 * per-instance transforms — the "one tessellation, N placements" render of a
 * brepjs `instancedMesh()` payload, so a 10x10 grid is a single GPU draw.
 *
 * `data` is the source as viewer MeshData — convert a brepjs `ShapeMesh`
 * (vertices/normals/triangles) the same way you already do for `Renderer`.
 * `placements` is `instancedMesh().instances` (THREE.Matrix4 or brepjs row-major
 * 4x4). The material mirrors `Renderer` (color/modes/clipping).
 *
 * The caller owns the returned mesh: dispose its geometry + material on unmount.
 */
export function buildInstancedMesh(
  data: MeshData,
  placements: ReadonlyArray<InstancePlacement>,
  opts: InstancedMeshOptions = {},
): THREE.InstancedMesh {
  const geometry = buildGeometry(data);
  const color = opts.color ?? data.color ?? '#d4d8dc';
  const viewMode = opts.viewMode ?? 'solid';
  const material = new THREE.MeshStandardMaterial({
    color,
    metalness: 0,
    roughness: 0.45,
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.08,
    side: viewMode === 'solid' ? THREE.FrontSide : THREE.DoubleSide,
    wireframe: viewMode === 'wireframe',
    transparent: viewMode === 'xray',
    opacity: viewMode === 'xray' ? 0.35 : 1,
    depthWrite: viewMode !== 'xray',
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    clippingPlanes: opts.clippingPlanes ?? null,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i];
    if (p === undefined) continue;
    mesh.setMatrixAt(i, p instanceof THREE.Matrix4 ? p : instanceMatrix(p));
  }
  mesh.instanceMatrix.needsUpdate = true;
  // InstancedMesh keeps its own bounds for frustum culling / raycasting, and
  // setMatrixAt doesn't update them — recompute over the instance matrices so
  // a grid translated far from the source mesh isn't wrongly culled.
  mesh.computeBoundingSphere();
  return mesh;
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
