import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  box,
  cylinder,
  castShape,
  createHistory,
  addStep,
  undoLast,
  findStep,
  getHistoryShape,
  stepCount,
  stepsFrom,
  registerShape,
} from '../src/index.js';
import type { Shape3D, ModelHistory } from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

function makeBoxShape(): Shape3D {
  return castShape(box(10, 10, 10).wrapped) as Shape3D;
}

function makeCylShape(): Shape3D {
  return castShape(cylinder(5, 20).wrapped) as Shape3D;
}

describe('createHistory', () => {
  it('returns empty history', () => {
    const h = createHistory();
    expect(h.steps).toHaveLength(0);
    expect(h.shapes.size).toBe(0);
  });
});

describe('addStep', () => {
  it('adds a step and stores the shape', () => {
    const shape = makeBoxShape();
    const h = addStep(
      createHistory(),
      {
        id: 's1',
        type: 'extrude',
        parameters: { height: 10 },
        inputIds: [],
        outputId: 'shape-1',
      },
      shape
    );
    expect(h.steps).toHaveLength(1);
    expect(h.steps[0]?.id).toBe('s1');
    expect(h.steps[0]?.type).toBe('extrude');
    expect(h.steps[0]?.parameters).toEqual({ height: 10 });
    expect(h.steps[0]?.outputId).toBe('shape-1');
    expect(h.steps[0]?.timestamp).toBeGreaterThan(0);
    expect(h.shapes.get('shape-1')).toBe(shape);
  });
});

describe('undoLast', () => {
  it('removes last step and cleans up orphaned shapes', () => {
    const shape1 = makeBoxShape();
    const shape2 = makeCylShape();
    let h: ModelHistory = createHistory();
    h = registerShape(h, 'base', shape1);
    h = addStep(
      h,
      {
        id: 's1',
        type: 'extrude',
        parameters: {},
        inputIds: ['base'],
        outputId: 'out-1',
      },
      shape1
    );
    h = addStep(
      h,
      {
        id: 's2',
        type: 'fuse',
        parameters: {},
        inputIds: ['out-1'],
        outputId: 'out-2',
      },
      shape2
    );

    const undone = undoLast(h);
    expect(undone.steps).toHaveLength(1);
    // out-1 is still referenced by step s1, so it stays
    expect(undone.shapes.has('out-1')).toBe(true);
    // base is still referenced by step s1 inputIds
    expect(undone.shapes.has('base')).toBe(true);
    // out-2 is no longer referenced
    expect(undone.shapes.has('out-2')).toBe(false);
  });

  it('returns same history when empty', () => {
    const h = createHistory();
    expect(undoLast(h)).toBe(h);
  });
});

describe('findStep', () => {
  it('finds existing step by ID', () => {
    const shape = makeBoxShape();
    const h = addStep(
      createHistory(),
      {
        id: 'find-me',
        type: 'box',
        parameters: { w: 10 },
        inputIds: [],
        outputId: 'o1',
      },
      shape
    );
    const step = findStep(h, 'find-me');
    expect(step).toBeDefined();
    expect(step?.type).toBe('box');
  });

  it('returns undefined for missing ID', () => {
    const h = createHistory();
    expect(findStep(h, 'nope')).toBeUndefined();
  });
});

describe('getHistoryShape', () => {
  it('retrieves shape by ID', () => {
    const shape = makeBoxShape();
    const h = addStep(
      createHistory(),
      {
        id: 's1',
        type: 'box',
        parameters: {},
        inputIds: [],
        outputId: 'my-shape',
      },
      shape
    );
    expect(getHistoryShape(h, 'my-shape')).toBe(shape);
  });

  it('returns undefined for missing ID', () => {
    const h = createHistory();
    expect(getHistoryShape(h, 'missing')).toBeUndefined();
  });
});

describe('stepCount', () => {
  it('returns correct count', () => {
    const shape = makeBoxShape();
    let h: ModelHistory = createHistory();
    expect(stepCount(h)).toBe(0);
    h = addStep(h, { id: 's1', type: 'a', parameters: {}, inputIds: [], outputId: 'o1' }, shape);
    expect(stepCount(h)).toBe(1);
    h = addStep(h, { id: 's2', type: 'b', parameters: {}, inputIds: [], outputId: 'o2' }, shape);
    expect(stepCount(h)).toBe(2);
  });
});

describe('stepsFrom', () => {
  it('returns steps from given ID onwards', () => {
    const shape = makeBoxShape();
    let h: ModelHistory = createHistory();
    h = addStep(h, { id: 's1', type: 'a', parameters: {}, inputIds: [], outputId: 'o1' }, shape);
    h = addStep(h, { id: 's2', type: 'b', parameters: {}, inputIds: [], outputId: 'o2' }, shape);
    h = addStep(h, { id: 's3', type: 'c', parameters: {}, inputIds: [], outputId: 'o3' }, shape);

    const from = stepsFrom(h, 's2');
    expect(from).toHaveLength(2);
    expect(from[0]?.id).toBe('s2');
    expect(from[1]?.id).toBe('s3');
  });

  it('returns empty array for missing ID', () => {
    const h = createHistory();
    expect(stepsFrom(h, 'nope')).toHaveLength(0);
  });
});

describe('registerShape', () => {
  it('adds initial shape without a step', () => {
    const shape = makeBoxShape();
    const h = registerShape(createHistory(), 'initial', shape);
    expect(h.shapes.get('initial')).toBe(shape);
    expect(h.steps).toHaveLength(0);
  });
});

describe('multiple operations', () => {
  it('builds up correctly with 3 steps', () => {
    const s1 = makeBoxShape();
    const s2 = makeCylShape();
    const s3 = makeBoxShape();
    let h: ModelHistory = createHistory();
    h = addStep(
      h,
      { id: 'a', type: 'box', parameters: { w: 10 }, inputIds: [], outputId: 'o-a' },
      s1
    );
    h = addStep(
      h,
      { id: 'b', type: 'cyl', parameters: { r: 5 }, inputIds: ['o-a'], outputId: 'o-b' },
      s2
    );
    h = addStep(
      h,
      { id: 'c', type: 'fuse', parameters: {}, inputIds: ['o-a', 'o-b'], outputId: 'o-c' },
      s3
    );

    expect(stepCount(h)).toBe(3);
    expect(h.shapes.size).toBe(3);
    expect(getHistoryShape(h, 'o-a')).toBe(s1);
    expect(getHistoryShape(h, 'o-b')).toBe(s2);
    expect(getHistoryShape(h, 'o-c')).toBe(s3);
  });
});

describe('immutability', () => {
  it('original history is unchanged after addStep', () => {
    const shape = makeBoxShape();
    const original = createHistory();
    const updated = addStep(
      original,
      {
        id: 's1',
        type: 'box',
        parameters: {},
        inputIds: [],
        outputId: 'o1',
      },
      shape
    );
    expect(original.steps).toHaveLength(0);
    expect(original.shapes.size).toBe(0);
    expect(updated.steps).toHaveLength(1);
  });

  it('original history is unchanged after undoLast', () => {
    const shape = makeBoxShape();
    const h = addStep(
      createHistory(),
      {
        id: 's1',
        type: 'box',
        parameters: {},
        inputIds: [],
        outputId: 'o1',
      },
      shape
    );
    const undone = undoLast(h);
    expect(h.steps).toHaveLength(1);
    expect(h.shapes.size).toBe(1);
    expect(undone.steps).toHaveLength(0);
  });

  it('original history is unchanged after registerShape', () => {
    const shape = makeBoxShape();
    const original = createHistory();
    const updated = registerShape(original, 'init', shape);
    expect(original.shapes.size).toBe(0);
    expect(updated.shapes.size).toBe(1);
  });
});
