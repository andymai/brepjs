import { describe, it, expect, vi, beforeEach } from 'vitest';
import { installScreenshotApi, onViewChange, VIEWS } from '@viewer/screenshotApi.js';

beforeEach(() => {
  (globalThis as Record<string, unknown>).__ready = undefined;
  (globalThis as Record<string, unknown>).__renderView = undefined;
});

describe('screenshotApi', () => {
  it('installs globals', () => {
    installScreenshotApi();
    expect((globalThis as Record<string, unknown>).__ready).toBe(false);
    expect(typeof (globalThis as Record<string, unknown>).__renderView).toBe('function');
  });
  it('notifies subscribers for known views', () => {
    installScreenshotApi();
    const seen: string[] = [];
    onViewChange((v) => seen.push(v));
    for (const v of VIEWS) (globalThis as { __renderView?: (s: string) => void }).__renderView?.(v);
    expect(seen).toEqual(['iso', 'front', 'top', 'right']);
  });
  it('ignores unknown view', () => {
    installScreenshotApi();
    const cb = vi.fn();
    onViewChange(cb);
    (globalThis as { __renderView?: (s: string) => void }).__renderView?.('sideways');
    expect(cb).not.toHaveBeenCalled();
  });
});
