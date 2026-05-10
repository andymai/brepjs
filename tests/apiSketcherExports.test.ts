import { describe, expect, it } from 'vitest';
import * as brepjs from '@/index.js';

describe('public Sketcher exports', () => {
  it.each(['Sketcher', 'FaceSketcher', 'BaseSketcher2d', 'BlueprintSketcher'] as const)(
    '%s is a runtime value (constructor)',
    (name) => {
      expect(typeof (brepjs as Record<string, unknown>)[name]).toBe('function');
    }
  );
});
