import { describe, it, expect, beforeEach } from 'vitest';
import { perfTimer, getPerformanceStats, resetPerformanceStats } from '@/kernel/perfStats.js';

describe('PerfStats', () => {
  beforeEach(() => {
    resetPerformanceStats();
  });

  it('records timing for a category', () => {
    const end = perfTimer('boolean');
    // Simulate work
    let sum = 0;
    for (let i = 0; i < 1_000_000; i++) sum += i;
    void sum;
    end();

    const stats = getPerformanceStats();
    expect(stats.boolean.totalMs).toBeGreaterThan(0);
    expect(stats.boolean.count).toBe(1);
  });

  it('accumulates multiple calls', () => {
    perfTimer('loft')();
    perfTimer('loft')();
    perfTimer('loft')();

    const stats = getPerformanceStats();
    expect(stats.loft.count).toBe(3);
  });

  it('resets all categories', () => {
    perfTimer('mesh')();
    resetPerformanceStats();

    const stats = getPerformanceStats();
    expect(stats.mesh.count).toBe(0);
    expect(stats.mesh.totalMs).toBe(0);
  });

  it('isolates categories', () => {
    perfTimer('boolean')();

    const stats = getPerformanceStats();
    expect(stats.boolean.count).toBe(1);
    expect(stats.loft.count).toBe(0);
  });
});
