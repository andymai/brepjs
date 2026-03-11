/**
 * Tests for src/topology/shapeBooleans.ts — applyGlue optimisation helper.
 *
 * applyGlue is a thin wrapper that calls SetGlue on an operation object.
 * We verify it with mock objects so no WASM is needed.
 */
import { describe, it, expect, vi } from 'vitest';
import { applyGlue } from '../src/index.js';

// BOPAlgo_GlueEnum integer constants (mirrored from shapeBooleans.ts)
const BOPAlgo_GlueShift = 1;
const BOPAlgo_GlueFull = 2;

describe('applyGlue', () => {
  it('does not call SetGlue for optimisation "none"', () => {
    const op = { SetGlue: vi.fn() };
    applyGlue(op, 'none');
    expect(op.SetGlue).not.toHaveBeenCalled();
  });

  it('calls SetGlue with BOPAlgo_GlueShift (1) for optimisation "commonFace"', () => {
    const op = { SetGlue: vi.fn() };
    applyGlue(op, 'commonFace');
    expect(op.SetGlue).toHaveBeenCalledTimes(1);
    expect(op.SetGlue).toHaveBeenCalledWith(BOPAlgo_GlueShift);
    expect(op.SetGlue).not.toHaveBeenCalledWith(BOPAlgo_GlueFull);
  });

  it('calls SetGlue with BOPAlgo_GlueFull (2) for optimisation "sameFace"', () => {
    const op = { SetGlue: vi.fn() };
    applyGlue(op, 'sameFace');
    expect(op.SetGlue).toHaveBeenCalledTimes(1);
    expect(op.SetGlue).toHaveBeenCalledWith(BOPAlgo_GlueFull);
    expect(op.SetGlue).not.toHaveBeenCalledWith(BOPAlgo_GlueShift);
  });
});
