import { describe, expect, it } from 'vitest';
import {
  revoluteJoint,
  prismaticJoint,
  cylindricalJoint,
  planarJoint,
  sphericalJoint,
  setJointValue,
  setJointValues,
  jointTransform,
  addJoint,
  forwardKinematics,
  mechanismDOF,
  createAssemblyNode,
  addChild,
  type Joint,
  type JointPose,
} from '@/index.js';

/** Apply a joint pose (rotate then translate) to a point. */
function applyPose(
  pose: JointPose,
  p: readonly [number, number, number]
): [number, number, number] {
  const [w, x, y, z] = pose.rotation;
  const tx = 2 * (y * p[2] - z * p[1]);
  const ty = 2 * (z * p[0] - x * p[2]);
  const tz = 2 * (x * p[1] - y * p[0]);
  const r: [number, number, number] = [
    p[0] + w * tx + (y * tz - z * ty),
    p[1] + w * ty + (z * tx - x * tz),
    p[2] + w * tz + (x * ty - y * tx),
  ];
  return [r[0] + pose.position[0], r[1] + pose.position[1], r[2] + pose.position[2]];
}

function expectVecClose(a: readonly number[], b: readonly number[], digits = 6): void {
  for (let i = 0; i < 3; i++) expect(a[i]).toBeCloseTo(b[i] ?? 0, digits);
}

function poseOf(poses: Map<string, JointPose>, name: string): JointPose {
  const p = poses.get(name);
  if (!p) throw new Error(`no pose for ${name}`);
  return p;
}

describe('jointFns — construction', () => {
  it('revoluteJoint normalizes the axis direction and defaults the range', () => {
    const j = revoluteJoint('base', 'arm', { origin: [0, 0, 0], direction: [0, 0, 2] });
    expect(j.type).toBe('revolute');
    expect(j.parent).toBe('base');
    expect(j.child).toBe('arm');
    expectVecClose(j.axis.direction, [0, 0, 1]); // unit-normalized
    expect(j.min).toBe(-180);
    expect(j.max).toBe(180);
    expect(j.value).toBe(0);
  });

  it('prismaticJoint defaults to a 0..100 travel range', () => {
    const j = prismaticJoint('base', 'slide', { origin: [0, 0, 0], direction: [1, 0, 0] });
    expect(j.type).toBe('prismatic');
    expect(j.min).toBe(0);
    expect(j.max).toBe(100);
  });

  it('clamps the initial value to the range', () => {
    const j = revoluteJoint(
      'a',
      'b',
      { origin: [0, 0, 0], direction: [0, 0, 1] },
      { min: -45, max: 45, value: 90 }
    );
    expect(j.value).toBe(45);
  });

  it('normalizes an inverted (min > max) range so value stays in bounds', () => {
    const j = revoluteJoint(
      'a',
      'b',
      { origin: [0, 0, 0], direction: [0, 0, 1] },
      { min: 90, max: -90, value: 0 }
    );
    expect(j.min).toBe(-90);
    expect(j.max).toBe(90);
    expect(j.value).toBe(0);
    expect(setJointValue(j, 45).value).toBe(45);
  });

  it('setJointValue clamps and is immutable', () => {
    const j = revoluteJoint(
      'a',
      'b',
      { origin: [0, 0, 0], direction: [0, 0, 1] },
      { min: 0, max: 90 }
    );
    const j2 = setJointValue(j, 200);
    expect(j2.value).toBe(90);
    expect(j.value).toBe(0); // original unchanged
    expect(setJointValue(j, -50).value).toBe(0);
    expect(setJointValue(j, 30).value).toBe(30);
  });
});

describe('jointFns — revolute kinematics', () => {
  it('rotates about an axis through the origin (exit criterion)', () => {
    const j = setJointValue(
      revoluteJoint('base', 'arm', { origin: [0, 0, 0], direction: [0, 0, 1] }),
      90
    );
    const pose = jointTransform(j);
    // A point 1 unit out on +X rotates 90° about +Z to +Y.
    expectVecClose(applyPose(pose, [1, 0, 0]), [0, 1, 0]);
    // The axis point itself is fixed.
    expectVecClose(applyPose(pose, [0, 0, 0]), [0, 0, 0]);
  });

  it('rotates about an axis offset from the origin', () => {
    // Z-axis through (5,0,0); a point 1 unit out at (6,0,0) sweeps to (5,1,0).
    const j = revoluteJoint(
      'base',
      'arm',
      { origin: [5, 0, 0], direction: [0, 0, 1] },
      { value: 90 }
    );
    const pose = jointTransform(j);
    expectVecClose(applyPose(pose, [6, 0, 0]), [5, 1, 0]);
    // Points on the axis line stay put.
    expectVecClose(applyPose(pose, [5, 0, 3]), [5, 0, 3]);
  });

  it('accepts an explicit value argument (clamped)', () => {
    const j = revoluteJoint(
      'base',
      'arm',
      { origin: [0, 0, 0], direction: [0, 0, 1] },
      { max: 90 }
    );
    // Request 180 but range caps at 90 → quarter turn, not half.
    expectVecClose(applyPose(jointTransform(j, 180), [1, 0, 0]), [0, 1, 0]);
  });
});

describe('jointFns — prismatic kinematics', () => {
  it('translates along the axis with no rotation', () => {
    const j = setJointValue(
      prismaticJoint('base', 'slide', { origin: [0, 0, 0], direction: [0, 0, 1] }),
      10
    );
    const pose = jointTransform(j);
    expect(pose.rotation).toEqual([1, 0, 0, 0]);
    expectVecClose(applyPose(pose, [1, 2, 3]), [1, 2, 13]);
  });

  it('translates along a non-unit axis direction (normalized)', () => {
    const j = prismaticJoint(
      'base',
      'slide',
      { origin: [0, 0, 0], direction: [0, 0, 5] },
      { value: 4 }
    );
    expectVecClose(jointTransform(j).position, [0, 0, 4]); // moves 4 units, not 20
  });
});

describe('jointFns — multi-DOF construction', () => {
  it('cylindricalJoint has [rotation, translation] DOFs with default ranges', () => {
    const j = cylindricalJoint('base', 'bolt', { origin: [0, 0, 0], direction: [0, 0, 2] });
    expect(j.type).toBe('cylindrical');
    expect(j.dofs).toHaveLength(2);
    expect(j.dofs[0]?.kind).toBe('rotation');
    expect(j.dofs[1]?.kind).toBe('translation');
    expectVecClose(j.dofs[0]?.axis ?? [], [0, 0, 1]); // unit-normalized
    expect(j.dofs[0]?.min).toBe(-180);
    expect(j.dofs[1]?.max).toBe(100);
    // primary mirror tracks dofs[0]
    expect(j.value).toBe(j.dofs[0]?.value);
    expect(j.min).toBe(-180);
  });

  it('planarJoint has [u, v, rotation] DOFs about the normal', () => {
    const j = planarJoint(
      'base',
      'slide',
      { origin: [0, 0, 0], direction: [0, 0, 1] },
      { uDirection: [1, 0, 0] }
    );
    expect(j.type).toBe('planar');
    expect(j.dofs.map((d) => d.kind)).toEqual(['translation', 'translation', 'rotation']);
    expectVecClose(j.dofs[0]?.axis ?? [], [1, 0, 0]); // u
    expectVecClose(j.dofs[1]?.axis ?? [], [0, 1, 0]); // v = n × u
    expectVecClose(j.dofs[2]?.axis ?? [], [0, 0, 1]); // rotation about normal
  });

  it('sphericalJoint has three rotation DOFs about the pivot', () => {
    const j = sphericalJoint('base', 'ball', [1, 2, 3]);
    expect(j.type).toBe('spherical');
    expect(j.dofs.map((d) => d.kind)).toEqual(['rotation', 'rotation', 'rotation']);
    expectVecClose(j.axis.origin, [1, 2, 3]); // pivot
  });

  it('setJointValues clamps positionally and is immutable', () => {
    const j = cylindricalJoint(
      'a',
      'b',
      { origin: [0, 0, 0], direction: [0, 0, 1] },
      { rotation: { min: -90, max: 90 }, translation: { min: 0, max: 10 } }
    );
    const j2 = setJointValues(j, [200, 20]);
    expect(j2.dofs[0]?.value).toBe(90); // clamped
    expect(j2.dofs[1]?.value).toBe(10); // clamped
    expect(j2.value).toBe(90); // primary mirror in sync
    expect(j.dofs[0]?.value).toBe(0); // original unchanged
    // omitted entry keeps stored value
    const j3 = setJointValues(setJointValues(j, [45, 5]), [10]);
    expect(j3.dofs[0]?.value).toBe(10);
    expect(j3.dofs[1]?.value).toBe(5);
  });
});

describe('jointFns — multi-DOF kinematics', () => {
  it('cylindrical rotates about and slides along its axis', () => {
    const j = setJointValues(
      cylindricalJoint('base', 'bolt', { origin: [0, 0, 0], direction: [0, 0, 1] }),
      [90, 5]
    );
    // [1,0,0] rotates 90° about +Z to [0,1,0], then slides +5 along Z.
    expectVecClose(applyPose(jointTransform(j), [1, 0, 0]), [0, 1, 5]);
  });

  it('cylindrical rotation pivots about an offset axis line', () => {
    const j = cylindricalJoint('base', 'bolt', { origin: [2, 0, 0], direction: [0, 0, 1] });
    // rotation only: point 1 unit out at (3,0,0) sweeps about the line x=2 to (2,1,0).
    expectVecClose(applyPose(jointTransform(j, [90, 0]), [3, 0, 0]), [2, 1, 0]);
  });

  it('a bare number overrides only the primary (rotation) DOF', () => {
    const j = setJointValues(
      cylindricalJoint('base', 'bolt', { origin: [0, 0, 0], direction: [0, 0, 1] }),
      [0, 7] // stored slide of 7
    );
    // Passing 90 sets rotation but leaves the stored slide untouched.
    expectVecClose(applyPose(jointTransform(j, 90), [1, 0, 0]), [0, 1, 7]);
  });

  it('planar translates in-plane (independent of rotation) and rotates about the normal', () => {
    const j = setJointValues(
      planarJoint(
        'base',
        'slide',
        { origin: [0, 0, 0], direction: [0, 0, 1] },
        { uDirection: [1, 0, 0] }
      ),
      [3, 4, 90]
    );
    const pose = jointTransform(j);
    // [1,0,0] rotates to [0,1,0] then shifts by the in-plane (3,4): → (3,5,0).
    expectVecClose(applyPose(pose, [1, 0, 0]), [3, 5, 0]);
    // translation is applied in the plane frame, so the pivot moves by (3,4,0).
    expectVecClose(applyPose(pose, [0, 0, 0]), [3, 4, 0]);
  });

  it('planar rotates about the normal through an offset plane origin', () => {
    const j = setJointValues(
      planarJoint(
        'base',
        'slide',
        { origin: [5, 0, 0], direction: [0, 0, 1] },
        { uDirection: [1, 0, 0] }
      ),
      [0, 0, 90] // rotation only, no in-plane translation
    );
    const pose = jointTransform(j);
    // 90° about the Z line through (5,0,0): a point 1 unit out at (6,0,0) → (5,1,0).
    expectVecClose(applyPose(pose, [6, 0, 0]), [5, 1, 0]);
    // The plane origin is the pivot and stays fixed.
    expectVecClose(applyPose(pose, [5, 0, 0]), [5, 0, 0]);
  });

  it('spherical drives each axis and composes Rx·Ry·Rz about the pivot', () => {
    const pivot: [number, number, number] = [0, 0, 0];
    // Single-axis: +90 about X sends +Y to +Z.
    const jx = setJointValues(sphericalJoint('b', 'c', pivot), [90, 0, 0]);
    expectVecClose(applyPose(jointTransform(jx), [0, 1, 0]), [0, 0, 1]);

    // Combined: cross-check against an independent Rx·Ry·Rz matrix.
    const [ax, ay, az] = [30, 45, -60];
    const j = setJointValues(sphericalJoint('b', 'c', pivot), [ax, ay, az]);
    const M = matMul(
      matMul(rotMat([1, 0, 0], (ax * Math.PI) / 180), rotMat([0, 1, 0], (ay * Math.PI) / 180)),
      rotMat([0, 0, 1], (az * Math.PI) / 180)
    );
    const p: V3 = [1, -2, 3];
    expectVecClose(applyPose(jointTransform(j), p), matVec(M, p));
  });

  it('spherical pivots about an offset point', () => {
    const j = setJointValues(sphericalJoint('b', 'c', [0, 0, 5]), [0, 0, 90]);
    const pose = jointTransform(j);
    expectVecClose(applyPose(pose, [1, 0, 5]), [0, 1, 5]); // 90° about Z through (0,0,5)
    expectVecClose(applyPose(pose, [0, 0, 5]), [0, 0, 5]); // pivot is fixed
  });
});

describe('jointFns — multi-DOF in forward kinematics', () => {
  it('propagates a cylindrical joint, overriding via an array keyed by child', () => {
    let asm = createAssemblyNode('root');
    asm = addChild(asm, createAssemblyNode('base'));
    asm = addChild(asm, createAssemblyNode('bolt'));
    asm = addJoint(
      asm,
      cylindricalJoint('base', 'bolt', { origin: [0, 0, 0], direction: [0, 0, 1] })
    );
    const poses = forwardKinematics(asm, { bolt: [90, 5] });
    expectVecClose(applyPose(poseOf(poses, 'bolt'), [1, 0, 0]), [0, 1, 5]);
  });

  it('mechanismDOF sums per-joint DOF counts', () => {
    let asm = createAssemblyNode('root');
    asm = addJoint(asm, revoluteJoint('a', 'b', { origin: [0, 0, 0], direction: [0, 0, 1] }));
    asm = addJoint(asm, cylindricalJoint('b', 'c', { origin: [0, 0, 0], direction: [0, 0, 1] }));
    asm = addJoint(asm, sphericalJoint('c', 'd', [0, 0, 0]));
    expect(mechanismDOF(asm)).toBe(1 + 2 + 3);
  });
});

describe('jointFns — assembly integration', () => {
  it('addJoint attaches a joint immutably', () => {
    let asm = createAssemblyNode('root');
    asm = addChild(asm, createAssemblyNode('base'));
    asm = addChild(asm, createAssemblyNode('arm'));
    const before = asm;
    const j: Joint = revoluteJoint('base', 'arm', { origin: [0, 0, 0], direction: [0, 0, 1] });
    asm = addJoint(asm, j);
    expect(before.joints).toBeUndefined();
    expect(asm.joints).toHaveLength(1);
    expect((asm.joints as Joint[])[0]).toBe(j);
  });
});

describe('jointFns — forward kinematics', () => {
  const L1 = 10;
  const L2 = 6;

  /** base → link1 (revolute at origin) → link2 (revolute at L1 along link1). */
  function arm(theta1: number, theta2: number) {
    let asm = createAssemblyNode('root');
    asm = addChild(asm, createAssemblyNode('base'));
    asm = addChild(asm, createAssemblyNode('link1'));
    asm = addChild(asm, createAssemblyNode('link2'));
    asm = addJoint(
      asm,
      revoluteJoint('base', 'link1', { origin: [0, 0, 0], direction: [0, 0, 1] }, { value: theta1 })
    );
    asm = addJoint(
      asm,
      revoluteJoint(
        'link1',
        'link2',
        { origin: [L1, 0, 0], direction: [0, 0, 1] },
        { value: theta2 }
      )
    );
    return asm;
  }

  /** Closed-form planar 2R forward kinematics for the end-effector tip. */
  function expected2R(theta1: number, theta2: number): [number, number, number] {
    const r1 = (theta1 * Math.PI) / 180;
    const r12 = ((theta1 + theta2) * Math.PI) / 180;
    return [L1 * Math.cos(r1) + L2 * Math.cos(r12), L1 * Math.sin(r1) + L2 * Math.sin(r12), 0];
  }

  it('positions a 2-DOF planar arm at the closed-form 2R solution', () => {
    const cases: Array<[number, number]> = [
      [0, 0],
      [90, 0],
      [0, 90],
      [45, 45],
      [30, -60],
      [120, 90],
    ];
    for (const [t1, t2] of cases) {
      const poses = forwardKinematics(arm(t1, t2));
      // link2's frame coincides with the base frame at zero joint values, so
      // the tip's local coordinate is its rest-pose world position (L1+L2,0,0).
      const tip = applyPose(poseOf(poses, 'link2'), [L1 + L2, 0, 0]);
      expectVecClose(tip, expected2R(t1, t2));
    }
  });

  it('leaves the chain root (base) at the origin', () => {
    const poses = forwardKinematics(arm(45, 45));
    expect(poseOf(poses, 'base')).toEqual({ position: [0, 0, 0], rotation: [1, 0, 0, 0] });
  });

  it('jointValues overrides stored values, keyed by child node', () => {
    const poses = forwardKinematics(arm(0, 0), { link1: 90, link2: 0 });
    const tip = applyPose(poseOf(poses, 'link2'), [L1 + L2, 0, 0]);
    expectVecClose(tip, expected2R(90, 0));
  });
});

// ---------------------------------------------------------------------------
// Independent 4x4-style FK (rotation matrix + translation) used to cross-check
// the production quaternion-based forwardKinematics on a 6-DOF spatial chain.
// ---------------------------------------------------------------------------

type V3 = [number, number, number];
type M3 = [number, number, number, number, number, number, number, number, number]; // row-major

function unit3(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** Rodrigues' rotation matrix for `angle` radians about (normalized) `axis`. */
function rotMat(axis: V3, angle: number): M3 {
  const [x, y, z] = unit3(axis);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  return [
    t * x * x + c,
    t * x * y - s * z,
    t * x * z + s * y,
    t * x * y + s * z,
    t * y * y + c,
    t * y * z - s * x,
    t * x * z - s * y,
    t * y * z + s * x,
    t * z * z + c,
  ];
}

function matVec(m: M3, v: V3): V3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

function matMul(a: M3, b: M3): M3 {
  const out = [0, 0, 0, 0, 0, 0, 0, 0, 0] as unknown as M3;
  for (let r = 0; r < 3; r++)
    for (let col = 0; col < 3; col++)
      out[r * 3 + col] = a[r * 3] * b[col] + a[r * 3 + 1] * b[3 + col] + a[r * 3 + 2] * b[6 + col];
  return out;
}

interface Link {
  child: string;
  joint: Joint;
}

/** Reference FK by composing per-joint (R, t) rigid transforms with matrices. */
function matrixFK(links: readonly Link[], values: Record<string, number>, tip: V3): V3 {
  let R: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  let t: V3 = [0, 0, 0];
  for (const { child, joint } of links) {
    const v = values[child] ?? joint.value;
    let Rl: M3;
    let tl: V3;
    if (joint.type === 'prismatic') {
      Rl = [1, 0, 0, 0, 1, 0, 0, 0, 1];
      const d = unit3(joint.axis.direction as V3);
      tl = [d[0] * v, d[1] * v, d[2] * v];
    } else {
      Rl = rotMat(joint.axis.direction as V3, (v * Math.PI) / 180);
      const o = joint.axis.origin as V3;
      const ro = matVec(Rl, o);
      tl = [o[0] - ro[0], o[1] - ro[1], o[2] - ro[2]];
    }
    // world = parent ∘ local: t += R·tl, R = R·Rl
    const Rtl = matVec(R, tl);
    t = [t[0] + Rtl[0], t[1] + Rtl[1], t[2] + Rtl[2]];
    R = matMul(R, Rl);
  }
  const Rtip = matVec(R, tip);
  return [Rtip[0] + t[0], Rtip[1] + t[1], Rtip[2] + t[2]];
}

describe('jointFns — forward kinematics (6-DOF spatial chain)', () => {
  // A 6-axis arm with axes Z, Y, Y, prismatic-X, X, Y and joint origins along
  // +X in each parent frame. The mix of Z/Y/X rotation axes is non-coplanar, so
  // the test exercises full 3D quaternion composition, not just planar rotation.
  const links: Link[] = [
    {
      child: 'l1',
      joint: revoluteJoint('base', 'l1', { origin: [0, 0, 0], direction: [0, 0, 1] }),
    },
    { child: 'l2', joint: revoluteJoint('l1', 'l2', { origin: [2, 0, 0], direction: [0, 1, 0] }) },
    { child: 'l3', joint: revoluteJoint('l2', 'l3', { origin: [4, 0, 0], direction: [0, 1, 0] }) },
    {
      child: 'l4',
      joint: prismaticJoint('l3', 'l4', { origin: [6, 0, 0], direction: [1, 0, 0] }, { max: 5 }),
    },
    { child: 'l5', joint: revoluteJoint('l4', 'l5', { origin: [7, 0, 0], direction: [1, 0, 0] }) },
    { child: 'l6', joint: revoluteJoint('l5', 'l6', { origin: [8, 0, 0], direction: [0, 1, 0] }) },
  ];
  const tip: V3 = [9, 0, 0];

  function chain(): ReturnType<typeof createAssemblyNode> {
    let asm = createAssemblyNode('root');
    for (const name of ['base', 'l1', 'l2', 'l3', 'l4', 'l5', 'l6'])
      asm = addChild(asm, createAssemblyNode(name));
    for (const { joint } of links) asm = addJoint(asm, joint);
    return asm;
  }

  it('reports 6 degrees of freedom', () => {
    expect(mechanismDOF(chain())).toBe(6);
  });

  it('matches an independent matrix FK across joint configurations', () => {
    const configs: Array<Record<string, number>> = [
      {},
      { l1: 30, l2: 45, l3: -30, l4: 3, l5: 60, l6: -45 },
      { l1: 90, l2: -90, l3: 20, l4: 5, l5: 15, l6: 80 },
      { l1: -120, l2: 70, l3: 70, l4: 1, l5: -50, l6: 110 },
    ];
    const asm = chain();
    for (const cfg of configs) {
      const poses = forwardKinematics(asm, cfg);
      const fkTip = applyPose(poseOf(poses, 'l6'), tip);
      expectVecClose(fkTip, matrixFK(links, cfg, tip), 6);
    }
  });
});

describe('jointFns — mechanism DOF', () => {
  it('sums joint freedoms (open-chain mobility)', () => {
    let asm = createAssemblyNode('root');
    expect(mechanismDOF(asm)).toBe(0);
    asm = addJoint(asm, revoluteJoint('a', 'b', { origin: [0, 0, 0], direction: [0, 0, 1] }));
    asm = addJoint(asm, revoluteJoint('b', 'c', { origin: [0, 0, 0], direction: [0, 0, 1] }));
    expect(mechanismDOF(asm)).toBe(2);
    asm = addJoint(asm, prismaticJoint('c', 'd', { origin: [0, 0, 0], direction: [1, 0, 0] }));
    expect(mechanismDOF(asm)).toBe(3);
  });
});
