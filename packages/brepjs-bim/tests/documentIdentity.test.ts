import { initKernel } from '../../../tests/setup.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { box, unwrap } from 'brepjs';
import { BimDocument } from '../src/index.js';
import { identityPlacement } from '../src/types/placementDefinition.js';

beforeAll(() => initKernel(), 30000);

describe('document-issued references', () => {
  it('resolves a key in its own document even when another document used the same key', () => {
    using left = new BimDocument();
    using right = new BimDocument();
    const create = (doc: BimDocument) =>
      unwrap(
        doc.addAuthoredBody({
          category: 'SIGN',
          placement: identityPlacement,
          solids: [box(2, 3, 4)],
          stableKey: 'sign/A',
        })
      );
    const a = create(left);
    const b = create(right);
    expect(a).not.toBe(b);
    expect(unwrap(left.lookupKey('sign/A'))).toBe(a);
    expect(unwrap(right.lookupKey('sign/A'))).toBe(b);
    expect(unwrap(left.record(a)).guid).toBe(unwrap(right.record(b)).guid);
    expect(left.record(b)).toMatchObject({ ok: false, error: { code: 'RECORD_NOT_FOUND' } });
    using supplied = box(1, 2, 3);
    expect(
      left.replaceBody({ localId: b, body: { kind: 'AUTHORITATIVE', solids: [supplied] } }).ok
    ).toBe(false);
    expect(right.record(b).ok).toBe(true);
    left[Symbol.dispose]();
    expect(left.record(a).ok).toBe(false);
  });
});
