import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce, DEFAULT_DEBOUNCE_MS, isWatchRelevant, watchTree } from '@/cli/watch.js';

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('collapses a burst of triggers into one trailing call', () => {
    const fn = vi.fn();
    const { trigger } = debounce(fn, 150);
    trigger();
    trigger();
    trigger();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(149);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('fires again after the quiet window for a later trigger', () => {
    const fn = vi.fn();
    const { trigger } = debounce(fn, 150);
    trigger();
    vi.advanceTimersByTime(150);
    expect(fn).toHaveBeenCalledTimes(1);
    trigger();
    vi.advanceTimersByTime(150);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('cancel prevents a pending call', () => {
    const fn = vi.fn();
    const { trigger, cancel } = debounce(fn, 150);
    trigger();
    cancel();
    vi.advanceTimersByTime(300);
    expect(fn).not.toHaveBeenCalled();
  });

  it('exposes a sane default debounce window', () => {
    expect(DEFAULT_DEBOUNCE_MS).toBe(150);
  });
});

describe('isWatchRelevant', () => {
  it('accepts source files and a null filename', () => {
    for (const name of ['main.tsx', 'dims.ts', 'dep.mts', 'lib/helper.js', 'a.jsx', 'b.mjs']) {
      expect(isWatchRelevant(name)).toBe(true);
    }
    expect(isWatchRelevant(null)).toBe(true);
    expect(isWatchRelevant(undefined)).toBe(true);
  });

  it('ignores written artifacts and non-source noise', () => {
    for (const name of ['out.step', 'preview.glb', 'report.json', 'notes.md', 'main.tsx~']) {
      expect(isWatchRelevant(name)).toBe(false);
    }
  });
});

describe('watchTree', () => {
  it('fires for edits in nested directories but not under node_modules', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    vi.useRealTimers();
    const root = mkdtempSync(join(tmpdir(), 'brepjs-cad-watchtree-'));
    const events: string[] = [];
    mkdirSync(join(root, 'lib'));
    mkdirSync(join(root, 'node_modules', 'dep'), { recursive: true });
    const stop = watchTree(root, (filename) => {
      if (filename) events.push(filename.toString());
    });
    try {
      writeFileSync(join(root, 'lib', 'helper.ts'), 'export const x = 1;\n');
      writeFileSync(join(root, 'node_modules', 'dep', 'index.js'), '// dep\n');
      await new Promise((res) => setTimeout(res, 300));
      expect(events).toContain('helper.ts');
      expect(events).not.toContain('index.js');
    } finally {
      stop();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
