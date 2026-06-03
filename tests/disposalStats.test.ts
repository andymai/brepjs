/**
 * Kernel-agnostic disposal helpers: stats accessors, the isLive predicate, and
 * the withScopeResult / withScopeResultAsync wrappers. The legacy disposal.test.ts
 * suite wraps raw `oc` shapes and is skipped under occt-wasm, leaving these
 * helpers uncovered on the default kernel; here they are exercised through the
 * public shape API and plain Result callbacks instead.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  getDisposalStats,
  resetDisposalStats,
  isLive,
  withScopeResult,
  withScopeResultAsync,
} from '@/core/disposal.js';
import { box } from '@/index.js';
import { ok, err, unwrap, unwrapErr } from '@/core/result.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('disposal stats', () => {
  it('getDisposalStats returns a snapshot with the expected counters', () => {
    const stats = getDisposalStats();
    expect(stats).toHaveProperty('liveHandles');
    expect(stats).toHaveProperty('peakHandles');
    expect(stats).toHaveProperty('gcCollected');
    expect(typeof stats.scopeEnters).toBe('number');
  });

  it('resetDisposalStats zeroes the peak/scope/gc counters', () => {
    resetDisposalStats();
    const stats = getDisposalStats();
    expect(stats.peakHandles).toBe(0);
    expect(stats.scopeEnters).toBe(0);
    expect(stats.scopeExits).toBe(0);
    expect(stats.gcCollected).toBe(0);
    // liveHandles is intentionally not asserted: setup (initOC) leaves WASM
    // handles alive, so the FinalizationRegistry can adjust this counter
    // asynchronously after the synchronous reset — an absolute assertion would
    // be fragile and could even go negative for later readers.
  });
});

describe('isLive', () => {
  it('reports a fresh handle as live and a disposed one as not', () => {
    const solid = box(1, 1, 1);
    expect(isLive(solid)).toBe(true);
    solid[Symbol.dispose]();
    expect(isLive(solid)).toBe(false);
  });
});

describe('withScopeResult', () => {
  it('passes a scope through and returns the Ok result', () => {
    const result = withScopeResult((scope) => {
      expect(scope).toBeDefined();
      return ok(7);
    });
    expect(unwrap(result)).toBe(7);
  });

  it('propagates an Err result', () => {
    const result = withScopeResult(() => err('nope'));
    expect(unwrapErr(result)).toBe('nope');
  });
});

describe('withScopeResultAsync', () => {
  it('awaits the callback and returns its Ok result', async () => {
    const result = await withScopeResultAsync((scope) => {
      expect(scope).toBeDefined();
      return Promise.resolve(ok('done'));
    });
    expect(unwrap(result)).toBe('done');
  });

  it('propagates an async Err result', async () => {
    const result = await withScopeResultAsync(() => Promise.resolve(err('async-nope')));
    expect(unwrapErr(result)).toBe('async-nope');
  });
});
