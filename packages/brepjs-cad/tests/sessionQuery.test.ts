import { describe, it, expect } from 'vitest';
import { diffBuilds, newGeometryFailures } from '@/session/diff.js';
import { breakdown, globMatcher, matcher, parseWhere, project, tree } from '@/session/query.js';
import { canonicalJson, jsonSafe, type ElementRecord } from '@/session/records.js';

function rec(id: string, over: Partial<ElementRecord> = {}): ElementRecord {
  return {
    id,
    keyPath: id,
    type: 'Wall',
    archetype: 'wall',
    category: 'wall',
    children: [],
    relationships: [],
    hasGeometry: true,
    ...over,
  };
}

const storey = { id: 'ground', name: 'Ground floor' };
const RECORDS: ElementRecord[] = [
  rec('ground', {
    type: 'Storey',
    archetype: 'storey',
    category: 'storey',
    hasGeometry: false,
    children: ['ground/south', 'ground/north'],
  }),
  rec('ground/south', {
    parent: 'ground',
    storey,
    name: 'South wall',
    props: { length: 6000, height: 2700, at: [0, 0, 0] },
    psets: { Pset_WallCommon: { FireRating: 'REI120', IsExternal: true } },
    bounds: { xMin: 0, xMax: 6000, yMin: 0, yMax: 200, zMin: 0, zMax: 2700 },
    children: ['ground/south/voids:entry'],
  }),
  rec('ground/south/voids:entry', {
    parent: 'ground/south',
    storey,
    type: 'Opening',
    archetype: 'opening',
    category: 'opening',
    bounds: { xMin: 2500, xMax: 3500, yMin: 0, yMax: 300, zMin: 0, zMax: 2100 },
  }),
  rec('ground/north', {
    parent: 'ground',
    storey,
    props: { length: 6000, height: 3000 },
    quantities: { Qto_WallBaseQuantities: { Length: 6 } },
    bounds: { xMin: 0, xMax: 6000, yMin: 3800, yMax: 4000, zMin: 0, zMax: 3000 },
  }),
];

const ids = (where: unknown) => RECORDS.filter(matcher(parseWhere(where))).map((r) => r.id);

describe('session query', () => {
  it('matches categories and families case-insensitively', () => {
    expect(ids({ category: 'WALL' })).toEqual(['ground/south', 'ground/north']);
    expect(ids({ category: ['opening', 'Storey'] })).toEqual([
      'ground',
      'ground/south/voids:entry',
    ]);
    expect(ids({ family: 'wall' })).toEqual(['ground/south', 'ground/north']);
  });

  it('globs ids within a segment with * and across segments with **', () => {
    expect(globMatcher('ground/*/voids:*')('ground/south/voids:entry')).toBe(true);
    expect(globMatcher('ground/*')('ground/south/voids:entry')).toBe(false);
    expect(globMatcher('ground/**')('ground/south/voids:entry')).toBe(true);
    expect(globMatcher('**/voids:?1')('ground/annex/voids:w1')).toBe(true);
    expect(globMatcher('ground/?')('ground//')).toBe(false);
    expect(globMatcher('a.b')('aXb')).toBe(false);
    expect(globMatcher('SOUTH*', true)('south wall')).toBe(true);
    expect(globMatcher('SOUTH*')('south wall')).toBe(false);
    expect(ids({ id: 'ground/*/voids:*' })).toEqual(['ground/south/voids:entry']);
  });

  it('folds case the same way on both sides', () => {
    expect(globMatcher('ΟΣ', true)('ΟΣ')).toBe(true);
    expect(globMatcher('ΟΣ*', true)('ΟΣΑ')).toBe(true);
    expect(globMatcher('οσ', true)('ΟΣ')).toBe(true);
    expect(globMatcher('*ος', true)('ΚΟΣΜΟΣ')).toBe(true);
    expect(globMatcher('İstanbul', true)('İstanbul')).toBe(true);
    expect(globMatcher('i̇stanbul*', true)('İSTANBUL office')).toBe(true);
  });

  it('matches backtracking-hostile globs in bounded time', () => {
    const started = Date.now();
    expect(globMatcher('*a'.repeat(30) + 'b')('a'.repeat(5000))).toBe(false);
    expect(globMatcher('**a'.repeat(30) + 'b')('a/'.repeat(2500))).toBe(false);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(() => globMatcher('*'.repeat(600))).toThrow(/limited to 512/);
  });

  it('filters by storey name, element name, and geometry', () => {
    expect(ids({ storey: 'ground*', hasGeometry: true })).toHaveLength(3);
    expect(ids({ storey: 'ground' })).toHaveLength(3);
    expect(ids({ name: 'south*' })).toEqual(['ground/south']);
    expect(ids({ hasGeometry: false })).toEqual(['ground']);
  });

  it('evaluates prop, pset, and quantity predicates', () => {
    expect(ids({ props: [{ path: 'height', op: 'gt', value: 2800 }] })).toEqual(['ground/north']);
    expect(ids({ props: [{ path: 'at.0', value: 0 }] })).toEqual(['ground/south']);
    expect(ids({ props: [{ path: 'at' }] })).toEqual(['ground/south']);
    expect(ids({ psets: [{ path: 'Pset_WallCommon.FireRating', value: 'REI120' }] })).toEqual([
      'ground/south',
    ]);
    expect(
      ids({ psets: [{ path: 'Pset_WallCommon.FireRating', op: 'contains', value: 'rei' }] })
    ).toEqual(['ground/south']);
    expect(
      ids({ psets: [{ path: 'Qto_WallBaseQuantities.Length', op: 'gte', value: 6 }] })
    ).toEqual(['ground/north']);
    expect(ids({ props: [{ path: 'height', op: 'in', value: [2700, 1] }] })).toEqual([
      'ground/south',
    ]);
  });

  it('filters by bounds, intersecting or within', () => {
    expect(ids({ bounds: { min: [2000, -1, -1], max: [3000, 250, 3000] } })).toEqual([
      'ground/south',
      'ground/south/voids:entry',
    ]);
    expect(
      ids({ bounds: { min: [2000, -1, -1], max: [4000, 400, 3000], mode: 'within' } })
    ).toEqual(['ground/south/voids:entry']);
  });

  it('rejects malformed filters with a message naming the field', () => {
    expect(() => parseWhere({ colour: 'red' })).toThrow(/unknown where.colour/);
    expect(() => parseWhere({ props: [{ path: 'x', op: 'like', value: 1 }] })).toThrow(
      /op must be one of/
    );
    expect(() => parseWhere({ props: [{ path: 'x', op: 'gt' }] })).toThrow(/needs a value/);
    expect(() => parseWhere({ bounds: { min: [0, 0] } })).toThrow(/bounds.min/);
    expect(() => parseWhere({ hasGeometry: 'yes' })).toThrow(/boolean/);
  });

  it('breaks counts down by category, storey, and family', () => {
    const b = breakdown(RECORDS);
    expect(b.category).toEqual({ storey: 1, wall: 2, opening: 1 });
    expect(b.storey).toEqual({ '(none)': 1, 'Ground floor': 3 });
    expect(b.family).toEqual({ Storey: 1, Wall: 2, Opening: 1 });
  });

  it('projects identity always and the requested field groups', () => {
    const south = RECORDS[1] as ElementRecord;
    const identity = project(south, new Set());
    expect(identity).toEqual({
      id: 'ground/south',
      type: 'Wall',
      archetype: 'wall',
      category: 'wall',
      name: 'South wall',
      parent: 'ground',
      storey,
    });
    const withPsets = project(south, new Set(['psets', 'geometry']));
    expect(withPsets['psets']).toEqual(south.psets);
    expect(withPsets['bounds']).toEqual(south.bounds);
    expect(withPsets['props']).toBeUndefined();
  });

  it('nests records into a tree and returns the unreachable ones separately', () => {
    const orphan = rec('loose', { parent: 'gone' });
    const { root, unparented } = tree([...RECORDS, orphan], 'ground');
    expect(root?.children?.map((c) => c.id)).toEqual(['ground/south', 'ground/north']);
    expect(root?.children?.[0]?.children?.[0]?.id).toBe('ground/south/voids:entry');
    expect(unparented.map((n) => n.id)).toEqual(['loose']);
  });
});

describe('build diff', () => {
  it('reports only the elements whose data or geometry changed', () => {
    const before = RECORDS.map((r) => ({ ...r, geometryHash: `h-${r.id}` }));
    const after = before.map((r) =>
      r.id === 'ground/south'
        ? {
            ...r,
            props: { ...r.props, height: 3000 },
            psets: { Pset_WallCommon: { FireRating: 'REI60', IsExternal: true } },
            geometryHash: 'h-new',
            volume: 10,
            bounds: { xMin: 0, xMax: 6000, yMin: 0, yMax: 200, zMin: 0, zMax: 3000 },
          }
        : r
    );
    const withVolume = before.map((r) => (r.id === 'ground/south' ? { ...r, volume: 4 } : r));
    const d = diffBuilds(withVolume, after);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
    expect(d.unchanged).toBe(3);
    expect(d.changed).toEqual([
      {
        id: 'ground/south',
        props: { height: { before: 2700, after: 3000 } },
        psets: { 'Pset_WallCommon.FireRating': { before: 'REI120', after: 'REI60' } },
        geometryChanged: true,
        volumeDelta: 6,
        boundsDelta: { zMax: 300 },
      },
    ]);
  });

  it('reports adds, removes, identity fields, and relationship changes', () => {
    const before = [
      rec('a', { name: 'A', relationships: [{ kind: 'Voids', target: 'a/voids:x' }] }),
      rec('gone'),
    ];
    const after = [rec('a', { name: 'A2', relationships: [] }), rec('new')];
    const d = diffBuilds(before, after);
    expect(d.added).toEqual(['new']);
    expect(d.removed).toEqual(['gone']);
    expect(d.changed[0]).toMatchObject({
      id: 'a',
      fields: { name: { before: 'A', after: 'A2' } },
      relationships: { added: [], removed: [{ kind: 'Voids', target: 'a/voids:x' }] },
    });
  });

  it('compares IFC geometry by volume and bounds when there is no structural hash', () => {
    const b = rec('g', {
      volume: 100,
      bounds: { xMin: 0, xMax: 1, yMin: 0, yMax: 1, zMin: 0, zMax: 1 },
    });
    expect(diffBuilds([b], [{ ...b, volume: 100 + 1e-9 }]).changed).toEqual([]);
    expect(diffBuilds([b], [{ ...b, volume: 101 }]).changed[0]?.geometryChanged).toBe(true);
  });
});

describe('geometry regressions', () => {
  it('flags only elements whose geometry newly fails', () => {
    const before = [rec('a'), rec('b', { geometryError: 'already broken' })];
    const after = [
      rec('a', { geometryError: 'makeBox failed' }),
      rec('b', { geometryError: 'still broken' }),
      rec('c', { geometryError: 'new and broken' }),
    ];
    expect(newGeometryFailures(before, after).map((r) => r.id)).toEqual(['a', 'c']);
    expect(newGeometryFailures(after, after)).toEqual([]);
  });
});

describe('record projection', () => {
  it('turns nested elements into refs and drops functions', () => {
    const door = {
      type: Object.assign(() => null, { familyName: 'Door' }),
      key: 'entry',
      props: {},
      children: [],
    };
    expect(jsonSafe({ voids: [door], render: () => 1, n: 1, big: 10n, inf: Infinity })).toEqual({
      voids: [{ element: 'Door', key: 'entry' }],
      n: 1,
      big: '10',
      inf: 'Infinity',
    });
    expect(jsonSafe({ node: { kind: 'Box', structuralHash: 1n } })).toEqual({
      node: { ir: 'Box' },
    });
    expect(jsonSafe(new Float32Array([1, 2, 3]))).toEqual([1, 2, 3]);
  });

  it('keeps every entry, so an edit deep in a long array still changes the record', () => {
    const long = Array.from({ length: 300 }, (_, i) => i);
    const edited = [...long];
    edited[250] = -1;
    expect(jsonSafe(long)).toHaveLength(300);
    expect(canonicalJson(jsonSafe({ xs: long }))).not.toBe(canonicalJson(jsonSafe({ xs: edited })));
    const loop: Record<string, unknown> = { a: 1 };
    loop['self'] = loop;
    expect(jsonSafe(loop)).toEqual({ a: 1, self: '[circular]' });
    expect(jsonSafe({ m: new Map([['k', 1]]), s: new Set([2]) })).toEqual({
      m: { map: [['k', 1]] },
      s: { set: [2] },
    });
  });

  it('serializes equal objects identically regardless of key order', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(
      canonicalJson({ a: { c: 3, d: 2 }, b: 1 })
    );
  });
});
