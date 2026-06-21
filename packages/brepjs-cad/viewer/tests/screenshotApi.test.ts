import { describe, it, expect, vi, beforeEach } from 'vitest';
import { installScreenshotApi, onScene, VIEWS, type SceneControl } from '@viewer/screenshotApi.js';

beforeEach(() => {
  (globalThis as Record<string, unknown>).__ready = undefined;
  (globalThis as Record<string, unknown>).__renderView = undefined;
  (globalThis as Record<string, unknown>).__setScene = undefined;
});

describe('screenshotApi', () => {
  it('installs globals', () => {
    installScreenshotApi();
    expect((globalThis as Record<string, unknown>).__ready).toBe(false);
    expect(typeof (globalThis as Record<string, unknown>).__renderView).toBe('function');
    expect(typeof (globalThis as Record<string, unknown>).__setScene).toBe('function');
  });
  it('__renderView notifies subscribers for known views (solid)', () => {
    installScreenshotApi();
    const seen: SceneControl[] = [];
    onScene((c) => seen.push(c));
    for (const v of VIEWS) (globalThis as { __renderView?: (s: string) => void }).__renderView?.(v);
    expect(seen.map((c) => c.view)).toEqual(['iso', 'front', 'top', 'right']);
    expect(seen.every((c) => c.viewMode === undefined)).toBe(true);
  });
  it('__setScene carries the view mode (e.g. xray)', () => {
    installScreenshotApi();
    const seen: SceneControl[] = [];
    onScene((c) => seen.push(c));
    (globalThis as { __setScene?: (c: SceneControl) => void }).__setScene?.({
      view: 'iso',
      viewMode: 'xray',
    });
    expect(seen).toEqual([{ view: 'iso', viewMode: 'xray' }]);
  });
  it('ignores an unknown view on both hooks', () => {
    installScreenshotApi();
    const cb = vi.fn();
    onScene(cb);
    (globalThis as { __renderView?: (s: string) => void }).__renderView?.('sideways');
    (globalThis as { __setScene?: (c: SceneControl) => void }).__setScene?.({
      view: 'sideways' as SceneControl['view'],
    });
    expect(cb).not.toHaveBeenCalled();
  });
});
