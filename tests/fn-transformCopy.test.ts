import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  box,
  clone,
  translate,
  rotate,
  measureVolume,
  getBounds,
  composeTransforms,
  transformCopy,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('composeTransforms', () => {
  it('composes a single translate', () => {
    const b = box(10, 10, 10);
    const trsf = composeTransforms([{ type: 'translate', v: [5, 0, 0] }]);
    const result = transformCopy(b, trsf);
    trsf.cleanup();
    const bounds = getBounds(result);
    expect(bounds.xMin).toBeCloseTo(5, 5);
    expect(bounds.xMax).toBeCloseTo(15, 5);
  });

  it('composes translate + rotate', () => {
    const b = box(10, 10, 10);
    // Apply translate then rotate — same as doing them sequentially
    const trsf = composeTransforms([
      { type: 'translate', v: [5, 0, 0] },
      { type: 'rotate', angle: 90, axis: [0, 0, 1] },
    ]);
    const composed = transformCopy(b, trsf);
    trsf.cleanup();

    // Compare to sequential operations
    const sequential = rotate(translate(b, [5, 0, 0]), 90, { axis: [0, 0, 1] });

    const cb = getBounds(composed);
    const sb = getBounds(sequential);
    expect(cb.xMin).toBeCloseTo(sb.xMin, 3);
    expect(cb.xMax).toBeCloseTo(sb.xMax, 3);
    expect(cb.yMin).toBeCloseTo(sb.yMin, 3);
    expect(cb.yMax).toBeCloseTo(sb.yMax, 3);
    expect(cb.zMin).toBeCloseTo(sb.zMin, 3);
    expect(cb.zMax).toBeCloseTo(sb.zMax, 3);
  });

  it('composes multiple operations matching sequential clone+translate+rotate', () => {
    const b = box(10, 10, 10);
    const ops = [
      { type: 'translate' as const, v: [3, 4, -5] as [number, number, number] },
      { type: 'rotate' as const, angle: 90, axis: [1, 0, 0] as [number, number, number] },
      { type: 'rotate' as const, angle: 45, axis: [0, 0, 1] as [number, number, number] },
      { type: 'translate' as const, v: [10, 20, 30] as [number, number, number] },
    ];

    const trsf = composeTransforms(ops);
    const composed = transformCopy(b, trsf);
    trsf.cleanup();

    // Sequential equivalent
    let seq = clone(b);
    seq = translate(seq, [3, 4, -5]);
    seq = rotate(seq, 90, { axis: [1, 0, 0] });
    seq = rotate(seq, 45, { axis: [0, 0, 1] });
    seq = translate(seq, [10, 20, 30]);

    const cb = getBounds(composed);
    const sb = getBounds(seq);
    expect(cb.xMin).toBeCloseTo(sb.xMin, 3);
    expect(cb.xMax).toBeCloseTo(sb.xMax, 3);
    expect(cb.yMin).toBeCloseTo(sb.yMin, 3);
    expect(cb.yMax).toBeCloseTo(sb.yMax, 3);
    expect(cb.zMin).toBeCloseTo(sb.zMin, 3);
    expect(cb.zMax).toBeCloseTo(sb.zMax, 3);
  });
});

describe('transformCopy', () => {
  it('preserves volume', () => {
    const b = box(10, 10, 10);
    const trsf = composeTransforms([
      { type: 'translate', v: [5, 5, 5] },
      { type: 'rotate', angle: 45, axis: [0, 0, 1] },
    ]);
    const result = transformCopy(b, trsf);
    trsf.cleanup();
    expect(measureVolume(result)).toBeCloseTo(1000, 0);
  });

  it('does not mutate the original shape', () => {
    const b = box(10, 10, 10);
    const originalBounds = getBounds(b);
    const trsf = composeTransforms([{ type: 'translate', v: [100, 0, 0] }]);
    transformCopy(b, trsf);
    trsf.cleanup();
    const afterBounds = getBounds(b);
    expect(afterBounds.xMin).toBeCloseTo(originalBounds.xMin, 5);
    expect(afterBounds.xMax).toBeCloseTo(originalBounds.xMax, 5);
  });

  it('can reuse the same transform for multiple copies', () => {
    const b = box(10, 10, 10);
    const trsf = composeTransforms([{ type: 'translate', v: [50, 0, 0] }]);
    const copy1 = transformCopy(b, trsf);
    const copy2 = transformCopy(b, trsf);
    trsf.cleanup();

    const b1 = getBounds(copy1);
    const b2 = getBounds(copy2);
    expect(b1.xMin).toBeCloseTo(b2.xMin, 5);
    expect(b1.xMax).toBeCloseTo(b2.xMax, 5);
  });

  it('works with rotate including center', () => {
    const b = box(10, 10, 10);
    const trsf = composeTransforms([
      { type: 'rotate', angle: 90, axis: [0, 0, 1], center: [5, 5, 0] },
    ]);
    const result = transformCopy(b, trsf);
    trsf.cleanup();

    const sequential = rotate(b, 90, { axis: [0, 0, 1], at: [5, 5, 0] });
    const cb = getBounds(result);
    const sb = getBounds(sequential);
    expect(cb.xMin).toBeCloseTo(sb.xMin, 3);
    expect(cb.xMax).toBeCloseTo(sb.xMax, 3);
    expect(cb.yMin).toBeCloseTo(sb.yMin, 3);
    expect(cb.yMax).toBeCloseTo(sb.yMax, 3);
  });
});
