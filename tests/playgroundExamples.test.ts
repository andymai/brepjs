/**
 * Regression guard for the playground command-palette examples.
 *
 * Every entry in the playground's EXAMPLES list — the hand-written core set
 * plus anything the scad-to-playground workflow adds — must evaluate and
 * mesh against the shipped OCCT kernel. Nothing else verifies this; the
 * production smoke test only checks the engine boots, not that each example
 * runs. Without this, an example can silently rot into a blank viewer.
 */
import { describe, it, beforeAll, expect } from 'vitest';
import { initOC } from './setup.js';
import { EXAMPLES } from '../apps/playground/src/lib/examples/index.js';
import { evalAndMeshExample, bodySolidCounts } from './helpers/playgroundExampleEval.js';

beforeAll(async () => {
  await initOC();
}, 60000);

describe('playground examples', () => {
  it('has a unique id and label for every entry', () => {
    const ids = EXAMPLES.map((e) => e.id);
    const labels = EXAMPLES.map((e) => e.label);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  for (const example of EXAMPLES) {
    it(`evaluates and meshes: ${example.id}`, async () => {
      const { shapeCount, totalVertices } = await evalAndMeshExample(example.code);
      expect(shapeCount).toBeGreaterThan(0);
      expect(totalVertices).toBeGreaterThan(0);
    });
  }

  // A finishing op (fillet/chamfer/etc.) that returns Result.Err must NOT be
  // swallowed with a fallback to the pre-op shape — that makes a no-op pass the
  // eval+mesh check above while silently shipping an unfinished part. Require
  // Result-returning ops to be unwrap()'d so failures throw and get caught.
  // Matches patterns like `x.ok ? x.value : base` and `isOk(x) ? unwrap(x) : base`.
  const SILENT_FALLBACK = /(\.ok\s*\?[^:]*:|isOk\s*\([^)]*\)\s*\?[^:]*:)/;
  for (const example of EXAMPLES) {
    it(`has no silent finishing-op fallback: ${example.id}`, () => {
      expect(
        SILENT_FALLBACK.test(example.code),
        `${example.id} swallows a Result with a fallback; unwrap() finishing ops instead so failures surface`
      ).toBe(false);
    });
  }

  // Multi-part mechanism/assembly examples return an array of DISTINCT bodies,
  // each of which must be a single connected solid. A body that is secretly a
  // multi-solid compound — a pin floating off its disc, parts glued by a fuse
  // that never welded — passes eval+mesh (a disjoint compound still meshes) yet
  // detaches on STEP/GLB export. getSolids() is the only thing that catches it.
  const CONNECTED_BODY_EXAMPLES = ['universal-joint', 'geneva-drive', 'bench-vise'];
  for (const id of CONNECTED_BODY_EXAMPLES) {
    it(`every returned body is a single connected solid: ${id}`, async () => {
      const example = EXAMPLES.find((e) => e.id === id);
      if (!example) throw new Error(`example ${id} not found`);
      const counts = await bodySolidCounts(example.code);
      expect(counts.length).toBeGreaterThan(0);
      counts.forEach((n, i) => {
        expect(n, `${id} body[${i}] is not one solid (getSolids=${n})`).toBe(1);
      });
    });
  }
});
