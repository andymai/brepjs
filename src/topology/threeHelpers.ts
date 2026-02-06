/**
 * Three.js integration helpers.
 *
 * Converts brepjs mesh data into typed arrays suitable for
 * THREE.BufferGeometry.setAttribute(). No three.js dependency required.
 */

import type { ShapeMesh, EdgeMesh } from './meshFns.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Data ready to be used with THREE.BufferGeometry. */
export interface BufferGeometryData {
  /** Flat float array of vertex positions (x,y,z interleaved). */
  position: Float32Array;
  /** Flat float array of vertex normals (x,y,z interleaved). */
  normal: Float32Array;
  /** Triangle index array (3 indices per triangle). */
  index: Uint32Array;
}

/** Line segment data ready for THREE.LineSegments or THREE.Line. */
export interface LineGeometryData {
  /** Flat float array of line vertex positions (x,y,z interleaved). */
  position: Float32Array;
}

// ---------------------------------------------------------------------------
// Conversion functions
// ---------------------------------------------------------------------------

/**
 * Convert a ShapeMesh into BufferGeometry-compatible typed arrays.
 *
 * The returned arrays can be used directly with Three.js:
 * ```ts
 * const geo = new THREE.BufferGeometry();
 * geo.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
 * geo.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3));
 * geo.setIndex(new THREE.BufferAttribute(data.index, 1));
 * ```
 */
export function toBufferGeometryData(mesh: ShapeMesh): BufferGeometryData {
  return {
    position: mesh.vertices,
    normal: mesh.normals,
    index: mesh.triangles,
  };
}

// ---------------------------------------------------------------------------
// Grouped buffer geometry (with face groups for multi-material support)
// ---------------------------------------------------------------------------

/** A material group entry compatible with THREE.BufferGeometry.addGroup(). */
export interface BufferGeometryGroup {
  /** Start index in the triangle index buffer. */
  readonly start: number;
  /** Number of indices in this group. */
  readonly count: number;
  /** Sequential material index (0-based). */
  readonly materialIndex: number;
  /** Face topology ID for correlation with the shape's face. */
  readonly faceId: number;
}

/** BufferGeometry data with per-face material groups. */
export interface GroupedBufferGeometryData extends BufferGeometryData {
  /** Face groups for use with THREE.BufferGeometry.addGroup(). */
  readonly groups: ReadonlyArray<BufferGeometryGroup>;
}

/**
 * Convert a ShapeMesh into grouped BufferGeometry data with face material groups.
 *
 * Each face becomes a separate group, allowing per-face materials in Three.js:
 * ```ts
 * const data = toGroupedBufferGeometryData(mesh);
 * const geo = new THREE.BufferGeometry();
 * geo.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
 * geo.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3));
 * geo.setIndex(new THREE.BufferAttribute(data.index, 1));
 * for (const g of data.groups) {
 *   geo.addGroup(g.start, g.count, g.materialIndex);
 * }
 * ```
 */
export function toGroupedBufferGeometryData(mesh: ShapeMesh): GroupedBufferGeometryData {
  return {
    position: mesh.vertices,
    normal: mesh.normals,
    index: mesh.triangles,
    groups: mesh.faceGroups.map((g, i) => ({
      start: g.start,
      count: g.count,
      materialIndex: i,
      faceId: g.faceId,
    })),
  };
}

// ---------------------------------------------------------------------------
// Edge mesh conversion
// ---------------------------------------------------------------------------

/**
 * Convert an EdgeMesh into position data for THREE.LineSegments.
 *
 * ```ts
 * const geo = new THREE.BufferGeometry();
 * geo.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
 * const lines = new THREE.LineSegments(geo, material);
 * ```
 */
export function toLineGeometryData(mesh: EdgeMesh): LineGeometryData {
  return {
    position: new Float32Array(mesh.lines),
  };
}
