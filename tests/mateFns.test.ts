import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import {
  box,
  cylinder,
  createAssemblyNode,
  addChild,
  addMate,
  solveAssembly,
  isOk,
  isErr,
  unwrap,
  unwrapErr,
  getFaces,
  faceCenter,
} from '@/index.js';
import type { MateConstraint } from '@/index.js';
import { solveConstraints, type SolverEntity } from '@/kernel/solverAdapter.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

/** Find the face whose center has the highest Z. */
function topFace(shape: Parameters<typeof getFaces>[0]) {
  const faces = getFaces(shape);
  let best = faces[0];
  let bestZ = faceCenter(best)[2];
  for (let i = 1; i < faces.length; i++) {
    const z = faceCenter(faces[i])[2];
    if (z > bestZ) {
      best = faces[i];
      bestZ = z;
    }
  }
  return best;
}

/** Find the face whose center has the lowest Z. */
function bottomFace(shape: Parameters<typeof getFaces>[0]) {
  const faces = getFaces(shape);
  let best = faces[0];
  let bestZ = faceCenter(best)[2];
  for (let i = 1; i < faces.length; i++) {
    const z = faceCenter(faces[i])[2];
    if (z < bestZ) {
      best = faces[i];
      bestZ = z;
    }
  }
  return best;
}

/** Find the face whose center is closest to the XY plane (smallest |Z|). */
function cylindricalFace(shape: Parameters<typeof getFaces>[0]) {
  const faces = getFaces(shape);
  let best = faces[0];
  let bestAbsZ = Math.abs(faceCenter(best)[2]);
  for (let i = 1; i < faces.length; i++) {
    const absZ = Math.abs(faceCenter(faces[i])[2]);
    if (absZ < bestAbsZ) {
      best = faces[i];
      bestAbsZ = absZ;
    }
  }
  return best;
}

describe('assembly mates', () => {
  it('coincident mate aligns two box faces', () => {
    const b1 = box(10, 10, 10);
    const b2 = box(5, 5, 5);

    const topOfB1 = topFace(b1);
    const bottomOfB2 = bottomFace(b2);

    let assembly = createAssemblyNode('root');
    assembly = addChild(assembly, createAssemblyNode('base', { shape: b1 }));
    assembly = addChild(assembly, createAssemblyNode('top', { shape: b2 }));

    assembly = addMate(assembly, {
      type: 'fixed',
      entity: { node: 'base' },
    });

    assembly = addMate(assembly, {
      type: 'coincident',
      entityA: { node: 'base', face: topOfB1 },
      entityB: { node: 'top', face: bottomOfB2 },
    });

    const result = solveAssembly(assembly);
    expect(isOk(result)).toBe(true);
    const solved = unwrap(result);
    expect(solved.converged).toBe(true);

    const topTransform = solved.transforms.get('top');
    expect(topTransform).toBeDefined();
    // box(10) top face center at z=10, box(5) bottom face center at z=0
    // Coincident should move b2 so its bottom face meets b1's top face
    // Normal of top face is (0,0,1)
    // dot = 1*(10-0) = 10, pos = [0,0,10]
    expect(topTransform?.position[2]).toBeCloseTo(10, 0);
  });

  it('distance mate separates two parts', () => {
    const b1 = box(10, 10, 10);
    const b2 = box(10, 10, 10);

    const topOfB1 = topFace(b1);
    const bottomOfB2 = bottomFace(b2);

    let assembly = createAssemblyNode('root');
    assembly = addChild(assembly, createAssemblyNode('base', { shape: b1 }));
    assembly = addChild(assembly, createAssemblyNode('upper', { shape: b2 }));

    assembly = addMate(assembly, {
      type: 'fixed',
      entity: { node: 'base' },
    });

    assembly = addMate(assembly, {
      type: 'distance',
      entityA: { node: 'base', face: topOfB1 },
      entityB: { node: 'upper', face: bottomOfB2 },
      distance: 5,
    });

    const result = solveAssembly(assembly);
    expect(isOk(result)).toBe(true);
    const solved = unwrap(result);
    expect(solved.converged).toBe(true);

    const upperTransform = solved.transforms.get('upper');
    expect(upperTransform).toBeDefined();
    // Top of b1 at z=10, bottom of b2 at z=0, distance 5
    // offset = (10-0) + 5 = 15
    expect(upperTransform?.position[2]).toBeCloseTo(15, 0);
  });

  it('returns error when no mates defined', () => {
    const assembly = createAssemblyNode('root');
    const result = solveAssembly(assembly);
    expect(isErr(result)).toBe(true);
  });

  it('returns error when mates array is empty', () => {
    // Explicitly set mates to empty via two addMate-then-splice trick:
    // The only way to get an empty mates array is via the spread in addMate.
    // We create a node whose mates property is an empty array by spreading
    // an assembly that has had its mates stripped.
    const base = createAssemblyNode('root');
    // Spread to inject empty mates array directly on the node.
    const withEmptyMates = { ...base, mates: [] as MateConstraint[] };
    const result = solveAssembly(withEmptyMates);
    expect(isErr(result)).toBe(true);
  });
});

describe('addMate', () => {
  it('returns a new node without mutating the original', () => {
    const assembly = createAssemblyNode('root');
    const constraint: MateConstraint = { type: 'fixed', entity: { node: 'root' } };
    const updated = addMate(assembly, constraint);
    expect(updated).not.toBe(assembly);
    expect(assembly.mates).toBeUndefined();
    expect(updated.mates).toHaveLength(1);
  });

  it('accumulates multiple mates in order', () => {
    let assembly = createAssemblyNode('root');
    const c1: MateConstraint = { type: 'fixed', entity: { node: 'a' } };
    const c2: MateConstraint = {
      type: 'coincident',
      entityA: { node: 'a', point: [0, 0, 0] },
      entityB: { node: 'b', point: [1, 1, 1] },
    };
    const c3: MateConstraint = {
      type: 'distance',
      entityA: { node: 'a', point: [0, 0, 0] },
      entityB: { node: 'b', point: [0, 0, 0] },
      distance: 10,
    };
    assembly = addMate(assembly, c1);
    assembly = addMate(assembly, c2);
    assembly = addMate(assembly, c3);
    expect(assembly.mates).toHaveLength(3);
    expect((assembly.mates as MateConstraint[])[0]).toBe(c1);
    expect((assembly.mates as MateConstraint[])[1]).toBe(c2);
    expect((assembly.mates as MateConstraint[])[2]).toBe(c3);
  });

  it('preserves all other assembly node fields', () => {
    const b = box(5, 5, 5);
    const assembly = createAssemblyNode('root', {
      shape: b,
      translate: [1, 2, 3],
      metadata: { color: 'red' },
    });
    const updated = addMate(assembly, { type: 'fixed', entity: { node: 'root' } });
    expect(updated.name).toBe('root');
    expect(updated.shape).toBe(b);
    expect(updated.translate).toEqual([1, 2, 3]);
    expect(updated.metadata).toEqual({ color: 'red' });
  });
});

describe('solveAssembly — fixed-only', () => {
  it('solves with only a fixed constraint', () => {
    const b = box(10, 10, 10);
    let assembly = createAssemblyNode('root');
    assembly = addChild(assembly, createAssemblyNode('part', { shape: b }));
    assembly = addMate(assembly, { type: 'fixed', entity: { node: 'part' } });

    const result = solveAssembly(assembly);
    expect(isOk(result)).toBe(true);
    const solved = unwrap(result);
    expect(solved.converged).toBe(true);
    expect(solved.dof).toBe(0);
    const partTransform = solved.transforms.get('part');
    expect(partTransform).toBeDefined();
    // Fixed node stays at origin
    expect(partTransform?.position).toEqual([0, 0, 0]);
  });

  it('result includes transform entries for all assembly nodes', () => {
    const b1 = box(10, 10, 10);
    const b2 = box(5, 5, 5);
    let assembly = createAssemblyNode('root');
    assembly = addChild(assembly, createAssemblyNode('part-a', { shape: b1 }));
    assembly = addChild(assembly, createAssemblyNode('part-b', { shape: b2 }));
    assembly = addMate(assembly, { type: 'fixed', entity: { node: 'part-a' } });

    const result = solveAssembly(assembly);
    expect(isOk(result)).toBe(true);
    const solved = unwrap(result);
    // All three nodes (root, part-a, part-b) get transform entries
    expect(solved.transforms.has('root')).toBe(true);
    expect(solved.transforms.has('part-a')).toBe(true);
    expect(solved.transforms.has('part-b')).toBe(true);
  });

  it('each transform has a rotation quaternion with four components', () => {
    let assembly = createAssemblyNode('root');
    assembly = addChild(assembly, createAssemblyNode('part', { shape: box(5, 5, 5) }));
    assembly = addMate(assembly, { type: 'fixed', entity: { node: 'part' } });

    const solved = unwrap(solveAssembly(assembly));
    const partTransform = solved.transforms.get('part');
    expect(partTransform?.rotation).toHaveLength(4);
  });
});

describe('solveAssembly — concentric mate', () => {
  it('concentric mate returns error (not yet implemented)', () => {
    const cyl1 = cylinder(5, 20);
    const cyl2 = cylinder(3, 15);

    const cylFace1 = cylindricalFace(cyl1);
    const cylFace2 = cylindricalFace(cyl2);

    let assembly = createAssemblyNode('root');
    assembly = addChild(assembly, createAssemblyNode('shaft', { shape: cyl1 }));
    assembly = addChild(assembly, createAssemblyNode('sleeve', { shape: cyl2 }));
    assembly = addMate(assembly, { type: 'fixed', entity: { node: 'shaft' } });
    assembly = addMate(assembly, {
      type: 'concentric',
      axisA: { node: 'shaft', face: cylFace1 },
      axisB: { node: 'sleeve', face: cylFace2 },
    });

    const result = solveAssembly(assembly);
    expect(isErr(result)).toBe(true);
    const error = unwrapErr(result);
    expect(error.message).toContain('concentric');
  });

  it('concentric mate with no geometry returns error', () => {
    let assembly = createAssemblyNode('root');
    assembly = addChild(assembly, createAssemblyNode('a', { shape: box(5, 5, 5) }));
    assembly = addChild(assembly, createAssemblyNode('b', { shape: box(5, 5, 5) }));
    assembly = addMate(assembly, {
      type: 'concentric',
      axisA: { node: 'a' },
      axisB: { node: 'b' },
    });

    const result = solveAssembly(assembly);
    expect(isErr(result)).toBe(true);
  });
});

describe('solveAssembly — angle mate', () => {
  it('angle mate returns error (not yet implemented)', () => {
    const b1 = box(10, 10, 10);
    const b2 = box(10, 10, 10);

    const topOfB1 = topFace(b1);
    const topOfB2 = topFace(b2);

    let assembly = createAssemblyNode('root');
    assembly = addChild(assembly, createAssemblyNode('base', { shape: b1 }));
    assembly = addChild(assembly, createAssemblyNode('tilted', { shape: b2 }));
    assembly = addMate(assembly, { type: 'fixed', entity: { node: 'base' } });
    assembly = addMate(assembly, {
      type: 'angle',
      entityA: { node: 'base', face: topOfB1 },
      entityB: { node: 'tilted', face: topOfB2 },
      angle: 45,
    });

    const result = solveAssembly(assembly);
    expect(isErr(result)).toBe(true);
    const error = unwrapErr(result);
    expect(error.message).toContain('angle');
  });

  it('angle mate with no geometry returns error', () => {
    let assembly = createAssemblyNode('root');
    assembly = addChild(assembly, createAssemblyNode('a'));
    assembly = addChild(assembly, createAssemblyNode('b'));
    assembly = addMate(assembly, {
      type: 'angle',
      entityA: { node: 'a' },
      entityB: { node: 'b' },
      angle: 90,
    });

    const result = solveAssembly(assembly);
    expect(isErr(result)).toBe(true);
  });
});

describe('solveAssembly — coincident with point entity', () => {
  it('coincident mate using point entities returns error (point-point unsupported)', () => {
    let assembly = createAssemblyNode('root');
    assembly = addChild(assembly, createAssemblyNode('a', { shape: box(10, 10, 10) }));
    assembly = addChild(assembly, createAssemblyNode('b', { shape: box(5, 5, 5) }));
    assembly = addMate(assembly, { type: 'fixed', entity: { node: 'a' } });
    assembly = addMate(assembly, {
      type: 'coincident',
      // Points are valid MateEntity with type 'point' in extractEntity
      entityA: { node: 'a', point: [0, 0, 10] },
      entityB: { node: 'b', point: [0, 0, 0] },
    });

    const result = solveAssembly(assembly);
    // Point-point coincident is not implemented — solver reports as unsupported
    expect(isErr(result)).toBe(true);
    const error = unwrapErr(result);
    expect(error.message).toContain('coincident(point-point)');
  });

  it('coincident mate with no geometry returns error', () => {
    let assembly = createAssemblyNode('root');
    assembly = addChild(assembly, createAssemblyNode('a'));
    assembly = addChild(assembly, createAssemblyNode('b'));
    // No face and no point — extractEntity returns null for both
    assembly = addMate(assembly, {
      type: 'coincident',
      entityA: { node: 'a' },
      entityB: { node: 'b' },
    });

    const result = solveAssembly(assembly);
    expect(isErr(result)).toBe(true);
  });
});

describe('solveAssembly — distance mate error path', () => {
  it('distance mate with no geometry returns error', () => {
    let assembly = createAssemblyNode('root');
    assembly = addChild(assembly, createAssemblyNode('a'));
    assembly = addChild(assembly, createAssemblyNode('b'));
    // No face and no point — extractEntity returns null
    assembly = addMate(assembly, {
      type: 'distance',
      entityA: { node: 'a' },
      entityB: { node: 'b' },
      distance: 5,
    });

    const result = solveAssembly(assembly);
    expect(isErr(result)).toBe(true);
  });
});

describe('solveAssembly — combined mates', () => {
  it('fixed + coincident + distance chain all process in order', () => {
    const b1 = box(10, 10, 10);
    const b2 = box(5, 5, 5);
    const b3 = box(5, 5, 5);

    let assembly = createAssemblyNode('root');
    assembly = addChild(assembly, createAssemblyNode('base', { shape: b1 }));
    assembly = addChild(assembly, createAssemblyNode('mid', { shape: b2 }));
    assembly = addChild(assembly, createAssemblyNode('top', { shape: b3 }));

    assembly = addMate(assembly, { type: 'fixed', entity: { node: 'base' } });
    assembly = addMate(assembly, {
      type: 'coincident',
      entityA: { node: 'base', face: topFace(b1) },
      entityB: { node: 'mid', face: bottomFace(b2) },
    });
    assembly = addMate(assembly, {
      type: 'distance',
      entityA: { node: 'mid', face: topFace(b2) },
      entityB: { node: 'top', face: bottomFace(b3) },
      distance: 3,
    });

    const result = solveAssembly(assembly);
    expect(isOk(result)).toBe(true);
    const solved = unwrap(result);
    expect(solved.converged).toBe(true);
    expect(solved.transforms.has('base')).toBe(true);
    expect(solved.transforms.has('mid')).toBe(true);
    expect(solved.transforms.has('top')).toBe(true);

    // mid coincident with top of base at z=10
    const midZ = solved.transforms.get('mid')?.position[2];
    expect(midZ).toBeCloseTo(10, 0);

    // Constraints compose down the chain: the distance mate reads mid's SOLVED
    // pose, not its original geometry. mid is placed at z=10 (spans 10..15), so
    // its top face is at world z=15; with a 3-unit gap, top sits at z=18.
    const topZ = solved.transforms.get('top')?.position[2];
    expect(topZ).toBeCloseTo(18, 0);
  });

  it('composes a chain regardless of mate declaration order', () => {
    const b1 = box(10, 10, 10);
    const b2 = box(5, 5, 5);
    const b3 = box(5, 5, 5);

    let assembly = createAssemblyNode('root');
    assembly = addChild(assembly, createAssemblyNode('base', { shape: b1 }));
    assembly = addChild(assembly, createAssemblyNode('mid', { shape: b2 }));
    assembly = addChild(assembly, createAssemblyNode('top', { shape: b3 }));

    // Declared leaf-first: the top→mid mate appears before mid→base, so a
    // naive in-order solver would read mid's unsolved (origin) pose. Topological
    // resolution must still place mid before solving the distance mate.
    assembly = addMate(assembly, {
      type: 'distance',
      entityA: { node: 'mid', face: topFace(b2) },
      entityB: { node: 'top', face: bottomFace(b3) },
      distance: 3,
    });
    assembly = addMate(assembly, {
      type: 'coincident',
      entityA: { node: 'base', face: topFace(b1) },
      entityB: { node: 'mid', face: bottomFace(b2) },
    });
    assembly = addMate(assembly, { type: 'fixed', entity: { node: 'base' } });

    const result = solveAssembly(assembly);
    expect(isOk(result)).toBe(true);
    const solved = unwrap(result);
    expect(solved.converged).toBe(true);
    expect(solved.transforms.get('mid')?.position[2]).toBeCloseTo(10, 0);
    expect(solved.transforms.get('top')?.position[2]).toBeCloseTo(18, 0);
  });
});

describe('solveConstraints — unsupported constraint honesty', () => {
  it('returns converged=true and dof=0 when all constraints are supported', () => {
    const result = solveConstraints(
      ['a', 'b'],
      [{ type: 'fixed', entityA: { node: 'a', entity: { type: 'point', origin: [0, 0, 0] } } }]
    );
    expect(result.converged).toBe(true);
    expect(result.dof).toBe(0);
    expect(result.unsupported).toEqual([]);
  });

  it('returns converged=false and dof=4 for unsupported concentric', () => {
    const result = solveConstraints(
      ['a', 'b'],
      [
        {
          type: 'concentric',
          entityA: { node: 'a', entity: { type: 'axis', origin: [0, 0, 0], direction: [0, 0, 1] } },
          entityB: { node: 'b', entity: { type: 'axis', origin: [1, 0, 0], direction: [0, 0, 1] } },
        },
      ]
    );
    expect(result.converged).toBe(false);
    expect(result.dof).toBe(4);
    expect(result.unsupported).toEqual(['concentric']);
  });

  it('returns converged=false and dof=1 for unsupported angle', () => {
    const result = solveConstraints(
      ['a', 'b'],
      [
        {
          type: 'angle',
          entityA: { node: 'a', entity: { type: 'plane', origin: [0, 0, 0], normal: [0, 0, 1] } },
          entityB: { node: 'b', entity: { type: 'plane', origin: [0, 0, 0], normal: [0, 1, 0] } },
          value: 45,
        },
      ]
    );
    expect(result.converged).toBe(false);
    expect(result.dof).toBe(1);
    expect(result.unsupported).toEqual(['angle']);
  });

  it('accumulates DOF from multiple unsupported constraints', () => {
    const result = solveConstraints(
      ['a', 'b'],
      [
        {
          type: 'concentric',
          entityA: { node: 'a', entity: { type: 'axis', origin: [0, 0, 0] } },
          entityB: { node: 'b', entity: { type: 'axis', origin: [0, 0, 0] } },
        },
        {
          type: 'angle',
          entityA: { node: 'a', entity: { type: 'plane', origin: [0, 0, 0] } },
          entityB: { node: 'b', entity: { type: 'plane', origin: [0, 0, 0] } },
          value: 90,
        },
      ]
    );
    expect(result.converged).toBe(false);
    expect(result.dof).toBe(5); // 4 (concentric) + 1 (angle)
    expect(result.unsupported).toEqual(['concentric', 'angle']);
  });

  it('reports non-plane entity combinations as unsupported for coincident', () => {
    const result = solveConstraints(
      ['a', 'b'],
      [
        {
          type: 'coincident',
          entityA: { node: 'a', entity: { type: 'point', origin: [0, 0, 10] } },
          entityB: { node: 'b', entity: { type: 'point', origin: [0, 0, 0] } },
        },
      ]
    );
    expect(result.converged).toBe(false);
    expect(result.unsupported).toEqual(['coincident(point-point)']);
    expect(result.dof).toBe(3);
  });

  it('reports non-plane entity combinations as unsupported for distance', () => {
    const result = solveConstraints(
      ['a', 'b'],
      [
        {
          type: 'distance',
          entityA: { node: 'a', entity: { type: 'point', origin: [0, 0, 0] } },
          entityB: { node: 'b', entity: { type: 'axis', origin: [0, 0, 0], direction: [0, 0, 1] } },
          value: 5,
        },
      ]
    );
    expect(result.converged).toBe(false);
    expect(result.unsupported).toEqual(['distance(point-axis)']);
    expect(result.dof).toBe(1);
  });

  it('still solves supported constraints alongside unsupported ones', () => {
    const result = solveConstraints(
      ['a', 'b'],
      [
        {
          type: 'coincident',
          entityA: { node: 'a', entity: { type: 'plane', origin: [0, 0, 10], normal: [0, 0, 1] } },
          entityB: { node: 'b', entity: { type: 'plane', origin: [0, 0, 0], normal: [0, 0, 1] } },
        },
        {
          type: 'angle',
          entityA: { node: 'a', entity: { type: 'plane', origin: [0, 0, 0] } },
          entityB: { node: 'b', entity: { type: 'plane', origin: [0, 0, 0] } },
          value: 45,
        },
      ]
    );
    // Coincident is solved even though angle is not
    expect(result.transforms.get('b')?.position[2]).toBeCloseTo(10, 0);
    expect(result.converged).toBe(false);
    expect(result.unsupported).toEqual(['angle']);
  });

  it('reports a mutual-reference cycle as unanchored (no root to resolve from)', () => {
    // a→b and b→a with no fixed node and no chain root: neither reference can
    // ever be placed, so both stay pending and surface as `(unanchored)`.
    const plane = (z: number): SolverEntity => ({
      type: 'plane',
      origin: [0, 0, z],
      normal: [0, 0, 1],
    });
    const result = solveConstraints(
      ['a', 'b'],
      [
        {
          type: 'coincident',
          entityA: { node: 'a', entity: plane(0) },
          entityB: { node: 'b', entity: plane(0) },
        },
        {
          type: 'coincident',
          entityA: { node: 'b', entity: plane(0) },
          entityB: { node: 'a', entity: plane(0) },
        },
      ]
    );
    expect(result.converged).toBe(false);
    expect(result.unsupported).toEqual(['coincident(unanchored)', 'coincident(unanchored)']);
  });
});
