import { describe, it, expect } from 'vitest';
import { queryTerms, ReferenceIndex, searchSections, sectionsOf } from '@/session/reference.js';

const DOC = [
  '# Guide',
  'intro text',
  '## Walls',
  'A wall hosts openings.',
  '```ts',
  '# not a heading inside a fence',
  '```',
  '### Fill role',
  'A fill-role void synthesizes an Opening; the door fills it.',
  '## Slabs',
  'Slabs are plates.',
].join('\n');

describe('reference index', () => {
  it('splits markdown at headings, keeping the trail and ignoring fenced lines', () => {
    const sections = sectionsOf('guide.md', DOC);
    expect(sections.map((s) => s.heading)).toEqual([
      'Guide',
      'Guide > Walls',
      'Guide > Walls > Fill role',
      'Guide > Slabs',
    ]);
    expect(sections[1]?.text).toContain('# not a heading inside a fence');
  });

  it('ranks sections by how many query terms they contain', () => {
    const hits = searchSections(sectionsOf('guide.md', DOC), 'fill opening wall', 3);
    // The heading trail counts too: 'Walls' comes from the parent heading.
    expect(hits[0]).toMatchObject({ heading: 'Guide > Walls > Fill role', matched: 3 });
    expect(hits.map((h) => h.heading)).toContain('Guide > Walls');
    expect(searchSections(sectionsOf('guide.md', DOC), 'x', 3)).toEqual([]);
  });

  it('keeps identifier-ish terms whole', () => {
    expect(queryTerms('Pset_WallCommon.FireRating, a  toIfc()')).toEqual([
      'pset_wallcommon.firerating',
      'toifc',
    ]);
  });

  it('bundles the API reference, the families docs and the IFC guide', () => {
    const index = new ReferenceIndex();
    const names = index.docs.map((d) => d.name);
    expect(names).toEqual(
      expect.arrayContaining(['llms-full.txt', 'families-bim.md', 'families/openings.md'])
    );
    const top = index.search('fill role opening', 3)[0];
    expect(top?.doc).toBe('families/openings.md');
    expect(index.search('fillet chamfer', 5).some((h) => h.doc === 'llms.txt')).toBe(false);
    expect(index.read('families/openings.md')).toContain('Opening');
    expect(index.read('../../package.json')).toBeUndefined();
  });
});
