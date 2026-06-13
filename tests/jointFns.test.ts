import { describe, expect, it } from 'vitest';
import {
  revoluteJoint,
  prismaticJoint,
  setJointValue,
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

  function poseOf(poses: Map<string, JointPose>, name: string): JointPose {
    const p = poses.get(name);
    if (!p) throw new Error(`no pose for ${name}`);
    return p;
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
