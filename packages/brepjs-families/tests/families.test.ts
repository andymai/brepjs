/**
 * Family layer — element trees, key paths (children and prop-embedded),
 * opening synthesis as relationship data, cache economics on prop edits,
 * jsx runtime parity, and the Phase 3 identity gate: identical recipes share
 * one materialization while identities and attribute records stay distinct.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { csg, isOk, unwrap, measureVolume } from 'brepjs';
import type { AnyShape, Dimension } from 'brepjs';
import {
  family,
  el,
  jsx,
  resolve,
  evaluateModel,
  tTranslate,
  type Element,
  type ResolvedElement,
} from '../src/index.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

function vol(s: AnyShape<Dimension>): number {
  return unwrap(measureVolume(s));
}

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
  readonly psets?: Readonly<Record<string, Readonly<Record<string, unknown>>>> | undefined;
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

describe('end to end', () => {
  it('materializes the bin with correct volume', () => {
    using ev = new csg.Evaluator();
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
    expect(vol(unwrap(r))).toBeCloseTo(120000 - 8000, 0);
  });

  it('prop edit re-evaluates only the changed subtree', () => {
    using ev = new csg.Evaluator();
    const pockets = [
      { at: [10, 10, 10] as const, size: [20, 20, 10] as const },
      { at: [50, 10, 10] as const, size: [20, 20, 10] as const },
    ];
    const v1 = resolve(Bin({ key: 'b', size: [100, 60, 20], pockets, at: [5, 0, 0] }));
    expect(isOk(ev.evaluate(v1.geometry))).toBe(true);
    const s1 = ev.cacheStats();
    const v2 = resolve(Bin({ key: 'b', size: [100, 60, 20], pockets, at: [7, 0, 0] }));
    expect(isOk(ev.evaluate(v2.geometry))).toBe(true);
    const s2 = ev.cacheStats();
    expect(s2.misses - s1.misses).toBe(1);
    expect(s2.hits - s1.hits).toBe(1);
  });
});

describe('jsx runtime', () => {
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
});

describe('key paths and opening synthesis', () => {
  function buildStorey(): ResolvedElement {
    const door = Door({ key: 'd1', width: 90, height: 210, thickness: 20, at: [100, 0, 0] });
    const wall = Wall({ key: 'w1', length: 400, height: 270, thickness: 20, voids: [door] });
    return resolve(Storey({ key: 'storey-1', walls: [wall] }));
  }

  it('assigns hierarchical key paths and synthesizes Opening relationships', () => {
    const storey = buildStorey();
    const wall = storey.children[0];
    expect(wall?.keyPath).toBe('storey-1/w1');
    const opening = wall?.children[0];
    expect(opening?.type).toBe('Opening');
    expect(opening?.keyPath).toBe('storey-1/w1/voids:d1');
    expect(opening?.children[0]?.keyPath).toBe('storey-1/w1/voids:d1/fill');
    expect(wall?.relationships).toContainEqual({ kind: 'Voids', target: 'storey-1/w1/voids:d1' });
    expect(opening?.relationships).toContainEqual({
      kind: 'Fills',
      target: 'storey-1/w1/voids:d1/fill',
    });
    expect(storey.relationships).toContainEqual({ kind: 'Contains', target: 'storey-1/w1' });
  });

  it('duplicate sibling keys throw', () => {
    const w = (): Element => Wall({ key: 'w1', length: 100, height: 100, thickness: 10 });
    expect(() => resolve(Storey({ key: 's', walls: [w(), w()] }))).toThrow(/duplicate/i);
  });

  it('duplicate void slot keys throw (explicit and index-fallback collisions)', () => {
    const door = (key?: string): Element =>
      key !== undefined
        ? Door({ key, width: 90, height: 210, thickness: 20, at: [100, 0, 0] })
        : Door({ width: 90, height: 210, thickness: 20, at: [200, 0, 0] });
    expect(() =>
      resolve(Wall({ key: 'w', length: 400, height: 270, thickness: 20, voids: [door('d1'), door('d1')] }))
    ).toThrow(/duplicate void slot/i);
    // Explicit key '1' collides with the second void's index fallback.
    expect(() =>
      resolve(Wall({ key: 'w', length: 400, height: 270, thickness: 20, voids: [door('1'), door()] }))
    ).toThrow(/duplicate void slot/i);
  });

  it('a transformed host carries its openings and fills into the same frame', () => {
    const TransformedWall = family<WallProps & { readonly at: readonly [number, number, number] }>(
      'TWall',
      (p) =>
        el('Box', {
          size: [p.length, p.thickness, p.height],
          voids: p.voids ?? [],
          transform: [tTranslate(p.at)],
        })
    );
    const door = Door({ key: 'd1', width: 90, height: 210, thickness: 20, at: [100, 0, 0] });
    const wall = resolve(
      TransformedWall({
        key: 'w',
        length: 400,
        height: 270,
        thickness: 20,
        at: [1000, 2000, 0],
        voids: [door],
      })
    );
    const opening = wall.children[0];
    const fill = opening?.children[0];
    // Expected: the door's local recipe wrapped in the host transform.
    const localDoor = csg.translate(csg.box(90, 20, 210), [100, 0, 0]);
    const worldDoor = csg.translate(localDoor, [1000, 2000, 0]);
    expect(opening?.geometry.structuralHash).toBe(worldDoor.structuralHash);
    expect(fill?.geometry.structuralHash).toBe(worldDoor.structuralHash);
  });
});

describe('identity beside content addressing (Phase 3 gate)', () => {
  it('two identical walls: one materialization, distinct identity records', () => {
    using ev = new csg.Evaluator();
    const dims = { length: 400, height: 270, thickness: 20 };
    const storey = resolve(
      Storey({
        key: 'storey-1',
        walls: [
          Wall({ key: 'w1', ...dims, psets: { Pset_WallCommon: { FireRating: '60' } } }),
          Wall({ key: 'w2', ...dims, psets: { Pset_WallCommon: { FireRating: '90' } } }),
        ],
      })
    );
    const model = evaluateModel(storey, ev);
    const n1 = model.byKeyPath.get('storey-1/w1');
    const n2 = model.byKeyPath.get('storey-1/w2');
    expect(n1 && n2).toBeTruthy();
    if (!n1 || !n2) return;
    // One materialized solid under two identities.
    expect(isOk(n1.result) && isOk(n2.result)).toBe(true);
    if (isOk(n1.result) && isOk(n2.result)) {
      expect(n1.result.value).toBe(n2.result.value);
    }
    expect(ev.cacheStats().entries).toBe(1);
    // Distinct identity records beside the shared geometry.
    expect(n1.keyPath).not.toBe(n2.keyPath);
    expect(n1.attributes['psets']).toEqual({ Pset_WallCommon: { FireRating: '60' } });
    expect(n2.attributes['psets']).toEqual({ Pset_WallCommon: { FireRating: '90' } });
    // Containers are identity-only: no geometry entry for the storey.
    expect(model.byKeyPath.has('storey-1')).toBe(false);
  });
});
