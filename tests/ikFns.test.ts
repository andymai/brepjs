import { describe, expect, it } from 'vitest';
import {
  revoluteJoint,
  prismaticJoint,
  cylindricalJoint,
  forwardKinematics,
  inverseKinematics,
  jointTrajectory,
  createAssemblyNode,
  addChild,
  addJoint,
  type AssemblyNode,
  type JointPose,
} from '@/index.js';

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

const L1 = 10;
const L2 = 6;
const TIP: [number, number, number] = [L1 + L2, 0, 0];

/** base → link1 (revolute @origin, +Z) → link2 (revolute @L1, +Z): a planar 2R arm. */
function arm2R(): AssemblyNode {
  let asm = createAssemblyNode('root');
  for (const name of ['base', 'link1', 'link2']) asm = addChild(asm, createAssemblyNode(name));
  asm = addJoint(asm, revoluteJoint('base', 'link1', { origin: [0, 0, 0], direction: [0, 0, 1] }));
  asm = addJoint(
    asm,
    revoluteJoint('link1', 'link2', { origin: [L1, 0, 0], direction: [0, 0, 1] })
  );
  return asm;
}

/** World position of the 2R tip for given joint angles (closed form). */
function tipAt(theta1: number, theta2: number): [number, number, number] {
  const poses = forwardKinematics(arm2R(), { link1: theta1, link2: theta2 });
  const p = poses.get('link2');
  if (!p) throw new Error('no link2');
  return applyPose(p, TIP);
}

describe('inverseKinematics — planar 2R', () => {
  it('solves joint values whose FK reaches a reachable target (exit criterion)', () => {
    const target = tipAt(35, -50); // a known-reachable pose
    const result = inverseKinematics(arm2R(), 'link2', { position: target }, { tip: TIP });

    expect(result.converged).toBe(true);
    expect(result.error).toBeLessThan(1e-4);

    // The returned joint values, run through FK, must land on the target.
    const poses = forwardKinematics(arm2R(), result.values);
    const tip = applyPose(
      poses.get('link2') ?? { position: [0, 0, 0], rotation: [1, 0, 0, 0] },
      TIP
    );
    for (let i = 0; i < 3; i++) expect(tip[i]).toBeCloseTo(target[i] ?? 0, 4);
  });

  it('reaches a spread of reachable targets in the workspace', () => {
    const configs: Array<[number, number]> = [
      [0, 30],
      [60, -40],
      [-45, 70],
      [90, 90],
      [120, -110],
    ];
    for (const [t1, t2] of configs) {
      const target = tipAt(t1, t2);
      const result = inverseKinematics(arm2R(), 'link2', { position: target }, { tip: TIP });
      expect(result.converged).toBe(true);
      const poses = forwardKinematics(arm2R(), result.values);
      const tip = applyPose(
        poses.get('link2') ?? { position: [0, 0, 0], rotation: [1, 0, 0, 0] },
        TIP
      );
      for (let i = 0; i < 3; i++) expect(tip[i]).toBeCloseTo(target[i] ?? 0, 4);
    }
  });

  it('does not converge for an out-of-reach target and reports the residual', () => {
    // Max reach is L1+L2 = 16; ask for 100 units away.
    const result = inverseKinematics(arm2R(), 'link2', { position: [100, 0, 0] }, { tip: TIP });
    expect(result.converged).toBe(false);
    expect(result.error).toBeGreaterThan(80); // ~ 100 - 16
  });

  it('respects joint range limits (clamped DOFs cannot overreach)', () => {
    let asm = createAssemblyNode('root');
    for (const name of ['base', 'link1', 'link2']) asm = addChild(asm, createAssemblyNode(name));
    // Both joints restricted to small positive angles.
    asm = addJoint(
      asm,
      revoluteJoint(
        'base',
        'link1',
        { origin: [0, 0, 0], direction: [0, 0, 1] },
        { min: 0, max: 20 }
      )
    );
    asm = addJoint(
      asm,
      revoluteJoint(
        'link1',
        'link2',
        { origin: [L1, 0, 0], direction: [0, 0, 1] },
        { min: 0, max: 20 }
      )
    );
    // A target straight up requires angles far beyond 20° — unreachable under limits.
    const result = inverseKinematics(asm, 'link2', { position: [0, 16, 0] }, { tip: TIP });
    const v = result.values;
    for (const angle of [...(v.link1 ?? []), ...(v.link2 ?? [])]) {
      expect(angle).toBeGreaterThanOrEqual(-1e-9);
      expect(angle).toBeLessThanOrEqual(20 + 1e-9);
    }
  });
});

describe('inverseKinematics — prismatic and multi-DOF', () => {
  it('solves a prismatic slide to a target distance', () => {
    let asm = createAssemblyNode('root');
    asm = addChild(asm, createAssemblyNode('base'));
    asm = addChild(asm, createAssemblyNode('slide'));
    asm = addJoint(
      asm,
      prismaticJoint('base', 'slide', { origin: [0, 0, 0], direction: [0, 0, 1] }, { max: 50 })
    );
    const result = inverseKinematics(asm, 'slide', { position: [0, 0, 25] });
    expect(result.converged).toBe(true);
    expect(result.values.slide?.[0]).toBeCloseTo(25, 3);
  });

  it('drives a cylindrical joint (2 DOF) to a target position', () => {
    let asm = createAssemblyNode('root');
    asm = addChild(asm, createAssemblyNode('base'));
    asm = addChild(asm, createAssemblyNode('bolt'));
    asm = addJoint(
      asm,
      cylindricalJoint('base', 'bolt', { origin: [0, 0, 0], direction: [0, 0, 1] })
    );
    // Target reachable by rotating ~90° about Z and sliding +5 along Z.
    const target = applyPose(
      forwardKinematics(asm, { bolt: [90, 5] }).get('bolt') ?? {
        position: [0, 0, 0],
        rotation: [1, 0, 0, 0],
      },
      [1, 0, 0]
    );
    const result = inverseKinematics(asm, 'bolt', { position: target }, { tip: [1, 0, 0] });
    expect(result.converged).toBe(true);
    const tip = applyPose(
      forwardKinematics(asm, result.values).get('bolt') ?? {
        position: [0, 0, 0],
        rotation: [1, 0, 0, 0],
      },
      [1, 0, 0]
    );
    for (let i = 0; i < 3; i++) expect(tip[i]).toBeCloseTo(target[i] ?? 0, 3);
  });
});

describe('jointTrajectory', () => {
  it('produces steps+1 samples with clamped endpoints', () => {
    const samples = jointTrajectory(arm2R(), { link1: 0, link2: 0 }, { link1: 90, link2: 45 }, 4);
    expect(samples).toHaveLength(5);
    expect(samples[0]?.t).toBe(0);
    expect(samples[4]?.t).toBe(1);
    expect(samples[0]?.values.link1).toEqual([0]);
    expect(samples[4]?.values.link1).toEqual([90]);
    expect(samples[4]?.values.link2).toEqual([45]);
  });

  it('interpolates linearly in joint space', () => {
    const samples = jointTrajectory(arm2R(), { link1: 0, link2: 0 }, { link1: 100, link2: 40 }, 10);
    const mid = samples[5];
    expect(mid?.values.link1?.[0]).toBeCloseTo(50, 9);
    expect(mid?.values.link2?.[0]).toBeCloseTo(20, 9);
  });

  it('each sample carries forward-kinematics poses matching its joint values', () => {
    const samples = jointTrajectory(arm2R(), { link1: 0 }, { link1: 90 }, 3);
    for (const s of samples) {
      const tip = applyPose(
        s.poses.get('link2') ?? { position: [0, 0, 0], rotation: [1, 0, 0, 0] },
        TIP
      );
      const expected = tipAt(s.values.link1?.[0] ?? 0, s.values.link2?.[0] ?? 0);
      for (let i = 0; i < 3; i++) expect(tip[i]).toBeCloseTo(expected[i] ?? 0, 6);
    }
  });
});
