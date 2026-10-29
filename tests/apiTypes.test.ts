/**
 * Compile-time checks for public API types, run by `npm run typecheck:tests`.
 *
 * The closures are never called: expectTypeOf only reads their types.
 */
import { describe, it, expectTypeOf } from 'vitest';
import { pocket, boss, drawRectangle, drawCircle, box } from '@/index.js';
import type { Drawing, DrawingLike, PocketOptions, BossOptions, Result, Shape3D } from '@/index.js';

describe('pocket and boss take a Drawing profile', () => {
  it('a Drawing is a DrawingLike', () => {
    expectTypeOf<Drawing>().toExtend<DrawingLike>();
    expectTypeOf<Drawing>().toExtend<PocketOptions['profile']>();
    expectTypeOf<Drawing>().toExtend<BossOptions['profile']>();
  });

  it('accepts the documented call forms', () => {
    const pocketed = () => pocket(box(50, 50, 20), { profile: drawRectangle(20, 10), depth: 5 });
    const bossed = () => boss(box(50, 50, 20), { profile: drawCircle(8), height: 10 });
    expectTypeOf(pocketed).returns.toExtend<Result<Shape3D>>();
    expectTypeOf(bossed).returns.toExtend<Result<Shape3D>>();
  });
});
