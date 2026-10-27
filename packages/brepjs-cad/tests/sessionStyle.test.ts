import { describe, it, expect } from 'vitest';
import type { ElementRecord } from '@/session/records.js';
import { sectionFraction } from '@/session/render.js';
import { HIGHLIGHT_COLOR, planStyle, selectIds, storeyPlan } from '@/session/style.js';

function rec(id: string, over: Partial<ElementRecord> = {}): ElementRecord {
  return {
    id,
    type: 'Wall',
    category: 'wall',
    children: [],
    relationships: [],
    hasGeometry: true,
    renderable: over.hasGeometry ?? true,
    ...over,
  };
}

const storey = { id: 'ground', name: 'Ground floor' };
const box = (zMin: number, zMax: number) => ({ xMin: 0, xMax: 1, yMin: 0, yMax: 1, zMin, zMax });
const RECORDS: ElementRecord[] = [
  rec('ground', {
    category: 'storey',
    type: 'Storey',
    name: 'Ground floor',
    hasGeometry: false,
    children: ['ground/room', 'ground/slab'],
  }),
  rec('ground/slab', { category: 'slab', type: 'Slab', storey, bounds: box(-200, 0) }),
  rec('ground/room', {
    category: 'Room',
    type: 'Room',
    hasGeometry: false,
    storey,
    children: ['ground/room/south'],
  }),
  rec('ground/room/south', {
    storey,
    bounds: box(0, 2700),
    children: ['ground/room/south/voids:d'],
  }),
  rec('ground/room/south/voids:d', {
    category: 'opening',
    type: 'Opening',
    storey,
    children: ['ground/room/south/voids:d/fill'],
  }),
  rec('ground/room/south/voids:d/fill', { category: 'door', type: 'Door', storey }),
  rec('upper', {
    category: 'storey',
    type: 'Storey',
    name: 'Upper',
    hasGeometry: false,
    props: { elevation: 3000 },
    children: ['upper/roof'],
  }),
  rec('upper/roof', {
    category: 'roof',
    type: 'Roof',
    storey: { id: 'upper', name: 'Upper' },
    bounds: box(3000, 3400),
  }),
];

const sorted = (ids: Iterable<string>) => [...ids].sort();

describe('render selection', () => {
  it('expands a container to everything under it, hosted openings and fills included', () => {
    expect(sorted(selectIds(RECORDS, ['ground/room']).ids)).toEqual([
      'ground/room/south',
      'ground/room/south/voids:d',
      'ground/room/south/voids:d/fill',
    ]);
  });

  it('keeps a selected element with geometry to itself', () => {
    expect(sorted(selectIds(RECORDS, ['ground/room/south']).ids)).toEqual(['ground/room/south']);
  });

  it('matches globs and reports patterns that select nothing', () => {
    const s = selectIds(RECORDS, ['**/fill', 'nowhere/*', 'gone']);
    expect(sorted(s.ids)).toEqual(['ground/room/south/voids:d/fill']);
    expect(s.unmatched).toEqual(['nowhere/*', 'gone']);
  });
});

describe('render style planning', () => {
  it('draws plainly when nothing is selected or colored', () => {
    const plan = planStyle(RECORDS, {});
    expect(plan.style).toBeUndefined();
    expect(plan.drawn).toBe(5);
  });

  it('highlights in orange and ghosts the rest', () => {
    const plan = planStyle(RECORDS, { highlight: ['**/fill'] });
    expect(plan.highlighted).toBe(1);
    expect(plan.style?.layers[0]).toEqual({
      keyPaths: ['ground/room/south/voids:d/fill'],
      color: HIGHLIGHT_COLOR,
      mode: 'solid',
    });
    expect(plan.style?.layers[1]?.mode).toBe('ghost');
    expect(plan.style?.layers[1]?.keyPaths).toHaveLength(4);
  });

  it('isolates, hiding everything else, and highlights only within what is drawn', () => {
    const plan = planStyle(RECORDS, {
      isolate: ['ground/room'],
      highlight: ['upper/roof', '**/fill'],
    });
    expect(plan.drawn).toBe(3);
    expect(plan.highlighted).toBe(1);
    expect(plan.style?.others).toBe('hidden');
  });

  it('counts only elements the picture can draw', () => {
    const broken = [
      ...RECORDS,
      rec('ground/broken', { storey, renderable: false, geometryError: 'makeBox' }),
    ];
    expect(planStyle(broken, { isolate: ['ground/broken'] }).drawn).toBe(0);
    expect(planStyle(broken, {}).drawn).toBe(5);
  });

  it('colors by group with a legend, largest group first', () => {
    const plan = planStyle(RECORDS, { colorBy: 'storey' });
    expect(plan.legend.map((l) => [l.label, l.count])).toEqual([
      ['Ground floor', 4],
      ['Upper', 1],
    ]);
    expect(new Set(plan.legend.map((l) => l.color)).size).toBe(2);
  });

  it('cuts a storey plan above the declared elevation, or above its lowest element', () => {
    const upper = storeyPlan(RECORDS, 'Upper');
    expect(upper?.section).toEqual({ axis: 'z', at: 4200, keep: 'below' });
    expect(sorted(upper?.members ?? [])).toEqual(['upper/roof']);
    const ground = storeyPlan(RECORDS, 'ground', 1000);
    expect(ground?.section.at).toBe(800);
    expect(storeyPlan(RECORDS, 'basement')).toBeUndefined();
  });

  it('maps an absolute cut onto the viewer section fraction', () => {
    const bounds = { xMin: 0, xMax: 10, yMin: 0, yMax: 10, zMin: -200, zMax: 2800 };
    expect(sectionFraction({ axis: 'z', at: 1300, keep: 'below' }, bounds)).toEqual({
      axis: 'z',
      frac: 0.5,
      flip: true,
    });
    expect(sectionFraction({ axis: 'x', at: 99, keep: 'above' }, bounds)?.frac).toBe(1);
    expect(sectionFraction(undefined, bounds)).toBeNull();
  });
});
