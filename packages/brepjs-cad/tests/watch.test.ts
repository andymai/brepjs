import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce, DEFAULT_DEBOUNCE_MS } from '@/cli/watch.js';

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
