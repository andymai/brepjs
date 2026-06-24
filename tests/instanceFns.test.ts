// Transform-only instancing: one source + N placements, materialized on demand.

import { describe, it, expect, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import {
  box,
  instance,
  instanceGrid,
  materialize,
  instancedMesh,
  instanceCount,
  isInstanced,
  measureVolume,
  unwrap,
  getDisposalStats,
} from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

describe('instance / accessors', () => {
  it('wraps one source + N translate placements (Vec3 sugar)', () => {
    const inst = instance(box(10, 10, 10), [
      [0, 0, 0],
      [20, 0, 0],
      [40, 0, 0],
    ]);
    expect(isInstanced(inst)).toBe(true);
    expect(instanceCount(inst)).toBe(3);
    expect(inst.placements[1]).toEqual([
      [1, 0, 0, 20],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ]);
  });

  it('instanceGrid produces cols*rows placements + grid metadata', () => {
    const inst = instanceGrid(box(42, 42, 7), { cols: 3, rows: 2, pitchX: 42, pitchY: 42 });
    expect(instanceCount(inst)).toBe(6);
    expect(inst.grid).toEqual({ cols: 3, rows: 2, pitchX: 42, pitchY: 42 });
  });
});

describe('materialize', () => {
  it('default is a Compound of placed copies (volume = N * cell)', () => {
    const inst = instance(box(10, 10, 10), [
      [0, 0, 0],
      [20, 0, 0],
      [40, 0, 0],
    ]);
    const solid = unwrap(materialize(inst));
    expect(unwrap(measureVolume(solid))).toBeCloseTo(3000, 3);
  });

  it('fuse:true on a touching grid yields one solid of the total volume', () => {
    const inst = instanceGrid(box(42, 42, 7), { cols: 2, rows: 2, pitchX: 42, pitchY: 42 });
    const solid = unwrap(materialize(inst, { fuse: true }));
    expect(unwrap(measureVolume(solid))).toBeCloseTo(4 * 42 * 42 * 7, 1);
  });

  it('fuse:true on non-grid touching placements fuses the copies', () => {
    const inst = instance(box(10, 10, 10), [
      [0, 0, 0],
      [10, 0, 0],
    ]);
    const solid = unwrap(materialize(inst, { fuse: true }));
    expect(unwrap(measureVolume(solid))).toBeCloseTo(2000, 1);
  });
});

describe('instancedMesh', () => {
  it('meshes the source once and returns the N placements', () => {
    const inst = instanceGrid(box(10, 10, 10), { cols: 4, rows: 4, pitchX: 12, pitchY: 12 });
    const im = instancedMesh(inst);
    expect(im.instances).toHaveLength(16);
    expect(im.geometry.vertices.length).toBeGreaterThan(0);
  });
});

describe('disposal', () => {
  it('disposing the InstancedShape frees its single source handle', () => {
    const base = getDisposalStats().liveHandles;
    const inst = instance(box(10, 10, 10), [
      [0, 0, 0],
      [20, 0, 0],
    ]);
    expect(getDisposalStats().liveHandles).toBe(base + 1); // one source, not N
    inst[Symbol.dispose]();
    expect(getDisposalStats().liveHandles).toBe(base);
  });
});
