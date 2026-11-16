import { describe, expect, it } from 'vitest';
import {
  DRAFT_ANGULAR_TOLERANCE,
  FINE_ANGULAR_TOLERANCE,
  draftMeshOptions,
  fineMeshOptions,
  type Bounds,
} from '../apps/playground/src/lib/meshOptions.js';

const cube = (min: number, max: number): Bounds => ({
  xMin: min,
  xMax: max,
  yMin: min,
  yMax: max,
  zMin: min,
  zMax: max,
});

// A box of 300 x 400 x 1200 has a diagonal of 1300.
const slab: Bounds = { xMin: 0, xMax: 300, yMin: 0, yMax: 400, zMin: 0, zMax: 1200 };

describe('playground mesh options', () => {
  it('keeps a chord tolerance of 0.1 mm for a model under 400 mm', () => {
    expect(fineMeshOptions([cube(0, 10)]).tolerance).toBe(0.1);
    // A cube of 230 mm has a diagonal of 398 mm.
    expect(fineMeshOptions([cube(0, 230)]).tolerance).toBe(0.1);
  });

  it('scales the chord tolerance with the diagonal of a larger model', () => {
    expect(fineMeshOptions([slab]).tolerance).toBeCloseTo(0.325, 12);
    expect(fineMeshOptions([{ ...slab, zMax: 12000 }]).tolerance).toBeGreaterThan(3);
  });

  it('takes the size from the bounds of all shapes together', () => {
    const near: Bounds = { xMin: 0, xMax: 10, yMin: 0, yMax: 10, zMin: 0, zMax: 10 };
    const far: Bounds = { xMin: 290, xMax: 300, yMin: 390, yMax: 400, zMin: 1190, zMax: 1200 };
    // Each shape is small. Together they span the slab.
    expect(fineMeshOptions([near]).tolerance).toBe(0.1);
    expect(fineMeshOptions([near, far]).tolerance).toBeCloseTo(0.325, 12);
  });

  it('leaves out a shape whose bounds could not be read', () => {
    expect(fineMeshOptions([null, slab, null]).tolerance).toBeCloseTo(0.325, 12);
    expect(fineMeshOptions([null]).tolerance).toBe(0.1);
    expect(fineMeshOptions([]).tolerance).toBe(0.1);
  });

  it('falls back to 0.1 mm for bounds that are not finite', () => {
    expect(fineMeshOptions([{ ...slab, xMax: Infinity }]).tolerance).toBe(0.1);
    expect(fineMeshOptions([{ ...slab, xMax: NaN }]).tolerance).toBe(0.1);
  });

  it('uses one angle limit for each model size', () => {
    expect(FINE_ANGULAR_TOLERANCE).toBe(0.3);
    expect(fineMeshOptions([cube(0, 1)]).angularTolerance).toBe(0.3);
    expect(fineMeshOptions([slab]).angularTolerance).toBe(0.3);
  });

  it('makes a draft that is coarser than the final mesh and never finer', () => {
    const draft = draftMeshOptions(slab);
    expect(draft.tolerance).toBeCloseTo(2.6, 12);
    expect(draft.tolerance).toBeGreaterThan(fineMeshOptions([slab]).tolerance);
    expect(draft.angularTolerance).toBe(DRAFT_ANGULAR_TOLERANCE);
    expect(draftMeshOptions(cube(0, 1)).tolerance).toBe(0.1);
  });
});
