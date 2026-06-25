import { describe, it, expect } from 'vitest';
import { parseXml, findChild, childText } from '../src/bcf/bcfXml.js';

/**
 * Low-level BCF XML tokenizer tests. The tokenizer reads untrusted `.bcfzip`
 * payloads, so the ReDoS-resistance cases below are load-bearing, not cosmetic:
 * the sticky-flag tokenizer must stay linear on hostile input.
 */

describe('parseXml', () => {
  it('parses a declaration, comment, nested elements, and attributes', () => {
    const node = parseXml(
      '<?xml version="1.0"?>\n<!-- c --><Root a="1" ns:b="x.y-z"><Child>hi &amp; bye</Child><Empty/></Root>'
    );
    expect(node.tag).toBe('Root');
    expect(node.attrs.a).toBe('1');
    expect(node.attrs['ns:b']).toBe('x.y-z');
    expect(childText(node, 'Child')).toBe('hi & bye');
    expect(findChild(node, 'Empty')?.children).toEqual([]);
  });

  it('throws on unbalanced tags', () => {
    expect(() => parseXml('<A><B></A>')).toThrow(/Unbalanced/);
  });

  it('throws on a tail it cannot tokenize (no silent mis-parse)', () => {
    // An unterminated comment is malformed XML; the sticky tokenizer stalls at
    // the offending offset rather than scanning forward and mis-tokenizing.
    expect(() => parseXml('<A/><!-- never closed')).toThrow(/Malformed XML/);
  });

  // Polynomial-ReDoS guards (CodeQL js/polynomial-redos). Each adversarial input
  // is O(n²) under a global-flag tokenizer — seconds-to-minutes at these sizes —
  // and linear (sub-millisecond) under the sticky tokenizer. The 1s budget is a
  // ~1000x margin over the fixed cost while still failing loudly on regression.
  const BUDGET_MS = 1000;
  it.each([
    ['unterminated comments', '<!--'.repeat(100_000)],
    ['unterminated processing instructions', '<?'.repeat(100_000)],
    ['attribute name run with no "="', `<a ${'-'.repeat(100_000)}/>`],
  ])('resists ReDoS: %s', (_label, payload) => {
    const t0 = performance.now();
    expect(() => parseXml(payload)).toThrow(/Malformed XML/);
    expect(performance.now() - t0).toBeLessThan(BUDGET_MS);
  });
});
