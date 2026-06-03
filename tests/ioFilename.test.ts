/**
 * Tests for uniqueIOFilename — the shared monotonic counter used to give
 * concurrent I/O operations distinct virtual-filesystem filenames.
 */
import { describe, expect, it } from 'vitest';
import { uniqueIOFilename } from '@/utils/ioFilename.js';

describe('uniqueIOFilename', () => {
  it('formats prefix, counter, and extension', () => {
    expect(uniqueIOFilename('_export', 'step')).toMatch(/^_export_\d+\.step$/);
  });

  it('returns a different name on each call (monotonic counter)', () => {
    const a = uniqueIOFilename('_x', 'glb');
    const b = uniqueIOFilename('_x', 'glb');
    expect(a).not.toBe(b);
  });
});
