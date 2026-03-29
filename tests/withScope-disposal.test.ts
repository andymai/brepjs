/**
 * Test that withScope does not invalidate the returned shape.
 * Regression test for #723.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from './setup.js';
import {
  drawRoundedRectangle,
  withScope,
  fuse,
  translate,
  shell,
  faceFinder,
  mesh,
  clone,
  unwrap,
} from '@/index.js';
import type { Sketch, ValidSolid, DisposalScope } from '@/index.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

function sketch(drawing: ReturnType<typeof drawRoundedRectangle>): Sketch {
  return drawing.sketchOnPlane() as Sketch;
}

describe('withScope return value lifecycle (#723)', () => {
  it('returned shape from withScope is meshable after scope disposal', () => {
    const result = withScope((scope: DisposalScope) => {
      // Build a box
      const box = sketch(drawRoundedRectangle(80, 80, 3.75)).extrude(20);

      // Shell it
      const topFaces = faceFinder().parallelTo('Z').atDistance(20, [0, 0, 0]).findAll(box);
      const shelled = unwrap(shell(box as ValidSolid, topFaces, 1.2));
      scope.register(box);

      // Build another box and fuse
      const box2 = scope.register(sketch(drawRoundedRectangle(70, 70, 3.75)).extrude(5));
      const fused = unwrap(fuse(shelled, box2));
      scope.register(shelled);

      // Return the final shape (NOT registered)
      return fused;
    });

    // After withScope exits, all registered shapes are disposed.
    // The returned shape should still be valid.
    expect(() => mesh(result)).not.toThrow();
    const m = mesh(result);
    expect(m.triangles.length).toBeGreaterThan(0);
  });

  it('returned shape can be cloned after scope disposal', () => {
    const result = withScope((scope: DisposalScope) => {
      const box = sketch(drawRoundedRectangle(80, 80, 3.75)).extrude(20);
      const box2 = scope.register(sketch(drawRoundedRectangle(70, 70, 3)).extrude(5));
      scope.register(box);
      return unwrap(fuse(box, box2));
    });

    const cloneResult = clone(result);
    expect(cloneResult).toBeDefined();
    // clone returns Result<T> in v15
    if ('value' in cloneResult) {
      expect(cloneResult.value).toBeDefined();
    }
  });

  it('reproduces gridfinity shellStage pattern: socket + box + lip via withScope', () => {
    const BOX_CORNER = 3.75;
    const CLEARANCE = 0.5;
    const outerW = 2 * 42 - CLEARANCE; // 83.5
    const outerD = 2 * 42 - CLEARANCE;
    const wallHeight = 21;
    const wallThickness = 1.2;

    // This mirrors the exact pattern from shellStage.ts
    const bin = withScope((scope: DisposalScope) => {
      // Build box body
      const box = sketch(drawRoundedRectangle(outerW, outerD, BOX_CORNER)).extrude(wallHeight);
      const topFaces = faceFinder().parallelTo('Z').atDistance(wallHeight, [0, 0, 0]).findAll(box);
      const binBody = unwrap(shell(box as ValidSolid, topFaces, wallThickness));
      scope.register(box);

      // Build a simple socket base (smaller box underneath)
      const socketBox = scope.register(
        sketch(drawRoundedRectangle(outerW - 1, outerD - 1, 4)).extrude(5)
      );

      // Build lip (simple box on top for testing)
      const lipBox = scope.register(
        translate(sketch(drawRoundedRectangle(outerW, outerD, BOX_CORNER)).extrude(4.4), [
          0,
          0,
          wallHeight,
        ])
      );

      // Fuse: base + body
      scope.register(binBody);
      const baseAndBody = scope.register(unwrap(fuse(socketBox, binBody)));

      // Fuse: (base+body) + lip — this is the return value
      return unwrap(fuse(baseAndBody, lipBox));
    });

    // The bin should be valid after scope disposal
    expect(() => mesh(bin)).not.toThrow();
    const m = mesh(bin);
    expect(m.triangles.length).toBeGreaterThan(0);

    // Clone should also work (shellStage does this)
    const cloned = clone(bin);
    expect(cloned).toBeDefined();
  });
});
