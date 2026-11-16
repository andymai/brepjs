import { describe, expect, it } from 'vitest';
import { CATEGORIES, EXAMPLES } from '../apps/playground/src/lib/examples/index.js';
import {
  buildSearchIndex,
  importedApi,
  searchExamples,
} from '../apps/playground/src/lib/examples/search.js';

const index = buildSearchIndex(CATEGORIES);
const ids = (query: string) => searchExamples(index, query).map((hit) => hit.entry.example.id);

describe('playground example search', () => {
  it('reads function names from the imports and leaves types out', () => {
    const code = [
      "import { box, cut as carve, type Shape, Solid } from 'brepjs/quick';",
      "import { color } from 'brepjs/playground';",
    ].join('\n');
    expect(importedApi(code)).toEqual(['box', 'cut', 'color']);
  });

  it('returns every example in gallery order for an empty query', () => {
    expect(ids('  ')).toEqual(EXAMPLES.map((e) => e.id));
  });

  it('leads the gallery with the showcase category', () => {
    expect(CATEGORIES[0]?.id).toBe('showcase');
  });

  it('ranks a label match above a description match', () => {
    const inLabel = ids('gear').map(
      (id) =>
        EXAMPLES.find((e) => e.id === id)
          ?.label.toLowerCase()
          .includes('gear') ?? false
    );
    expect(inLabel[0]).toBe(true);
    // Once a description match appears, no label match comes after it.
    expect(
      inLabel.slice(inLabel.indexOf(false)).every((hit) => !hit) || !inLabel.includes(false)
    ).toBe(true);
  });

  it('needs every word of the query to match', () => {
    const both = ids('worm gear');
    expect(both).toContain('worm-gear-drive');
    expect(both.length).toBeLessThan(ids('gear').length);
    expect(ids('gear zzzznothing')).toEqual([]);
  });

  it('finds an example by a function it imports and reports the function', () => {
    const hits = searchExamples(index, 'loft');
    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) {
      const inText = `${hit.entry.label} ${hit.entry.description}`.includes('loft');
      if (!inText) expect(hit.matchedApi).toContain('loft');
    }
  });

  it('finds examples by category name', () => {
    const sheet = CATEGORIES.find((c) => c.id === 'sheet-metal');
    for (const example of sheet?.examples ?? []) expect(ids('sheet metal')).toContain(example.id);
  });
});
