/**
 * Three.js integration helpers.
 *
 * Converts brepjs mesh data into typed arrays suitable for
 * THREE.BufferGeometry.setAttribute(). No three.js dependency required.
 */

import type { ShapeMesh, EdgeMesh, MultiLODMesh, LODMesh } from './meshFns.js';

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
    position: mesh.lines,
  };
}

// ---------------------------------------------------------------------------
// LOD geometry
// ---------------------------------------------------------------------------

/** LOD-ready geometry data for Three.js LOD class. */
export interface LODGeometryData {
  readonly coarse: BufferGeometryData;
  readonly fine: BufferGeometryData;
  /** Camera distance at which to switch to coarse geometry. */
  readonly coarseDistance: number;
  /** Camera distance at which to show fine geometry (typically 0). */
  readonly fineDistance: number;
}

/**
 * Convert a multi-LOD mesh into Three.js LOD-compatible geometry data.
 *
 * @example
 * ```ts
 * const lod = new THREE.LOD();
 * const data = toLODGeometryData(meshMultiLOD(shape));
 * lod.addLevel(new THREE.Mesh(toBufferGeometry(data.fine), mat), data.fineDistance);
 * lod.addLevel(new THREE.Mesh(toBufferGeometry(data.coarse), mat), data.coarseDistance);
 * ```
 */
export function toLODGeometryData(
  multiLOD: MultiLODMesh,
  distances?: { readonly coarse?: number | undefined; readonly fine?: number | undefined }
): LODGeometryData {
  return {
    coarse: toBufferGeometryData(multiLOD.coarse),
    fine: toBufferGeometryData(multiLOD.fine),
    coarseDistance: distances?.coarse ?? 50,
    fineDistance: distances?.fine ?? 0,
  };
}

/** One LOD level of THREE.LOD-ready geometry: geometry plus its switch distance. */
export interface LODGeometryLevel {
  /** Geometry for this level. */
  readonly geometry: BufferGeometryData;
  /** Camera distance at which THREE.LOD switches to this level (finest = 0). */
  readonly distance: number;
}

/**
 * Convert N LOD meshes (from `meshLODs`, coarse → fine) into THREE.LOD level
 * data. The finest level gets distance 0 and each coarser level steps out by
 * `step`; pass `distances` (indexed coarse → fine) to set them explicitly.
 *
 * @example
 * ```ts
 * const lod = new THREE.LOD();
 * for (const { geometry, distance } of toLODGeometryLevels(meshLODs(shape))) {
 *   lod.addLevel(new THREE.Mesh(toBufferGeometry(geometry), mat), distance);
 * }
 * ```
 */
export function toLODGeometryLevels(
  lods: ReadonlyArray<LODMesh>,
  options?: { readonly distances?: readonly number[]; readonly step?: number }
): LODGeometryLevel[] {
  const step = options?.step ?? 50;
  const distances = options?.distances;
  if (distances && distances.length !== lods.length) {
    throw new Error(
      `toLODGeometryLevels: distances must have one entry per level (got ${distances.length} for ${lods.length} levels)`
    );
  }
  const last = lods.length - 1;
  return lods.map((lod, idx) => ({
    geometry: toBufferGeometryData(lod.mesh),
    // lods are coarse → fine; finest (last) sits at distance 0, coarser further out.
    distance: distances?.[idx] ?? (last - idx) * step,
  }));
}
