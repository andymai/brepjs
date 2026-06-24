/**
 * Shared role-table lookups used by every lineage reference (face/edge/vertex):
 * the forward "role → current faces" and reverse "face → role" mappings.
 */

import type { Face, Shape3D } from '@/core/shapeTypes.js';
import { getFaces } from '@/topology/topologyQueryFns.js';
import { getHashCode } from '@/topology/shapeFns.js';
import type { RoleTable } from './shapeRefTypes.js';

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
