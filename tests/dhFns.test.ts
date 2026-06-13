import { describe, expect, it } from 'vitest';
import {
  jointsFromDH,
  forwardKinematics,
  mechanismDOF,
  createAssemblyNode,
  addChild,
  addJoint,
  type DHRow,
  type JointPose,
} from '@/index.js';

// ── Independent reference: matrix DH forward kinematics ──
type V3 = [number, number, number];
type M3 = [number, number, number, number, number, number, number, number, number];

function rotMat(axis: V3, angle: number): M3 {
  const l = Math.hypot(...axis) || 1;
  const [x, y, z] = [axis[0] / l, axis[1] / l, axis[2] / l];
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
function matMul(a: M3, b: M3): M3 {
  const o = [0, 0, 0, 0, 0, 0, 0, 0, 0] as unknown as M3;
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return o;
}
function matVec(m: M3, v: V3): V3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}
const DEG = Math.PI / 180;

/** Reference cumulative DH transform of the last frame, as (R, t). */
function referenceDH(rows: DHRow[], values: number[]): { R: M3; t: V3 } {
  let R: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  let t: V3 = [0, 0, 0];
  rows.forEach((row, i) => {
    const q = values[i] ?? 0;
    const theta = (row.type === 'prismatic' ? row.theta : row.theta + q) * DEG;
    const d = row.type === 'prismatic' ? row.d + q : row.d;
    const alpha = row.alpha * DEG;
    const Ri = matMul(rotMat([0, 0, 1], theta), rotMat([1, 0, 0], alpha));
    const ti: V3 = [row.a * Math.cos(theta), row.a * Math.sin(theta), d];
    const Rti = matVec(R, ti);
    t = [t[0] + Rti[0], t[1] + Rti[1], t[2] + Rti[2]];
    R = matMul(R, Ri);
  });
  return { R, t };
}

function applyPose(pose: JointPose, p: V3): V3 {
  const [w, x, y, z] = pose.rotation;
  const tx = 2 * (y * p[2] - z * p[1]);
  const ty = 2 * (z * p[0] - x * p[2]);
  const tz = 2 * (x * p[1] - y * p[0]);
  return [
    p[0] + w * tx + (y * tz - z * ty) + pose.position[0],
    p[1] + w * ty + (z * tx - x * tz) + pose.position[1],
    p[2] + w * tz + (x * ty - y * tx) + pose.position[2],
  ];
}

function assemblyFromDH(rows: DHRow[]) {
  const joints = jointsFromDH(rows);
  let asm = createAssemblyNode('root');
  asm = addChild(asm, createAssemblyNode('base'));
  for (const j of joints) asm = addChild(asm, createAssemblyNode(j.child));
  for (const j of joints) asm = addJoint(asm, j);
  return { asm, joints };
}

/** Assert FK of the last DH link matches the reference for several test points. */
function expectMatchesReference(
  rows: DHRow[],
  values: Record<string, number>,
  vlist: number[]
): void {
  const { asm } = assemblyFromDH(rows);
  const last = rows[rows.length - 1]?.name ?? `link${rows.length}`;
  const pose = forwardKinematics(asm, values).get(last);
  if (!pose) throw new Error(`no pose for ${last}`);
  const ref = referenceDH(rows, vlist);
  for (const p of [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ] as V3[]) {
    const got = applyPose(pose, p);
    const exp = matVec(ref.R, p);
    const expWorld: V3 = [exp[0] + ref.t[0], exp[1] + ref.t[1], exp[2] + ref.t[2]];
    for (let i = 0; i < 3; i++) expect(got[i]).toBeCloseTo(expWorld[i] ?? 0, 6);
  }
}

describe('jointsFromDH', () => {
  it('builds one single-DOF joint per row with the expected parent chain', () => {
    const rows: DHRow[] = [
      { a: 10, alpha: 0, d: 0, theta: 0 },
      { a: 6, alpha: 0, d: 0, theta: 0 },
    ];
    const joints = jointsFromDH(rows);
    expect(joints).toHaveLength(2);
    expect(joints[0]?.parent).toBe('base');
    expect(joints[0]?.child).toBe('link1');
    expect(joints[1]?.parent).toBe('link1');
    expect(joints[1]?.child).toBe('link2');
    expect(joints[0]?.dofs).toHaveLength(1);
    expect(joints[0]?.offset).toBeDefined();
  });

  it('reports rows.length DOF (offset is fixed, not a DOF)', () => {
    const { asm } = assemblyFromDH([
      { a: 10, alpha: 0, d: 0, theta: 0 },
      { a: 6, alpha: 90, d: 2, theta: 0 },
      { a: 0, alpha: 0, d: 0, theta: 0, type: 'prismatic' },
    ]);
    expect(mechanismDOF(asm)).toBe(3);
  });

  it('matches a matrix DH FK for a planar 2R chain across configurations', () => {
    const rows: DHRow[] = [
      { a: 10, alpha: 0, d: 0, theta: 0 },
      { a: 6, alpha: 0, d: 0, theta: 0 },
    ];
    for (const [q1, q2] of [
      [0, 0],
      [30, -45],
      [90, 90],
      [-60, 120],
    ]) {
      expectMatchesReference(rows, { link1: q1, link2: q2 }, [q1, q2]);
    }
  });

  it('matches a matrix DH FK for a spatial chain with twists and offsets', () => {
    const rows: DHRow[] = [
      { a: 0, alpha: 90, d: 5, theta: 0 },
      { a: 8, alpha: 0, d: 0, theta: 0 },
      { a: 3, alpha: -90, d: 2, theta: 0 },
    ];
    for (const cfg of [
      [0, 0, 0],
      [30, 45, -30],
      [90, -60, 120],
    ]) {
      expectMatchesReference(
        rows,
        { link1: cfg[0] ?? 0, link2: cfg[1] ?? 0, link3: cfg[2] ?? 0 },
        cfg
      );
    }
  });

  it('matches a matrix DH FK for a prismatic joint (d varies)', () => {
    const rows: DHRow[] = [
      { a: 0, alpha: 0, d: 0, theta: 0 }, // revolute base
      { a: 0, alpha: 0, d: 0, theta: 0, type: 'prismatic', min: 0, max: 20 },
    ];
    expectMatchesReference(rows, { link1: 45, link2: 7 }, [45, 7]);
  });

  it('honors custom link names', () => {
    const joints = jointsFromDH(
      [
        { a: 1, alpha: 0, d: 0, theta: 0, name: 'shoulder' },
        { a: 1, alpha: 0, d: 0, theta: 0, name: 'elbow' },
      ],
      { base: 'world' }
    );
    expect(joints[0]?.parent).toBe('world');
    expect(joints[0]?.child).toBe('shoulder');
    expect(joints[1]?.parent).toBe('shoulder');
    expect(joints[1]?.child).toBe('elbow');
  });
});
