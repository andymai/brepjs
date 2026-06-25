/**
 * Edit-after-reference harness for *generated*-face references (fillet rounds /
 * chamfer bevels). The generated face has no stable hash and fillet/chamfer
 * evolution is empty, so it's named by the two faces it bridges and resolved as
 * the between-face whose normal blends both — the Gap-2 crack via lineage rather
 * than hashes. Gated to the OCCT family.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { currentKernelId } from './helpers/kernelDivergences.js';
import { box, getFaces, getHashCode, unwrap, type Face } from '@/index.js';
import { sharedEdges } from '@/topology/adjacencyFns.js';
import { filletWithEvolution, chamferWithEvolution } from '@/topology/evolutionFns.js';
import { normalAt, faceCenter, faceGeomType } from '@/topology/faceFns.js';
import {
  assignRoles,
  createDerivedFaceRef,
  resolveDerivedFaceRef,
  type RoleTable,
} from '@/topology/shapeRef/index.js';

// Gated to occt-wasm (the default kernel), where the between-face heuristic is
// validated. occt (OpenCascade.js) fillets a single edge into a divergent
// topology (the +Z face splits in two) where the round doesn't cleanly resolve —
// a secondary-kernel limitation of the geometric re-derivation, not the model.
const isOcctWasm = currentKernelId === 'occt-wasm';

beforeAll(async () => {
  await initKernel();
}, 30000);

function faceForRole(
  shape: ReturnType<typeof box>,
  roles: Map<string, number[]>,
  role: string
): Face {
  const hashes = roles.get(role) ?? [];
  const f = getFaces(shape).find((face) => hashes.includes(getHashCode(face)));
  if (f === undefined) throw new Error(`no face for role ${role}`);
  return f;
}

describe.skipIf(!isOcctWasm)('shapeRef derived-face references (generated geometry)', () => {
  it('names + resolves a fillet round by the two faces it bridges', () => {
    const b = box(20, 20, 20);
    const roles = assignRoles(b, 'box');
    const table: RoleTable = new Map([['s0', roles]]);

    const top = faceForRole(b, roles, 'box:top');
    const front = faceForRole(b, roles, 'box:front');
    const [edge] = sharedEdges(top, front);
    if (edge === undefined) throw new Error('no top∩front edge');

    const ref = createDerivedFaceRef('s0', 'fillet', edge, b, table);
    expect(ref).toBeDefined();
    if (ref === undefined) return;
    expect([...ref.betweenRoles].sort()).toEqual(['box:front', 'box:top']);

    const { shape: filleted } = unwrap(filletWithEvolution(b, [edge], 2));
    const resolved = resolveDerivedFaceRef(ref, table, filleted);
    expect('face' in resolved).toBe(true);
    if ('face' in resolved) {
      // The round: a cylindrical face whose normal blends top (+Z) and front
      // (-Y), sitting at the top-front edge — not either flanking side face.
      expect(faceGeomType(resolved.face)).toBe('CYLINDRE');
      expect(faceCenter(resolved.face)[2]).toBeGreaterThan(15);
      const n = normalAt(resolved.face);
      expect(n[2]).toBeGreaterThan(0.1); // blends +Z
      expect(n[1]).toBeLessThan(-0.1); // blends -Y
    }
  });

  it('names + resolves a chamfer bevel the same way (flat between-face)', () => {
    const b = box(20, 20, 20);
    const roles = assignRoles(b, 'box');
    const table: RoleTable = new Map([['s0', roles]]);
    const top = faceForRole(b, roles, 'box:top');
    const front = faceForRole(b, roles, 'box:front');
    const [edge] = sharedEdges(top, front);
    if (edge === undefined) throw new Error('no top∩front edge');

    const ref = createDerivedFaceRef('s0', 'chamfer', edge, b, table);
    if (ref === undefined) throw new Error('could not capture derived ref');

    const { shape: chamfered } = unwrap(chamferWithEvolution(b, [edge], 2));
    const resolved = resolveDerivedFaceRef(ref, table, chamfered);
    expect('face' in resolved).toBe(true);
    if ('face' in resolved) {
      // A chamfer bevel is planar; its normal still blends both originals.
      expect(faceGeomType(resolved.face)).toBe('PLANE');
      const n = normalAt(resolved.face);
      expect(n[2]).toBeGreaterThan(0.1);
      expect(n[1]).toBeLessThan(-0.1);
    }
  });

  it('is broken when the generated face does not exist (un-edited shape)', () => {
    const b = box(20, 20, 20);
    const roles = assignRoles(b, 'box');
    const table: RoleTable = new Map([['s0', roles]]);
    const top = faceForRole(b, roles, 'box:top');
    const front = faceForRole(b, roles, 'box:front');
    const [edge] = sharedEdges(top, front);
    if (edge === undefined) throw new Error('no top∩front edge');
    const ref = createDerivedFaceRef('s0', 'fillet', edge, b, table);
    if (ref === undefined) throw new Error('could not capture derived ref');

    // On the original box there is no bridging face — top and front meet at a
    // sharp edge; the only between-faces are the orthogonal sides, rejected by
    // the normal-blend.
    const resolved = resolveDerivedFaceRef(ref, table, b);
    expect('reason' in resolved).toBe(true);
  });
});
