import { describe, it, expect } from 'vitest';
import { newIfcGuid, isValidIfcGuid, encodeIfcGuid } from '../src/identity/ifcGuid.js';
import { makeLocalIdCounter } from '../src/identity/localId.js';

describe('IfcGuid', () => {
  it('produces a 22-character string', () => {
    const guid = newIfcGuid();
    expect(guid).toHaveLength(22);
  });

  it('uses only the IFC alphabet', () => {
    const IFC_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
    const guid = newIfcGuid();
    for (const ch of guid) {
      expect(IFC_CHARS).toContain(ch);
    }
  });

  it('produces unique values', () => {
    const guids = new Set(Array.from({ length: 100 }, () => newIfcGuid()));
    expect(guids.size).toBe(100);
  });

  it('validates a known-good GUID', () => {
    expect(isValidIfcGuid('0YD2wbqJz7kf6Ds9qe9kVH')).toBe(true);
  });

  it('rejects a GUID with invalid characters', () => {
    expect(isValidIfcGuid('0YD2wbqJz7kf6Ds9qe9k+H')).toBe(false);
  });

  it("first character is always 0-3 (the 128-bit GUID's 4-bit front slack)", () => {
    for (let i = 0; i < 200; i++) {
      const guid = newIfcGuid();
      expect('0123').toContain(guid[0]);
    }
  });

  it('rejects an otherwise-valid GUID whose first char exceeds 3', () => {
    // 22 valid-alphabet chars but the leading char encodes >2 bits — a malformed
    // GlobalId that length-only checks miss but real IFC tools reject.
    expect(isValidIfcGuid('AYD2wbqJz7kf6Ds9qe9kVH')).toBe(false);
  });

  it('encodes the canonical buildingSMART compression', () => {
    expect(encodeIfcGuid(new Uint8Array(16))).toBe('0000000000000000000000');
    expect(encodeIfcGuid(new Uint8Array(16).fill(0xff))).toBe(`3${'$'.repeat(21)}`);
  });
});

describe('LocalId', () => {
  it('produces sequential integers starting at 1', () => {
    const counter = makeLocalIdCounter();
    expect(counter.next()).toBe(1);
    expect(counter.next()).toBe(2);
    expect(counter.next()).toBe(3);
  });

  it('each counter is independent', () => {
    const a = makeLocalIdCounter();
    const b = makeLocalIdCounter();
    a.next();
    a.next();
    expect(b.next()).toBe(1);
  });
});
