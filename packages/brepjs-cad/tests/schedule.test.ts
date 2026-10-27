import { describe, it, expect } from 'vitest';
import type { ElementRecord } from '@/session/records.js';
import {
  fieldValue,
  runSchedule,
  schedulableFields,
  ScheduleError,
  toCsv,
} from '@/session/schedule.js';

function rec(id: string, over: Partial<ElementRecord> = {}): ElementRecord {
  return {
    id,
    type: 'Wall',
    category: 'wall',
    children: [],
    relationships: [],
    hasGeometry: true,
    renderable: true,
    ...over,
  };
}

const ground = { id: 'ground', name: 'Ground' };
const upper = { id: 'upper', name: 'Upper' };
const RECORDS = [
  rec('a', {
    name: 'A',
    storey: ground,
    props: { height: 2700, at: [0, 0, 0] },
    psets: { Pset_WallCommon: { FireRating: 'REI60' } },
  }),
  rec('b', { name: 'B', storey: ground, props: { height: 3000 } }),
  rec('c', { name: 'C, "quoted"', storey: upper, props: { height: 2700 }, volume: 5 }),
];
const QUANTITIES = {
  a: { Qto_WallBaseQuantities: { Length: 4, NetVolume: 1.5 } },
  b: { Qto_WallBaseQuantities: { Length: 6, NetVolume: 2 } },
};

describe('schedule fields', () => {
  it('reads built-ins, prop paths, pset and quantity properties', () => {
    const [a] = RECORDS;
    if (!a) throw new Error('no record');
    expect(fieldValue(a, 'storey')).toBe('Ground');
    expect(fieldValue(a, 'family')).toBe('Wall');
    expect(fieldValue(a, 'props.at.2')).toBe(0);
    expect(fieldValue(a, 'psets.Pset_WallCommon.FireRating')).toBe('REI60');
    expect(fieldValue(a, 'quantities.Qto_WallBaseQuantities.Length', QUANTITIES)).toBe(4);
    expect(() => fieldValue(a, 'colour')).toThrow(ScheduleError);
  });

  it('lists the fields a selection carries, with types and counts', () => {
    const fields = schedulableFields(RECORDS, QUANTITIES);
    const byName = new Map(fields.map((f) => [f.field, f]));
    expect(byName.get('props.height')).toEqual({ field: 'props.height', type: 'number', count: 3 });
    expect(byName.get('quantities.Qto_WallBaseQuantities.Length')).toMatchObject({ count: 2 });
    expect(byName.get('psets.Pset_WallCommon.FireRating')).toMatchObject({
      type: 'string',
      count: 1,
    });
    expect(byName.has('props.at')).toBe(false);
    expect(fields[0]?.count).toBe(3);
  });
});

describe('schedule tables', () => {
  it('lists one row per element, sorted, with totals over numeric fields', () => {
    const t = runSchedule(
      RECORDS,
      {
        fields: ['name', 'props.height'],
        sortBy: [{ field: 'props.height', descending: true }, { field: 'name' }],
      },
      QUANTITIES
    );
    expect(t.columns).toEqual(['name', 'props.height']);
    expect(t.rows).toEqual([
      ['B', 3000],
      ['A', 2700],
      ['C, "quoted"', 2700],
    ]);
    expect(t.totals).toEqual({ 'props.height': 8400 });
  });

  it('groups with a count and the sum of each other numeric field', () => {
    const t = runSchedule(
      RECORDS,
      {
        fields: ['storey', 'quantities.Qto_WallBaseQuantities.Length'],
        groupBy: ['storey'],
        sortBy: [{ field: 'storey' }],
      },
      QUANTITIES
    );
    expect(t.columns).toEqual(['storey', 'count', 'sum(quantities.Qto_WallBaseQuantities.Length)']);
    expect(t.rows).toEqual([
      ['Ground', 2, 10],
      ['Upper', 1, 0],
    ]);
  });

  it('writes CSV with quoting for commas and quotes', () => {
    expect(
      toCsv(
        ['name', 'h'],
        [
          ['C, "quoted"', 2700],
          ['B', null],
        ]
      )
    ).toBe('name,h\n"C, ""quoted""",2700\nB,\n');
  });
});

describe('schedule edge cases', () => {
  const dotted = rec('d', { psets: { 'Vendor.Wall': { Rating: 'A' }, Vendor: { Code: 'V1' } } });

  it('reads properties of sets whose names contain dots', () => {
    expect(fieldValue(dotted, 'psets.Vendor.Wall.Rating')).toBe('A');
    expect(fieldValue(dotted, 'psets.Vendor.Code')).toBe('V1');
    const listed = schedulableFields([dotted]).map((f) => f.field);
    for (const f of listed.filter((x) => x.startsWith('psets.'))) {
      expect(fieldValue(dotted, f)).toBeDefined();
    }
  });

  it('keeps blanks last when a column sorts descending', () => {
    const t = runSchedule([rec('x', { volume: 1 }), rec('y'), rec('z', { volume: 3 })], {
      fields: ['id', 'volume'],
      sortBy: [{ field: 'volume', descending: true }],
    });
    expect(t.rows.map((r) => r[0])).toEqual(['z', 'x', 'y']);
  });

  it('discovers fields over many elements without slowing down', () => {
    const many = Array.from({ length: 20000 }, (_, i) =>
      rec(`w${i}`, { name: `W${i}`, props: { height: i, length: 3000 } })
    );
    const started = Date.now();
    const fields = schedulableFields(many);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(fields.find((f) => f.field === 'props.height')).toEqual({
      field: 'props.height',
      type: 'number',
      count: 20000,
    });
  });
});
