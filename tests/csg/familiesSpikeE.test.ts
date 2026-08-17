/**
 * Spike E — runnable family layer over today's IR vocabulary (box, void, translate).
 *
 * Falsifiable checks:
 *  1. End-to-end: family() props -> Element -> IR -> evaluated shape with correct volume.
 *  2. Cache economics: a prop edit re-renders and re-evaluates with EXACT hit/miss
 *     deltas proving unchanged subtrees hit the content cache.
 *  3. jsx() runtime produces hash-identical IR to the plain-function API.
 *  4. Key paths: children and prop-embedded (voids) elements get stable paths.
 *  5. Opening synthesis: voids={[Door]} yields Opening+Fills relationship data.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { initKernel } from '../setup.js';
import { Evaluator } from '@/csg/index.js';
import { isOk, unwrap, measureVolume } from '@/index.js';
import type { AnyShape, Dimension } from '@/core/shapeTypes.js';
import {
  family,
  el,
  jsx,
  resolve,
  evaluateModel,
  tTranslate,
  type Element,
  type ResolvedElement,
} from './familiesSpike.js';

beforeAll(async () => {
  await initKernel();
}, 30000);

function vol(s: AnyShape<Dimension>): number {
  return unwrap(measureVolume(s));
}

// ---------------------------------------------------------------------------
// Families used across the tests
// ---------------------------------------------------------------------------

/** Viktar's BinGeometry sketch: a box base with pocket voids, relocatable. */
interface BinProps {
  readonly size: readonly [number, number, number];
  readonly pockets: ReadonlyArray<{
    readonly at: readonly [number, number, number];
    readonly size: readonly [number, number, number];
  }>;
  readonly at: readonly [number, number, number];
}

const Bin = family<BinProps>('Bin', (p) =>
  el('Box', {
    size: p.size,
    voids: p.pockets.map((pk) => el('Box', { size: pk.size, transform: [tTranslate(pk.at)] })),
    transform: [tTranslate(p.at)],
  })
);

interface DoorProps {
  readonly width: number;
  readonly height: number;
  readonly thickness: number;
  readonly at: readonly [number, number, number];
}

const Door = family<DoorProps>(
  'Door',
  (p) =>
    el('Box', {
      size: [p.width, p.thickness, p.height],
      transform: [tTranslate(p.at)],
    }),
  { role: 'fill' }
);

interface WallProps {
  readonly length: number;
  readonly height: number;
  readonly thickness: number;
  readonly voids?: readonly Element[] | undefined;
}

const Wall = family<WallProps>('Wall', (p) =>
  el('Box', {
    size: [p.length, p.thickness, p.height],
    voids: p.voids ?? [],
  })
);

const Storey = family<{ readonly walls: readonly Element[] }>('Storey', (p) =>
  el('Group', {}, p.walls)
);

// ---------------------------------------------------------------------------
// 1. End to end
// ---------------------------------------------------------------------------

describe('Spike E — end to end (props -> IR -> shape)', () => {
  it('materializes the bin with correct volume', () => {
    using ev = new Evaluator();
    const bin = Bin({
      key: 'bin-1',
      size: [100, 60, 20],
      pockets: [
        { at: [10, 10, 10], size: [20, 20, 10] },
        { at: [50, 10, 10], size: [20, 20, 10] },
      ],
      at: [5, 0, 0],
    });
    const resolved = resolve(bin);
    expect(resolved.keyPath).toBe('bin-1');
    const r = ev.evaluate(resolved.geometry);
    expect(isOk(r)).toBe(true);
    // 100*60*20 minus two 20*20*10 pockets
    expect(vol(unwrap(r))).toBeCloseTo(120000 - 8000, 0);
  });
});

// ---------------------------------------------------------------------------
// 2. Cache economics on prop edits
// ---------------------------------------------------------------------------

describe('Spike E — prop edit hits cache on unchanged subtrees', () => {
  const pockets = [
    { at: [10, 10, 10] as const, size: [20, 20, 10] as const },
    { at: [50, 10, 10] as const, size: [20, 20, 10] as const },
  ];

  it('transform-only edit: exactly one new node evaluates', () => {
    using ev = new Evaluator();
    const v1 = resolve(Bin({ key: 'b', size: [100, 60, 20], pockets, at: [5, 0, 0] }));
    expect(isOk(ev.evaluate(v1.geometry))).toBe(true);
    const s1 = ev.cacheStats();
    // Tree: T_outer(CutAll(Box_base, [T_p1(Box_p), T_p2(Box_p)])) — the two
    // pocket boxes share one hash, so v1 is 6 misses + 1 hit already.
    expect(s1.misses).toBe(6);
    expect(s1.hits).toBe(1);

    // Prop edit: move the bin. Inner CutAll subtree is content-identical.
    const v2 = resolve(Bin({ key: 'b', size: [100, 60, 20], pockets, at: [7, 0, 0] }));
    expect(isOk(ev.evaluate(v2.geometry))).toBe(true);
    const s2 = ev.cacheStats();
    expect(s2.misses - s1.misses).toBe(1); // only the new outer Translate
    expect(s2.hits - s1.hits).toBe(1); // CutAll returned whole from cache
  });

  it('one-pocket edit: base and untouched pocket hit, edited path misses', () => {
    using ev = new Evaluator();
    const v1 = resolve(Bin({ key: 'b', size: [100, 60, 20], pockets, at: [5, 0, 0] }));
    expect(isOk(ev.evaluate(v1.geometry))).toBe(true);
    const s1 = ev.cacheStats();

    const moved = [pockets[0], { at: [60, 10, 10] as const, size: [20, 20, 10] as const }];
    const v2 = resolve(
      Bin({ key: 'b', size: [100, 60, 20], pockets: moved as BinProps['pockets'], at: [5, 0, 0] })
    );
    expect(isOk(ev.evaluate(v2.geometry))).toBe(true);
    const s2 = ev.cacheStats();
    // New nodes: moved T_p2', new CutAll, new T_outer -> 3 misses.
    // Hits: Box_base, T_p1, Box_p (shared pocket box) -> 3 hits.
    expect(s2.misses - s1.misses).toBe(3);
    expect(s2.hits - s1.hits).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 3. jsx() runtime
// ---------------------------------------------------------------------------

describe('Spike E — jsx() runtime parity', () => {
  it('jsx(Bin, props) produces hash-identical IR to Bin(props)', () => {
    const props: BinProps = {
      size: [100, 60, 20],
      pockets: [{ at: [10, 10, 10], size: [20, 20, 10] }],
      at: [0, 0, 0],
    };
    const viaFn = resolve(Bin({ key: 'b', ...props }));
    const viaJsx = resolve(jsx(Bin, { ...props }, 'b'));
    expect(viaJsx.geometry.structuralHash).toBe(viaFn.geometry.structuralHash);
    expect(viaJsx.keyPath).toBe(viaFn.keyPath);
  });

  it('jsx() composes containment (Storey -> Wall) with hierarchical paths', () => {
    const wall = jsx(Wall, { length: 400, height: 270, thickness: 20 }, 'w1');
    const storey = jsx(Storey, { walls: [wall] }, 'storey-1');
    const resolved = resolve(storey);
    expect(resolved.children.map((c) => c.keyPath)).toEqual(['storey-1/w1']);
  });
});

// ---------------------------------------------------------------------------
// 4 + 5. Key paths, prop-embedded identity, opening synthesis
// ---------------------------------------------------------------------------

describe('Spike E — key paths and opening synthesis', () => {
  function buildStorey(): ResolvedElement {
    const door = Door({ key: 'd1', width: 90, height: 210, thickness: 20, at: [100, 0, 0] });
    const wall = Wall({ key: 'w1', length: 400, height: 270, thickness: 20, voids: [door] });
    return resolve(Storey({ key: 'storey-1', walls: [wall] }));
  }

  it('assigns hierarchical key paths to children', () => {
    const storey = buildStorey();
    expect(storey.keyPath).toBe('storey-1');
    const wall = storey.children[0];
    expect(wall?.keyPath).toBe('storey-1/w1');
    expect(wall?.type).toBe('Wall');
  });

  it('synthesizes Opening from a fill-role void, with relationship data', () => {
    const storey = buildStorey();
    const wall = storey.children[0];
    expect(wall).toBeDefined();
    if (!wall) return;

    // Prop-embedded path scheme: void slot owns the opening identity.
    const opening = wall.children[0];
    expect(opening?.type).toBe('Opening');
    expect(opening?.keyPath).toBe('storey-1/w1/voids:d1');

    const door = opening?.children[0];
    expect(door?.type).toBe('Door');
    expect(door?.keyPath).toBe('storey-1/w1/voids:d1/fill');

    // Relationship data mirrors IfcRelVoidsElement / IfcRelFillsElement.
    expect(wall.relationships).toContainEqual({
      kind: 'Voids',
      target: 'storey-1/w1/voids:d1',
    });
    expect(opening?.relationships).toContainEqual({
      kind: 'Fills',
      target: 'storey-1/w1/voids:d1/fill',
    });
    // Containment comes from the tree, expressed as relationship data too.
    expect(storey.relationships).toContainEqual({ kind: 'Contains', target: 'storey-1/w1' });
  });

  it('plain geometry voids stay anonymous (no synthesized element)', () => {
    const wall = Wall({
      key: 'w1',
      length: 400,
      height: 270,
      thickness: 20,
      voids: [el('Box', { size: [50, 20, 50], transform: [tTranslate([10, 0, 100])] })],
    });
    const resolved = resolve(wall);
    expect(resolved.children).toHaveLength(0);
    expect(resolved.relationships).toHaveLength(0);
  });

  it('duplicate sibling keys throw', () => {
    const w = (): Element => Wall({ key: 'w1', length: 100, height: 100, thickness: 10 });
    expect(() => resolve(Storey({ key: 's', walls: [w(), w()] }))).toThrow(/duplicate/i);
  });

  it('evaluateModel returns per-keyPath results; door geometry reuses wall-cut cache', () => {
    using ev = new Evaluator();
    const storey = buildStorey();
    const byKeyPath = evaluateModel(storey, ev);
    const wallResult = byKeyPath.get('storey-1/w1');
    expect(wallResult && isOk(wallResult)).toBe(true);
    if (wallResult && isOk(wallResult)) {
      // 400*20*270 minus the 90*20*210 door cut
      expect(vol(wallResult.value)).toBeCloseTo(400 * 20 * 270 - 90 * 20 * 210, 0);
    }
    const doorResult = byKeyPath.get('storey-1/w1/voids:d1/fill');
    expect(doorResult && isOk(doorResult)).toBe(true);
    // The door's IR subtree was already materialized as the wall's cut tool,
    // so re-evaluating the opening element is a pure cache hit (zero misses).
    const opening = storey.children[0]?.children[0];
    expect(opening).toBeDefined();
    const before = ev.cacheStats();
    const again = opening && ev.evaluate(opening.geometry);
    expect(again && isOk(again)).toBe(true);
    expect(ev.cacheStats().misses).toBe(before.misses);
  });
});
