import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { guardRouter, leavesDocs } from '../apps/docs/.vitepress/theme/outsideDocs.js';

// The docs router takes a same-origin link without a `target` attribute as a docs page. The playground is a
// separate app on the same origin, so such a link showed the docs 404 page.
describe('links from the docs to the playground', () => {
  it('knows which paths leave the docs', () => {
    expect(leavesDocs('/playground')).toBe(true);
    expect(leavesDocs('/playground/')).toBe(true);
    expect(leavesDocs('/playground/examples/robot-arm')).toBe(true);
    expect(leavesDocs('/playground?code=abc')).toBe(true);
    expect(leavesDocs('https://brepjs.dev/playground/examples/pocket-watch')).toBe(true);
    expect(leavesDocs('/')).toBe(false);
    expect(leavesDocs('/introduction/why-brepjs')).toBe(false);
    expect(leavesDocs('/playground-notes')).toBe(false);
  });

  it('hands a playground link to the browser and stops the docs router', () => {
    const leave = vi.fn();
    const router: { onBeforeRouteChange?: (to: string) => unknown } = {};
    guardRouter(router, leave, () => 'https://brepjs.dev/');
    expect(router.onBeforeRouteChange?.('/playground/examples/robot-arm')).toBe(false);
    expect(leave).toHaveBeenCalledWith('/playground/examples/robot-arm');
  });

  it('does not leave again when the docs app loads on a playground path', () => {
    const leave = vi.fn();
    const router: { onBeforeRouteChange?: (to: string) => unknown } = {};
    guardRouter(router, leave, () => 'https://brepjs.dev/playground/examples/missing');
    expect(router.onBeforeRouteChange?.('/playground/examples/missing')).toBeUndefined();
    expect(leave).not.toHaveBeenCalled();
  });

  it('lets a docs link through, and keeps a hook that was there before', () => {
    const leave = vi.fn();
    const previous = vi.fn(() => 'kept');
    const router: { onBeforeRouteChange?: (to: string) => unknown } = {
      onBeforeRouteChange: previous,
    };
    guardRouter(router, leave, () => 'https://brepjs.dev/');
    expect(router.onBeforeRouteChange?.('/agent/overview')).toBe('kept');
    expect(previous).toHaveBeenCalledWith('/agent/overview');
    expect(leave).not.toHaveBeenCalled();
  });

  it('is installed by the docs theme', () => {
    const theme = readFileSync(
      resolve(__dirname, '../apps/docs/.vitepress/theme/index.ts'),
      'utf8'
    );
    expect(theme).toMatch(/guardRouter\(\s*router/);
  });
});
