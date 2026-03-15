import { describe, expect, it, beforeAll } from 'vitest';
import { currentKernel, initKernel } from './setup.js';
import {
  box,
  cast,
  downcast,
  iterTopo,
  asTopo,
  fromBREP,
  toBREP,
  isCompSolid,
  isShape3D,
  isWire,
  castShape,
  getKernel,
  isOk,
  isErr,
  unwrap,
  unwrapErr,
} from '../src/index.js';

describe('cast', () => {
  beforeAll(async () => {
    await initKernel();
  }, 30000);

  describe('cast()', () => {
    it('returns Ok for a valid box shape', () => {
      const b = box(10, 10, 10);
      const result = cast(b.wrapped);
      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBeDefined();
    });

    it.skipIf(currentKernel !== 'occt')(
      'returns Err with NULL_SHAPE for a null KernelShape',
      () => {
        const oc = getKernel().oc;
        const nullShape = new oc.TopoDS_Solid();
        const result = cast(nullShape);
        expect(isErr(result)).toBe(true);
        expect(unwrapErr(result).code).toBe('NULL_SHAPE');
      }
    );
  });

  describe('downcast()', () => {
    it('returns Ok for a valid box wrapped shape', () => {
      const b = box(10, 10, 10);
      const result = downcast(b.wrapped);
      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBeDefined();
    });

    it.skipIf(currentKernel !== 'occt')('returns Err for a null KernelShape', () => {
      const oc = getKernel().oc;
      const nullShape = new oc.TopoDS_Solid();
      const result = downcast(nullShape);
      expect(isErr(result)).toBe(true);
      expect(unwrapErr(result).code).toBe('NULL_SHAPE');
    });
  });

  describe('asTopo()', () => {
    it('returns defined values for all entity types', () => {
      const entities = [
        'vertex',
        'edge',
        'wire',
        'face',
        'shell',
        'solid',
        'solidCompound',
        'compound',
        'shape',
      ] as const;

      for (const entity of entities) {
        expect(asTopo(entity)).toBeDefined();
      }
    });

    it('returns distinct values for distinct topology types', () => {
      const distinctEntities = [
        'vertex',
        'edge',
        'wire',
        'face',
        'shell',
        'solid',
        'solidCompound',
        'compound',
      ] as const;

      const values = distinctEntities.map((e) => asTopo(e));
      // kernel enum values are WASM objects — compare with !== to verify uniqueness
      for (let i = 0; i < values.length; i++) {
        for (let j = i + 1; j < values.length; j++) {
          expect(values[i]).not.toBe(values[j]);
        }
      }
    });
  });

  describe('iterTopo()', () => {
    it('yields 12 edges for a box', () => {
      const b = box(10, 10, 10);
      const edges = [...iterTopo(b.wrapped, 'edge')];
      expect(edges).toHaveLength(12);
    });

    it('yields 6 faces for a box', () => {
      const b = box(10, 10, 10);
      const faces = [...iterTopo(b.wrapped, 'face')];
      expect(faces).toHaveLength(6);
    });

    it('yields 8 vertices for a box', () => {
      const b = box(10, 10, 10);
      const vertices = [...iterTopo(b.wrapped, 'vertex')];
      expect(vertices).toHaveLength(8);
    });
  });

  describe('fromBREP()', () => {
    it.skipIf(currentKernel !== 'occt')('round-trips a box through toBREP and fromBREP', () => {
      const b = box(10, 10, 10);
      const brep = toBREP(b);
      const result = fromBREP(brep);
      expect(isOk(result)).toBe(true);
      const shape = unwrap(result);
      expect(isShape3D(shape)).toBe(true);
    });

    it.skipIf(currentKernel !== 'occt')('does not throw for garbage input', () => {
      expect(() => {
        const result = fromBREP('this is not valid BREP data');
        // Result may be ok or err depending on kernel behavior, but it must not throw
        expect(isOk(result) || isErr(result)).toBe(true);
      }).not.toThrow();
    });
  });

  describe('type guards', () => {
    it('isCompSolid returns false for a box', () => {
      const b = castShape(box(10, 10, 10).wrapped);
      expect(isCompSolid(b)).toBe(false);
    });

    it('isShape3D returns true for a box', () => {
      const b = castShape(box(10, 10, 10).wrapped);
      expect(isShape3D(b)).toBe(true);
    });

    it('isWire returns false for a box', () => {
      const b = castShape(box(10, 10, 10).wrapped);
      expect(isWire(b)).toBe(false);
    });
  });
});
