import { describe, it, expect } from 'vitest';
import { deriveIfcGuid, makeElementKey, makeRelKey } from '../src/identity/guidDerivation.js';
import { isValidIfcGuid } from '../src/identity/ifcGuid.js';

describe('deriveIfcGuid', () => {
  it('is deterministic: same key yields identical GlobalId across calls', async () => {
    const a = await deriveIfcGuid('elem:WALL:1');
    const b = await deriveIfcGuid('elem:WALL:1');
    expect(a).toBe(b);
  });

  it('produces a valid 22-character IFC GUID', async () => {
    const guid = await deriveIfcGuid('elem:WALL:1');
    expect(guid).toHaveLength(22);
    expect(isValidIfcGuid(guid)).toBe(true);
  });

  it('different inputs yield different GlobalIds', async () => {
    const a = await deriveIfcGuid('elem:WALL:1');
    const b = await deriveIfcGuid('elem:WALL:2');
    expect(a).not.toBe(b);
  });

  it('is collision-resistant across many distinct keys', async () => {
    const keys = Array.from({ length: 1000 }, (_, i) => `elem:WALL:${i}`);
    const guids = await Promise.all(keys.map((k) => deriveIfcGuid(k)));
    const unique = new Set(guids);
    expect(unique.size).toBe(keys.length);
    for (const guid of guids) {
      expect(isValidIfcGuid(guid)).toBe(true);
    }
  });

  it('isolates key-space by namespace (keys that differ only in prefix differ)', async () => {
    const a = await deriveIfcGuid('elem:WALL:1');
    const b = await deriveIfcGuid('pset:WALL:1');
    expect(a).not.toBe(b);
  });
});

describe('key composition helpers', () => {
  it('makeElementKey composes a stable, model-scoped element key', () => {
    expect(makeElementKey('proj-1', 'WALL', 3)).toBe('elem:proj-1:WALL:3');
  });

  it('makeRelKey composes a stable, model-scoped relationship key', () => {
    expect(makeRelKey('proj-1', 'CONTAINED_IN', 7)).toBe('rel:proj-1:CONTAINED_IN:7');
  });

  it('distinct model scopes yield distinct keys (no cross-model collision)', () => {
    expect(makeElementKey('proj-1', 'WALL', 3)).not.toBe(makeElementKey('proj-2', 'WALL', 3));
  });

  it('composed keys derive deterministically', async () => {
    const a = await deriveIfcGuid(makeElementKey('proj-1', 'WALL', 3));
    const b = await deriveIfcGuid(makeElementKey('proj-1', 'WALL', 3));
    expect(a).toBe(b);
    expect(isValidIfcGuid(a)).toBe(true);
  });
});
