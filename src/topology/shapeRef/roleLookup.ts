/**
 * Shared helpers for lineage references (edge/vertex): the role-table lookups
 * — forward "role → current faces", reverse "face → role" — plus the small
 * geometry both share. (Not hot-path, so a shared `distance` here is fine; the
 * deliberately math-free `vec3.ts` is reserved for hot kernel loops.)
 */

import type { Face, Shape3D } from '@/core/shapeTypes.js';
import type { Vec3 } from '@/core/types.js';
import { getFaces } from '@/topology/topologyQueryFns.js';
import { getHashCode } from '@/topology/shapeFns.js';
import type { RoleTable } from './shapeRefTypes.js';

/** Euclidean distance between two points. */
export function distance(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
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
