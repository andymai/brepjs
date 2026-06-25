/**
 * Shared helpers for lineage references (edge/vertex): the role-table lookups
 * — forward "role → current faces", reverse "face → role" — plus the small
 * geometry both share. (Not hot-path, so a shared `distance` here is fine; the
 * deliberately math-free `vec3.ts` is reserved for hot kernel loops.)
 */

import type { Face, Shape3D, Vertex } from '@/core/shapeTypes.js';
import type { Vec3 } from '@/core/types.js';
import { getFaces, vertexPosition } from '@/topology/topologyQueryFns.js';
import { getHashCode } from '@/topology/shapeFns.js';
import type { RoleTable } from './shapeRefTypes.js';

/** Euclidean distance between two points. */
export function distance(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Mean of a set of vertices' positions (e.g. an edge's endpoints). */
export function vertexCentroid(verts: readonly Vertex[]): Vec3 | undefined {
  if (verts.length === 0) return undefined;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const v of verts) {
    const p = vertexPosition(v);
    x += p[0];
    y += p[1];
    z += p[2];
  }
  const n = verts.length;
  return [x / n, y / n, z / n];
}

/** The role whose tracked hashes include this face (reverse lookup). */
export function roleOfFace(face: Face, origin: string, roles: RoleTable): string | undefined {
  const originRoles = roles.get(origin);
  if (!originRoles) return undefined;
  const hash = getHashCode(face);
  for (const [role, hashes] of originRoles) {
    if (hashes.includes(hash)) return role;
  }
  return undefined;
}

/** Current faces a role resolves to — its tracked successors present in `shape`. */
export function facesForRole(
  shape: Shape3D,
  origin: string,
  role: string,
  roles: RoleTable
): Face[] {
  const hashes = roles.get(origin)?.get(role);
  if (hashes === undefined || hashes.length === 0) return [];
  return getFaces(shape).filter((f) => hashes.includes(getHashCode(f)));
}
