/**
 * Recorded face roles: semantic face names an operation writes on its result
 * (e.g. `extrude:start`) while it still knows its inputs. `assignRoles` reads
 * them back, and they ride the same evolution pipeline as face tags so they
 * survive moves and booleans.
 *
 * Follows the same WeakMap + HashCode pattern as faceTagFns.ts.
 */

import type { ShapeEvolution } from '@/kernel/types.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';

// shape.wrapped → face hash → role name
const faceRoleStore = new WeakMap<object, Map<number, string>>();

/** O(1) check whether a shape carries recorded face roles. */
export function hasFaceRoles(shape: AnyShape<Dimension>): boolean {
  return faceRoleStore.has(shape.wrapped);
}

/** Record face roles (face hash → role name) on a shape, replacing any it had. */
export function setFaceRoles(shape: AnyShape<Dimension>, roles: ReadonlyMap<number, string>): void {
  if (roles.size === 0) return;
  faceRoleStore.set(shape.wrapped, new Map(roles));
}

/** The face roles recorded on a shape (face hash → role name), if any. */
export function getFaceRoles(shape: AnyShape<Dimension>): ReadonlyMap<number, string> | undefined {
  return faceRoleStore.get(shape.wrapped);
}

/**
 * Carry recorded face roles from inputs to a result through a ShapeEvolution:
 * deleted faces drop their role, a modified face passes it to every successor,
 * and an untouched face keeps it. When two inputs' faces land on one result
 * face, the first input's role wins.
 */
export function propagateFaceRolesFromEvolution(
  evolution: ShapeEvolution,
  inputs: readonly AnyShape<Dimension>[],
  result: AnyShape<Dimension>
): void {
  const resultRoles = new Map<number, string>();
  for (const input of inputs) {
    const inputRoles = faceRoleStore.get(input.wrapped);
    if (!inputRoles) continue;
    for (const [hash, role] of inputRoles) {
      if (evolution.deleted.has(hash)) continue;
      const modified = evolution.modified.get(hash);
      const targets = modified && modified.length > 0 ? modified : [hash];
      for (const target of targets) {
        if (!resultRoles.has(target)) resultRoles.set(target, role);
      }
    }
  }
  setFaceRoles(result, resultRoles);
}
