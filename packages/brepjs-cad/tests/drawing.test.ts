import { describe, it, expect } from 'vitest';
import { initOcctWasm, loadBrep } from '@/verify/brepjsRuntime.js';
import {
  BEYOND_LAYER,
  drawElements,
  drawingFrame,
  type DrawingGeometry,
} from '@/session/drawing.js';
import { drawingSvg, dxfEntities } from '@/session/drawingFormats.js';
import { measureSpace } from '@/session/spaces.js';

const brep = await loadBrep();
await initOcctWasm(brep);

/** A box moved by `by`; translate copies, so the box it starts from is freed. */
function boxAt(size: [number, number, number], by: [number, number, number]) {
  using raw = brep.box(...size);
  return brep.translate(raw, by);
}

/** A tall wall at x 0..1000 and a low plinth at x 2000..3000, both 1000 deep in y. */
function model() {
  return [
    {
      id: 'wall',
      category: 'wall',
      shapes: [brep.box(1000, 1000, 3000)],
    },
    {
      id: 'plinth',
      category: 'slab',
      shapes: [boxAt([1000, 1000, 500], [2000, 0, 0])],
    },
  ];
}

function extent(g: DrawingGeometry, layer: (name: string) => boolean) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of g.polylines) {
    if (!layer(p.layer)) continue;
    for (const [x, y] of p.points) {
      xs.push(x);
      ys.push(y);
    }
  }
  return { x: [Math.min(...xs), Math.max(...xs)], y: [Math.min(...ys), Math.max(...ys)] };
}

describe('drawing frames', () => {
  it('draws a plan with x east and y north, and every section with z up', () => {
    expect(drawingFrame('z', 1)).toMatchObject({ x: [1, 0, 0], y: [0, 1, 0] });
    for (const axis of ['x', 'y'] as const) {
      for (const side of [1, -1] as const) {
        const { y, x, toward } = drawingFrame(axis, side);
        expect(y).toEqual([0, 0, 1]);
        // Right-handed: x × y points at the viewer.
        const cross = [
          x[1] * y[2] - x[2] * y[1] + 0,
          x[2] * y[0] - x[0] * y[2] + 0,
          x[0] * y[1] - x[1] * y[0] + 0,
        ];
        expect(cross).toEqual(toward);
      }
    }
  });
});

describe('drawElements', () => {
  it('cuts what the plane crosses and projects what lies below it', () => {
    const elements = model();
    const plan = drawElements(brep, elements, { axis: 'z', at: 1200, side: 1 });
    expect(plan.cut).toEqual(['wall']);
    expect(plan.beyond).toEqual(['wall', 'plinth']);
    const cut = extent(plan, (l) => l === 'CUT-WALL');
    expect(cut.x[0]).toBeCloseTo(0, 3);
    expect(cut.x[1]).toBeCloseTo(1000, 3);
    expect(cut.y[1]).toBeCloseTo(1000, 3);
    const beyond = extent(plan, (l) => l === BEYOND_LAYER);
    expect(beyond.x[1]).toBeCloseTo(3000, 3);

    const cutOnly = drawElements(brep, elements, { axis: 'z', at: 1200, side: 1, depth: 0 });
    expect(cutOnly.beyond).toEqual([]);
    expect(cutOnly.polylines.every((p) => p.layer !== BEYOND_LAYER)).toBe(true);
    for (const el of elements) for (const s of el.shapes) s[Symbol.dispose]();
  });

  it('draws a section across, with height up the page', () => {
    const elements = model();
    // Looking north (+y) from the south side, through the middle of both elements.
    const section = drawElements(brep, elements, { axis: 'y', at: 500, side: -1 });
    expect([...section.cut].sort()).toEqual(['plinth', 'wall']);
    const wall = extent(section, (l) => l === 'CUT-WALL');
    expect(wall.x[1]).toBeCloseTo(1000, 3);
    expect(wall.y[1]).toBeCloseTo(3000, 3);
    const plinth = extent(section, (l) => l === 'CUT-SLAB');
    expect(plinth.x[0]).toBeCloseTo(2000, 3);
    expect(plinth.y[1]).toBeCloseTo(500, 3);
    for (const el of elements) for (const s of el.shapes) s[Symbol.dispose]();
  });
});

describe('drawing formats', () => {
  const geometry: DrawingGeometry = {
    polylines: [
      {
        layer: 'CUT-WALL',
        points: [
          [0, 0],
          [1000, 0],
          [1000, 200],
        ],
      },
      {
        layer: BEYOND_LAYER,
        points: [
          [0, 500],
          [3000, 500],
        ],
      },
    ],
    bounds: { minX: 0, minY: 0, maxX: 3000, maxY: 500 },
    cut: ['w'],
    beyond: ['s'],
    skipped: [],
  };

  it('writes one SVG group per layer, flipped so y reads up', () => {
    const svg = drawingSvg(geometry, 'test <plan>');
    expect(svg).toContain('<g id="CUT-WALL"');
    expect(svg).toContain('<g id="BEYOND"');
    expect(svg.indexOf('id="BEYOND"')).toBeLessThan(svg.indexOf('id="CUT-WALL"'));
    expect(svg).toContain('M0 0L1000 0L1000 -200');
    expect(svg).toContain('<title>test plan</title>');
  });

  it('writes each segment as a DXF LINE on its layer', () => {
    const lines = dxfEntities(geometry);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toEqual({ type: 'LINE', start: [0, 0], end: [1000, 0], layer: 'CUT-WALL' });
    expect(brep.exportDXF(lines)).toContain('CUT-WALL');
  });
});

describe('measureSpace', () => {
  it('fuses a space given as overlapping solids, so the overlap counts once', () => {
    const a = brep.box(2000, 2000, 2700);
    const b = boxAt([2000, 2000, 2700], [1000, 0, 0]);
    try {
      const m = measureSpace(brep, 'sp', [a, b]);
      expect(m.error).toBeUndefined();
      expect(m.area).toBeCloseTo(6, 6);
      expect(m.perimeter).toBeCloseTo(10, 6);
      expect(m.volume).toBeCloseTo(16.2, 6);
      expect(m.loops?.[0]).toHaveLength(4);
    } finally {
      a[Symbol.dispose]();
      b[Symbol.dispose]();
    }
  });
});
