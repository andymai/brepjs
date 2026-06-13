import { describe, expect, it } from 'vitest';
import {
  exportURDF,
  importURDF,
  jointsFromDH,
  revoluteJoint,
  prismaticJoint,
  cylindricalJoint,
  createAssemblyNode,
  addChild,
  addJoint,
  isOk,
  isErr,
  unwrap,
  unwrapErr,
  type Joint,
} from '@/index.js';

/** A 2-joint arm: base →(revolute)→ link1 →(prismatic)→ link2. */
function arm(): ReturnType<typeof createAssemblyNode> {
  let asm = createAssemblyNode('root');
  for (const n of ['base', 'link1', 'link2']) asm = addChild(asm, createAssemblyNode(n));
  asm = addJoint(
    asm,
    revoluteJoint(
      'base',
      'link1',
      { origin: [0, 0, 1], direction: [0, 0, 1] },
      { min: -90, max: 90 }
    )
  );
  asm = addJoint(
    asm,
    prismaticJoint(
      'link1',
      'link2',
      { origin: [2, 0, 0], direction: [1, 0, 0] },
      { min: 0, max: 50 }
    )
  );
  return asm;
}

function byChild(joints: readonly Joint[], child: string): Joint {
  const j = joints.find((x) => x.child === child);
  if (!j) throw new Error(`no joint to ${child}`);
  return j;
}

describe('exportURDF', () => {
  it('emits links and joints with parents, axes, and limits', () => {
    const xml = unwrap(exportURDF(arm(), { name: 'myrobot' }));
    expect(xml).toContain('<robot name="myrobot">');
    expect(xml).toContain('<link name="base"/>');
    expect(xml).toContain('<link name="link1"/>');
    expect(xml).toContain('type="revolute"');
    expect(xml).toContain('type="prismatic"');
    expect(xml).toContain('<parent link="base"/>');
    expect(xml).toContain('<child link="link1"/>');
    expect(xml).toContain('<axis xyz="0 0 1"/>');
  });

  it('writes a <visual> mesh reference when provided', () => {
    const xml = unwrap(exportURDF(arm(), { meshes: { link1: 'link1.stl' } }));
    expect(xml).toContain('<mesh filename="link1.stl"/>');
  });

  it('rejects multi-DOF joints', () => {
    let asm = createAssemblyNode('root');
    asm = addChild(asm, createAssemblyNode('base'));
    asm = addChild(asm, createAssemblyNode('bolt'));
    asm = addJoint(
      asm,
      cylindricalJoint('base', 'bolt', { origin: [0, 0, 0], direction: [0, 0, 1] })
    );
    const r = exportURDF(asm);
    expect(isErr(r)).toBe(true);
    expect(unwrapErr(r).message).toContain('cylindrical');
  });

  it('rejects joints carrying a fixed offset (DH links)', () => {
    let asm = createAssemblyNode('root');
    asm = addChild(asm, createAssemblyNode('base'));
    asm = addChild(asm, createAssemblyNode('link1'));
    for (const j of jointsFromDH([{ a: 5, alpha: 90, d: 1, theta: 0 }])) asm = addJoint(asm, j);
    const r = exportURDF(asm);
    expect(isErr(r)).toBe(true);
    expect(unwrapErr(r).message).toContain('offset');
  });
});

describe('importURDF', () => {
  it('parses a hand-written URDF into links and joints', () => {
    const xml = `<?xml version="1.0"?>
<robot name="r">
  <link name="base"/>
  <link name="arm"/>
  <joint name="j1" type="revolute">
    <parent link="base"/>
    <child link="arm"/>
    <origin xyz="0 0 1" rpy="0 0 0"/>
    <axis xyz="0 0 1"/>
    <limit lower="-1.5707963" upper="1.5707963" effort="0" velocity="0"/>
  </joint>
</robot>`;
    const doc = unwrap(importURDF(xml));
    expect(doc.name).toBe('r');
    expect(doc.links).toEqual(['base', 'arm']);
    expect(doc.joints).toHaveLength(1);
    const j = doc.joints[0];
    expect(j?.type).toBe('revolute');
    expect(j?.min).toBeCloseTo(-90, 3); // radians → degrees
    expect(j?.max).toBeCloseTo(90, 3);
  });

  it('maps continuous to a full-range revolute and skips fixed joints', () => {
    const xml = `<robot name="r">
  <link name="a"/><link name="b"/><link name="c"/>
  <joint name="spin" type="continuous">
    <parent link="a"/><child link="b"/><axis xyz="1 0 0"/>
  </joint>
  <joint name="weld" type="fixed">
    <parent link="b"/><child link="c"/>
  </joint>
</robot>`;
    const doc = unwrap(importURDF(xml));
    expect(doc.joints).toHaveLength(1); // fixed skipped
    expect(doc.joints[0]?.type).toBe('revolute');
    expect(doc.joints[0]?.min).toBe(-180);
    expect(doc.joints[0]?.max).toBe(180);
  });

  it('errors on a document without a <robot> element', () => {
    expect(isErr(importURDF('<not-urdf/>'))).toBe(true);
  });

  it('errors on an unrecognized joint type instead of silently treating it as revolute', () => {
    const xml = `<robot name="r">
  <link name="a"/><link name="b"/>
  <joint name="typo" type="revolutte">
    <parent link="a"/><child link="b"/><axis xyz="0 0 1"/>
  </joint>
</robot>`;
    const r = importURDF(xml);
    expect(isErr(r)).toBe(true);
    expect(unwrapErr(r).message).toContain('revolutte');
  });
});

describe('URDF round-trip', () => {
  it('preserves parents, axes, and limits for revolute and prismatic joints', () => {
    const r = exportURDF(arm());
    expect(isOk(r)).toBe(true);
    const doc = unwrap(importURDF(unwrap(r)));

    expect(doc.links).toContain('base');
    expect(doc.links).toContain('link1');
    expect(doc.links).toContain('link2');

    const rev = byChild(doc.joints, 'link1');
    expect(rev.type).toBe('revolute');
    expect(rev.parent).toBe('base');
    expect(rev.axis.direction[0]).toBeCloseTo(0, 6);
    expect(rev.axis.direction[2]).toBeCloseTo(1, 6);
    expect(rev.axis.origin[2]).toBeCloseTo(1, 6);
    expect(rev.min).toBeCloseTo(-90, 4);
    expect(rev.max).toBeCloseTo(90, 4);

    const pris = byChild(doc.joints, 'link2');
    expect(pris.type).toBe('prismatic');
    expect(pris.parent).toBe('link1');
    expect(pris.axis.direction[0]).toBeCloseTo(1, 6);
    expect(pris.min).toBeCloseTo(0, 6);
    expect(pris.max).toBeCloseTo(50, 6);
  });
});
