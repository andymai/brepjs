import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  box,
  cylinder,
  castShape,
  createHistory,
  addStep,
  registerShape,
  createRegistry,
  registerOperation,
  replayHistory,
  replayFrom,
  modifyStep,
  isOk,
  unwrap,
  measureVolume,
} from '../src/index.js';
import type { AnyShape, ModelHistory, HistoryOperationRegistry } from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

function makeBox(w: number, h: number, d: number): AnyShape {
  return castShape(box(w, d, h).wrapped);
}

function makeCyl(r: number, h: number): AnyShape {
  return castShape(cylinder(r, h).wrapped);
}

describe('createRegistry', () => {
  it('creates empty registry', () => {
    const reg = createRegistry();
    expect(reg.operations.size).toBe(0);
  });
});

describe('registerOperation', () => {
  it('adds operation immutably', () => {
    const r1 = createRegistry();
    const r2 = registerOperation(r1, 'box', () => makeBox(10, 10, 10));
    expect(r1.operations.size).toBe(0);
    expect(r2.operations.size).toBe(1);
    expect(r2.operations.has('box')).toBe(true);
  });

  it('overwrites existing operation', () => {
    let reg = createRegistry();
    reg = registerOperation(reg, 'box', () => makeBox(10, 10, 10));
    reg = registerOperation(reg, 'box', () => makeBox(5, 5, 5));
    expect(reg.operations.size).toBe(1);
  });
});

describe('replayHistory', () => {
  function buildRegistry(): HistoryOperationRegistry {
    let reg = createRegistry();
    reg = registerOperation(reg, 'makeBox', (_inputs, params) => {
      const w = (params['w'] as number) ?? 10;
      const h = (params['h'] as number) ?? 10;
      const d = (params['d'] as number) ?? 10;
      return makeBox(w, h, d);
    });
    reg = registerOperation(reg, 'makeCyl', (_inputs, params) => {
      const r = (params['r'] as number) ?? 5;
      const height = (params['height'] as number) ?? 20;
      return makeCyl(r, height);
    });
    return reg;
  }

  it('replays a single-step history', () => {
    const reg = buildRegistry();
    const shape = makeBox(10, 10, 10);
    let h: ModelHistory = createHistory();
    h = addStep(
      h,
      {
        id: 's1',
        type: 'makeBox',
        parameters: { w: 10, h: 10, d: 10 },
        inputIds: [],
        outputId: 'out-1',
      },
      shape
    );

    const result = replayHistory(h, reg);
    expect(isOk(result)).toBe(true);
    const replayed = unwrap(result);
    expect(replayed.steps).toHaveLength(1);
    expect(replayed.shapes.has('out-1')).toBe(true);
    // The replayed shape should have the same volume
    const vol = measureVolume(replayed.shapes.get('out-1')!);
    expect(vol).toBeCloseTo(1000, 0);
  });

  it('replays multi-step history', () => {
    const reg = buildRegistry();
    const s1 = makeBox(10, 10, 10);
    const s2 = makeCyl(5, 20);
    let h: ModelHistory = createHistory();
    h = addStep(
      h,
      {
        id: 'a',
        type: 'makeBox',
        parameters: { w: 10, h: 10, d: 10 },
        inputIds: [],
        outputId: 'o-a',
      },
      s1
    );
    h = addStep(
      h,
      { id: 'b', type: 'makeCyl', parameters: { r: 5, height: 20 }, inputIds: [], outputId: 'o-b' },
      s2
    );

    const result = replayHistory(h, reg);
    expect(isOk(result)).toBe(true);
    const replayed = unwrap(result);
    expect(replayed.steps).toHaveLength(2);
    expect(replayed.shapes.has('o-a')).toBe(true);
    expect(replayed.shapes.has('o-b')).toBe(true);
  });

  it('preserves initial shapes', () => {
    const reg = buildRegistry();
    const initial = makeBox(5, 5, 5);
    let h: ModelHistory = createHistory();
    h = registerShape(h, 'init', initial);
    h = addStep(
      h,
      {
        id: 's1',
        type: 'makeBox',
        parameters: { w: 20, h: 20, d: 20 },
        inputIds: [],
        outputId: 'out-1',
      },
      makeBox(20, 20, 20)
    );

    const result = replayHistory(h, reg);
    expect(isOk(result)).toBe(true);
    const replayed = unwrap(result);
    // Initial shape is preserved (same reference)
    expect(replayed.shapes.get('init')).toBe(initial);
  });

  it('returns error for unknown operation type', () => {
    const reg = createRegistry();
    let h: ModelHistory = createHistory();
    h = addStep(
      h,
      { id: 's1', type: 'unknownOp', parameters: {}, inputIds: [], outputId: 'out-1' },
      makeBox(10, 10, 10)
    );

    const result = replayHistory(h, reg);
    expect(isOk(result)).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('REPLAY_UNKNOWN_OP');
  });

  it('returns error for missing input shape', () => {
    let reg = createRegistry();
    reg = registerOperation(reg, 'noop', (inputs) => inputs[0]!);
    let h: ModelHistory = createHistory();
    h = addStep(
      h,
      { id: 's1', type: 'noop', parameters: {}, inputIds: ['missing'], outputId: 'out-1' },
      makeBox(10, 10, 10)
    );

    const result = replayHistory(h, reg);
    expect(isOk(result)).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('REPLAY_MISSING_INPUT');
  });

  it('returns error when operation throws', () => {
    let reg = createRegistry();
    reg = registerOperation(reg, 'fail', () => {
      throw new Error('boom');
    });
    let h: ModelHistory = createHistory();
    h = addStep(
      h,
      { id: 's1', type: 'fail', parameters: {}, inputIds: [], outputId: 'out-1' },
      makeBox(10, 10, 10)
    );

    const result = replayHistory(h, reg);
    expect(isOk(result)).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('REPLAY_STEP_FAILED');
  });
});

describe('replayFrom', () => {
  function buildRegistry(): HistoryOperationRegistry {
    let reg = createRegistry();
    reg = registerOperation(reg, 'makeBox', (_inputs, params) => {
      const w = (params['w'] as number) ?? 10;
      const h = (params['h'] as number) ?? 10;
      const d = (params['d'] as number) ?? 10;
      return makeBox(w, h, d);
    });
    return reg;
  }

  it('replays from a specific step', () => {
    const reg = buildRegistry();
    const s1 = makeBox(10, 10, 10);
    const s2 = makeBox(20, 20, 20);
    let h: ModelHistory = createHistory();
    h = addStep(
      h,
      {
        id: 'a',
        type: 'makeBox',
        parameters: { w: 10, h: 10, d: 10 },
        inputIds: [],
        outputId: 'o-a',
      },
      s1
    );
    h = addStep(
      h,
      {
        id: 'b',
        type: 'makeBox',
        parameters: { w: 20, h: 20, d: 20 },
        inputIds: [],
        outputId: 'o-b',
      },
      s2
    );

    const result = replayFrom(h, 'b', reg);
    expect(isOk(result)).toBe(true);
    const replayed = unwrap(result);
    expect(replayed.steps).toHaveLength(2);
    // Step 'a' output should be unchanged
    expect(replayed.shapes.get('o-a')).toBe(s1);
    // Step 'b' output should be a new shape
    const newB = replayed.shapes.get('o-b');
    expect(newB).toBeDefined();
    expect(measureVolume(newB!)).toBeCloseTo(8000, 0);
  });

  it('returns error for missing step ID', () => {
    const reg = buildRegistry();
    const h = createHistory();
    const result = replayFrom(h, 'missing', reg);
    expect(isOk(result)).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('REPLAY_STEP_NOT_FOUND');
  });
});

describe('modifyStep', () => {
  function buildRegistry(): HistoryOperationRegistry {
    let reg = createRegistry();
    reg = registerOperation(reg, 'makeBox', (_inputs, params) => {
      const w = (params['w'] as number) ?? 10;
      const h = (params['h'] as number) ?? 10;
      const d = (params['d'] as number) ?? 10;
      return makeBox(w, h, d);
    });
    return reg;
  }

  it('modifies step parameters and replays', () => {
    const reg = buildRegistry();
    const s1 = makeBox(10, 10, 10);
    let h: ModelHistory = createHistory();
    h = addStep(
      h,
      {
        id: 's1',
        type: 'makeBox',
        parameters: { w: 10, h: 10, d: 10 },
        inputIds: [],
        outputId: 'out-1',
      },
      s1
    );

    // Modify to a 5x5x5 box
    const result = modifyStep(h, 's1', { w: 5, h: 5, d: 5 }, reg);
    expect(isOk(result)).toBe(true);
    const modified = unwrap(result);
    expect(modified.steps).toHaveLength(1);
    expect(modified.steps[0]?.parameters).toEqual({ w: 5, h: 5, d: 5 });
    const vol = measureVolume(modified.shapes.get('out-1')!);
    expect(vol).toBeCloseTo(125, 0);
  });

  it('returns error for missing step ID', () => {
    const reg = buildRegistry();
    const h = createHistory();
    const result = modifyStep(h, 'missing', {}, reg);
    expect(isOk(result)).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('MODIFY_STEP_NOT_FOUND');
  });
});
