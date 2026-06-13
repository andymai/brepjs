import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import { shouldSkipSuite } from './helpers/kernelDivergences.js';
import {
  box,
  cylinder,
  cone,
  createAssemblyNode,
  addChild,
  addMate,
  solveAssembly,
  isOk,
  isErr,
  unwrap,
  getFaces,
  getEdges,
  getCurveType,
  curveAxis,
  faceCenter,
  faceAxis,
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

/** Rotate a vector by a quaternion [w, x, y, z] (test-side check helper). */
function qRotate(q: readonly number[], v: readonly number[]): [number, number, number] {
  const [w, x, y, z] = q as [number, number, number, number];
  const [vx, vy, vz] = v as [number, number, number];
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [
    vx + w * tx + (y * tz - z * ty),
    vy + w * ty + (z * tx - x * tz),
    vz + w * tz + (x * ty - y * tx),
  ];
}

/** Find the lateral cylindrical face — the one that has a well-defined axis. */
function cylindricalFace(shape: Parameters<typeof getFaces>[0]) {
  const faces = getFaces(shape);
  const face = faces.find((f) => faceAxis(f) !== null);
  if (!face) throw new Error('no cylindrical face found');
  return face;
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

  it('point-plane coincident mate drops a part point onto a reference face', () => {
    const base = box(10, 10, 10);
    let assembly = createAssemblyNode('root');
    assembly = addChild(assembly, createAssemblyNode('base', { shape: base }));
    assembly = addChild(assembly, createAssemblyNode('peg', { shape: box(2, 2, 2) }));
    assembly = addMate(assembly, { type: 'fixed', entity: { node: 'base' } });
    assembly = addMate(assembly, {
      type: 'coincident',
      entityA: { node: 'base', face: topFace(base) }, // plane at z=10
      entityB: { node: 'peg', point: [0, 0, 0] },
    });

    const solved = unwrap(solveAssembly(assembly));
    expect(solved.converged).toBe(true);
    expect(solved.transforms.get('peg')?.position[2]).toBeCloseTo(10, 6);
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
  it.skipIf(shouldSkipSuite('mateFns.concentricAxis'))(
    'concentric mate aligns two cylinder axes (pin-in-hole)',
    () => {
      // Two coaxial cylinders along +Z; concentric should converge with the
      // sleeve placed so its axis is collinear with the shaft's.
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
      expect(isOk(result)).toBe(true);
      const solved = unwrap(result);
      expect(solved.converged).toBe(true);
      const sleeve = solved.transforms.get('sleeve');
      expect(sleeve).toBeDefined();
      // Both cylinders are already Z-aligned, so the sleeve's axis is on the Z
      // axis: its solved X/Y translation must place its axis point on x=y=0.
      expect(sleeve?.position[0]).toBeCloseTo(0, 4);
      expect(sleeve?.position[1]).toBeCloseTo(0, 4);
      // Axes parallel → rotation is identity (w≈±1, vector part ≈0).
      expect(Math.abs(sleeve?.rotation[0] ?? 0)).toBeCloseTo(1, 4);
    }
  );

  it('concentric mate aligns two circular edges (bore rim pin-in-hole)', () => {
    // A circular edge (e.g. a bore rim) defines an axis through its center,
    // normal to its plane. Concentric on two such edges should converge.
    const cyl1 = cylinder(5, 20);
    const cyl2 = cylinder(3, 15);

    const rim1 = getEdges(cyl1).find((e) => getCurveType(e) === 'CIRCLE');
    const rim2 = getEdges(cyl2).find((e) => getCurveType(e) === 'CIRCLE');
    expect(rim1).toBeDefined();
    expect(rim2).toBeDefined();
    if (!rim1 || !rim2) return;
    // Sanity: curveAxis resolves an axis for the rim.
    expect(curveAxis(rim1)).not.toBeNull();

    let assembly = createAssemblyNode('root');
    assembly = addChild(assembly, createAssemblyNode('shaft', { shape: cyl1 }));
    assembly = addChild(assembly, createAssemblyNode('sleeve', { shape: cyl2 }));
    assembly = addMate(assembly, { type: 'fixed', entity: { node: 'shaft' } });
    assembly = addMate(assembly, {
      type: 'concentric',
      axisA: { node: 'shaft', edge: rim1 },
      axisB: { node: 'sleeve', edge: rim2 },
    });

    const result = solveAssembly(assembly);
    expect(isOk(result)).toBe(true);
    const solved = unwrap(result);
    expect(solved.converged).toBe(true);
    const sleeve = solved.transforms.get('sleeve');
    expect(sleeve?.position[0]).toBeCloseTo(0, 4);
    expect(sleeve?.position[1]).toBeCloseTo(0, 4);
    expect(Math.abs(sleeve?.rotation[0] ?? 0)).toBeCloseTo(1, 4);
  });

  it.skipIf(shouldSkipSuite('mateFns.coneAxis'))(
    'concentric mate aligns two conical faces (tapered pin-in-hole)',
    () => {
      // Two coaxial cones along +Z; concentric on their conical faces converges.
      const cone1 = cone(5, 2, 20);
      const cone2 = cone(4, 1.5, 15);
      const coneFace = (shape: Parameters<typeof getFaces>[0]) => {
        const f = getFaces(shape).find((face) => faceAxis(face) !== null);
        if (!f) throw new Error('no conical face with an axis found');
        return f;
      };

      let assembly = createAssemblyNode('root');
      assembly = addChild(assembly, createAssemblyNode('shaft', { shape: cone1 }));
      assembly = addChild(assembly, createAssemblyNode('sleeve', { shape: cone2 }));
      assembly = addMate(assembly, { type: 'fixed', entity: { node: 'shaft' } });
      assembly = addMate(assembly, {
        type: 'concentric',
        axisA: { node: 'shaft', face: coneFace(cone1) },
        axisB: { node: 'sleeve', face: coneFace(cone2) },
      });

      const result = solveAssembly(assembly);
      expect(isOk(result)).toBe(true);
      const solved = unwrap(result);
      expect(solved.converged).toBe(true);
      const sleeve = solved.transforms.get('sleeve');
      expect(sleeve?.position[0]).toBeCloseTo(0, 4);
      expect(sleeve?.position[1]).toBeCloseTo(0, 4);
      expect(Math.abs(sleeve?.rotation[0] ?? 0)).toBeCloseTo(1, 4);
    }
  );

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
  it('angle mate constrains relative orientation to the requested angle', () => {
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
    expect(isOk(result)).toBe(true);
    const solved = unwrap(result);
    expect(solved.converged).toBe(true);
    const rot = solved.transforms.get('tilted')?.rotation ?? [1, 0, 0, 0];
    // Apply the solved rotation to tilted's top-face normal (+Z) and confirm it
    // ends up 45° from base's top-face normal (also +Z).
    const rotated = qRotate(rot, [0, 0, 1]);
    const cos = rotated[2]; // dot with [0,0,1]
    expect((Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI).toBeCloseTo(45, 3);
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
  it('coincident mate using point entities moves the dependent onto the reference point', () => {
    let assembly = createAssemblyNode('root');
    assembly = addChild(assembly, createAssemblyNode('a', { shape: box(10, 10, 10) }));
    assembly = addChild(assembly, createAssemblyNode('b', { shape: box(5, 5, 5) }));
    assembly = addMate(assembly, { type: 'fixed', entity: { node: 'a' } });
    assembly = addMate(assembly, {
      type: 'coincident',
      entityA: { node: 'a', point: [0, 0, 10] },
      entityB: { node: 'b', point: [0, 0, 0] },
    });

    const result = solveAssembly(assembly);
    expect(isOk(result)).toBe(true);
    const solved = unwrap(result);
    expect(solved.converged).toBe(true);
    expect(solved.transforms.get('b')?.position).toEqual([0, 0, 10]);
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

  it('solves a concentric (axis-axis) mate, placing the dependent axis collinear', () => {
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
    expect(result.converged).toBe(true);
    expect(result.dof).toBe(0);
    // b's axis point [1,0,0] must shift to the reference axis (x=y=0): t=[-1,0,0].
    expect(result.transforms.get('b')?.position).toEqual([-1, 0, 0]);
  });

  it('solves an angle (plane-plane) mate', () => {
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
    expect(result.converged).toBe(true);
    expect(result.dof).toBe(0);
    expect(result.unsupported).toEqual([]);
  });

  it('reports entity-type mismatches as unsupported and accumulates their DOF', () => {
    const result = solveConstraints(
      ['a', 'b'],
      [
        // concentric requires axis-axis; planes here are a mismatch (4 DOF).
        {
          type: 'concentric',
          entityA: { node: 'a', entity: { type: 'plane', origin: [0, 0, 0] } },
          entityB: { node: 'b', entity: { type: 'plane', origin: [0, 0, 0] } },
        },
        // angle requires plane-plane; axes here are a mismatch (1 DOF).
        {
          type: 'angle',
          entityA: { node: 'a', entity: { type: 'axis', origin: [0, 0, 0] } },
          entityB: { node: 'b', entity: { type: 'axis', origin: [0, 0, 0] } },
          value: 90,
        },
      ]
    );
    expect(result.converged).toBe(false);
    expect(result.dof).toBe(5); // 4 (concentric) + 1 (angle)
    expect(result.unsupported).toEqual(['concentric(plane-plane)', 'angle(axis-axis)']);
  });

  it('reports a genuinely unsupported entity pair (axis-plane) for coincident', () => {
    const result = solveConstraints(
      ['a', 'b'],
      [
        {
          type: 'coincident',
          entityA: { node: 'a', entity: { type: 'axis', origin: [0, 0, 0], direction: [0, 0, 1] } },
          entityB: { node: 'b', entity: { type: 'plane', origin: [0, 0, 0], normal: [0, 0, 1] } },
        },
      ]
    );
    expect(result.converged).toBe(false);
    expect(result.unsupported).toEqual(['coincident(axis-plane)']);
    expect(result.dof).toBe(3);
  });

  it('still solves supported constraints alongside unsupported ones', () => {
    const result = solveConstraints(
      ['a', 'b', 'c'],
      [
        {
          type: 'coincident',
          entityA: { node: 'a', entity: { type: 'plane', origin: [0, 0, 10], normal: [0, 0, 1] } },
          entityB: { node: 'b', entity: { type: 'plane', origin: [0, 0, 0], normal: [0, 0, 1] } },
        },
        // concentric requires axis-axis; planes are a mismatch → unsupported.
        {
          type: 'concentric',
          entityA: { node: 'a', entity: { type: 'plane', origin: [0, 0, 0] } },
          entityB: { node: 'c', entity: { type: 'plane', origin: [0, 0, 0] } },
        },
      ]
    );
    // Coincident is solved even though the mismatched concentric is not.
    expect(result.transforms.get('b')?.position[2]).toBeCloseTo(10, 0);
    expect(result.converged).toBe(false);
    expect(result.unsupported).toEqual(['concentric(plane-plane)']);
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

describe('solveConstraints — non-plane coincident/distance pairs', () => {
  const pt = (o: [number, number, number]): SolverEntity => ({ type: 'point', origin: o });
  const ax = (o: [number, number, number], d: [number, number, number]): SolverEntity => ({
    type: 'axis',
    origin: o,
    direction: d,
  });
  const pl = (o: [number, number, number], n: [number, number, number]): SolverEntity => ({
    type: 'plane',
    origin: o,
    normal: n,
  });

  function solveOne(
    type: 'coincident' | 'distance',
    a: SolverEntity,
    b: SolverEntity,
    value?: number
  ) {
    return solveConstraints(
      ['a', 'b'],
      [
        {
          type,
          entityA: { node: 'a', entity: a },
          entityB: { node: 'b', entity: b },
          ...(value === undefined ? {} : { value }),
        },
      ]
    );
  }

  function pos(r: ReturnType<typeof solveConstraints>): [number, number, number] {
    const p = r.transforms.get('b')?.position;
    if (!p) throw new Error('no transform for b');
    return [p[0], p[1], p[2]];
  }

  function expectPos(r: ReturnType<typeof solveConstraints>, expected: readonly number[]): void {
    const p = pos(r);
    for (let i = 0; i < 3; i++) expect(p[i]).toBeCloseTo(expected[i] ?? 0, 9);
  }

  it('point-point coincident moves the dependent point onto the reference point', () => {
    const r = solveOne('coincident', pt([0, 0, 10]), pt([0, 0, 0]));
    expect(r.converged).toBe(true);
    expectPos(r, [0, 0, 10]);
  });

  it('point-point distance separates along the original direction', () => {
    const r = solveOne('distance', pt([0, 0, 0]), pt([3, 0, 0]), 10);
    expect(r.converged).toBe(true);
    expectPos(r, [7, 0, 0]); // dep ends at x=10, 10 from ref
  });

  it('plane-point coincident drops the point onto the reference plane', () => {
    const r = solveOne('coincident', pl([0, 0, 5], [0, 0, 1]), pt([0, 0, 0]));
    expect(r.converged).toBe(true);
    expectPos(r, [0, 0, 5]);
  });

  it('point-plane coincident moves the dependent plane through the reference point', () => {
    const r = solveOne('coincident', pt([0, 0, 0]), pl([0, 0, 5], [0, 0, 1]));
    expect(r.converged).toBe(true);
    expectPos(r, [0, 0, -5]);
  });

  it('axis-axis coincident makes the axes collinear', () => {
    const r = solveOne('coincident', ax([0, 0, 0], [0, 0, 1]), ax([1, 0, 0], [0, 0, 1]));
    expect(r.converged).toBe(true);
    expectPos(r, [-1, 0, 0]);
  });

  it('axis-axis distance offsets the dependent axis to a perpendicular gap', () => {
    const r = solveOne('distance', ax([0, 0, 0], [0, 0, 1]), ax([0, 0, 0], [0, 0, 1]), 5);
    expect(r.converged).toBe(true);
    const p = pos(r);
    expect(Math.hypot(p[0], p[1])).toBeCloseTo(5, 9); // 5 away from the ref axis
    expect(p[2]).toBeCloseTo(0, 9);
  });

  it('axis-point coincident drops the point onto the axis line', () => {
    const r = solveOne('coincident', ax([0, 0, 0], [0, 0, 1]), pt([3, 0, 0]));
    expect(r.converged).toBe(true);
    expectPos(r, [-3, 0, 0]); // point at (3,0,0) → on the z-axis
  });

  it('axis-point distance places the point at a radial offset', () => {
    const r = solveOne('distance', ax([0, 0, 0], [0, 0, 1]), pt([3, 0, 0]), 10);
    expect(r.converged).toBe(true);
    expectPos(r, [7, 0, 0]); // point at x=10, 10 from the axis
  });

  it('point-axis distance offsets the axis to a perpendicular gap from the point', () => {
    const r = solveOne('distance', pt([0, 0, 0]), ax([0, 0, 0], [0, 0, 1]), 5);
    expect(r.converged).toBe(true);
    const p = pos(r);
    expect(Math.hypot(p[0], p[1])).toBeCloseTo(5, 9);
  });
});
