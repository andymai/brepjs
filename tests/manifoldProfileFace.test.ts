// @vitest-environment node
/**
 * Profile faces on the manifold adapter answer their normal natively.
 *
 * `extrude` reads the normal of a planar face to reject a vector in its plane.
 * A profile face has no B-rep surface, so a normal query that replays the face
 * onto OCCT costs one replay for each extrusion on the preview kernel.
 */
import { describe, it, beforeAll, expect, vi } from 'vitest';
import { initKernel, initOCCT } from './setup.js';
import { getKernel } from '@/kernel/index.js';
import { withKernel, extrude, polygon, measureVolume, unwrap, isErr } from '@/index.js';

let haveManifold = false;
beforeAll(async () => {
  await initOCCT();
  try {
    await initKernel('manifold');
    haveManifold = true;
  } catch {
    haveManifold = false;
  }
}, 60_000);

type Pt = [number, number, number];
// A triangle of 50 mm² in a plane that contains the Z axis.
const TRIANGLE: Pt[] = [
  [3, 4, 0],
  [9, 12, 0],
  [3, 4, 10],
];

describe('manifold profile faces', () => {
  it('reports the same normal as the OCCT face of the same outline', () => {
    if (!haveManifold) return;
    const expected = withKernel('occt-wasm', () => {
      const face = unwrap(polygon(TRIANGLE));
      return getKernel().surfaceNormal(face.wrapped, 0, 0);
    });
    withKernel('manifold', () => {
      const face = unwrap(polygon(TRIANGLE));
      expect(getKernel().surfaceType(face.wrapped)).toBe('plane');
      const normal = getKernel().surfaceNormal(face.wrapped, 0, 0);
      for (let i = 0; i < 3; i++) expect(normal[i]).toBeCloseTo(expected[i] ?? NaN, 9);
    });
  });

  it('extrudes and rejects an in-plane vector without a query on OCCT', () => {
    if (!haveManifold) return;
    const spies = (['occt', 'occt-wasm'] as const).flatMap((id) => [
      vi.spyOn(getKernel(id), 'surfaceNormal'),
      vi.spyOn(getKernel(id), 'uvBounds'),
      vi.spyOn(getKernel(id), 'makeFace'),
    ]);
    try {
      withKernel('manifold', () => {
        const face = unwrap(polygon(TRIANGLE));
        const flat = extrude(face, 20);
        expect(isErr(flat)).toBe(true);
        if (isErr(flat)) expect(flat.error.code).toBe('EXTRUDE_VECTOR_IN_PLANE');

        // 50 mm² swept 5 mm along the unit normal [0.8, -0.6, 0].
        const prism = unwrap(extrude(face, [4, -3, 0]));
        expect(unwrap(measureVolume(prism))).toBeCloseTo(250, 6);
      });
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});
