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
import { evalAndMeshExample, bodyHealth } from './helpers/playgroundExampleEval.js';

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

  // CORPUS-WIDE connectivity gate. Every returned body must be a SINGLE connected solid.
  // eval+mesh can't catch a fragmented body — a disjoint compound (a failed weld, a part
  // detached from its assembly) still meshes non-empty — yet it falls apart on STEP/GLB
  // export. `verify --metrics` caught these one-off (gt2 was 40 loose solids, fan-guard 141,
  // vented-louvre 55, rack-and-pinion split); this gates the whole corpus in-process so no
  // example can silently fragment again. (Solid VALIDITY is enforced separately by `verify`.)
  //
  // Multi-part assemblies return an ARRAY of distinct bodies, EACH a single solid — so this
  // applies corpus-wide with no allowlist (none of today's examples needs one).
  for (const example of EXAMPLES) {
    it(`every returned body is one connected solid: ${example.id}`, async () => {
      const reports = await bodyHealth(example.code);
      expect(reports.length).toBeGreaterThan(0);
      reports.forEach((r, i) => {
        expect(
          r.solids,
          `${example.id} body[${i}] is not one connected solid (getSolids=${r.solids})`
        ).toBe(1);
      });
    });
  }
});
