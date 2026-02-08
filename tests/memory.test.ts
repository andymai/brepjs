import { describe, expect, it } from 'vitest';
import { gcWithScope, gcWithObject, localGC, type Deletable } from '../src/core/memory.js';

/** Simple mock deletable for unit-level tests. */
function mockDeletable(): Deletable & { deleted: boolean } {
  return {
    deleted: false,
    delete() {
      this.deleted = true;
    },
  };
}

describe('localGC', () => {
  it('registers and deletes all tracked objects', () => {
    const [r, gc] = localGC();
    const a = r(mockDeletable());
    const b = r(mockDeletable());
    const c = r(mockDeletable());

    expect(a.deleted).toBe(false);
    expect(b.deleted).toBe(false);

    gc();

    expect(a.deleted).toBe(true);
    expect(b.deleted).toBe(true);
    expect(c.deleted).toBe(true);
  });

  it('returns tracked set in debug mode', () => {
    const [r, gc, debugSet] = localGC(true);
    const a = r(mockDeletable());
    r(mockDeletable());

    expect(debugSet).toBeDefined();
    expect(debugSet?.size).toBe(2);
    expect(debugSet?.has(a)).toBe(true);

    gc();
    expect(debugSet?.size).toBe(0);
  });

  it('does not return debug set when debug is false', () => {
    const [, , debugSet] = localGC(false);
    expect(debugSet).toBeUndefined();
  });

  it('handles empty cleanup gracefully', () => {
    const [, gc] = localGC();
    expect(() => { gc(); }).not.toThrow();
  });
});

describe('gcWithScope', () => {
  it('returns the value it wraps', () => {
    const r = gcWithScope();
    const obj = mockDeletable();
    const result = r(obj);
    expect(result).toBe(obj);
  });
});

describe('gcWithObject', () => {
  it('returns the value it wraps', () => {
    const holder = {};
    const r = gcWithObject(holder);
    const obj = mockDeletable();
    const result = r(obj);
    expect(result).toBe(obj);
  });
});
