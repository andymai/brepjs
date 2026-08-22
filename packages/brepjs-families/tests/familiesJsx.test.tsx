/** @jsxRuntime automatic @jsxImportSource brepjs-families */
/**
 * Typed JSX authoring — the real compiler path (react-jsx transform through
 * `jsxImportSource: "brepjs-families"`), not direct jsx() calls. Pure data:
 * resolution builds IR nodes without a kernel, so no WASM setup here.
 *
 * The pragma above is required, not decorative: this file is run by two vitest
 * configs (the package's own and the root suite), and the root one cannot set a
 * global jsxImportSource without committing every future .tsx in it to this
 * package's runtime.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  Box,
  Group,
  family,
  resolve,
  tTranslate,
  type Element,
  type FamilyChildren,
} from '../src/index.js';

const wallSchema = z.object({
  length: z.number().positive(),
  height: z.number().positive(),
  thickness: z.number().positive().default(200),
});

const Wall = family(
  'Wall',
  (p: z.output<typeof wallSchema>) => <Box size={[p.length, p.thickness, p.height]} />,
  { props: wallSchema }
);

const Storey = family<{ readonly children?: FamilyChildren }>('Storey', (p) => (
  <Group>{p.children}</Group>
));

describe('typed JSX authoring', () => {
  it('compiles intrinsics and components, applying schema defaults', () => {
    const tree = resolve(
      <Storey key="ground">
        <Wall key="south" length={4000} height={2700} />
      </Storey>
    );
    const wall = tree.children[0];
    expect(wall?.keyPath).toBe('ground/south');
    expect(wall?.props['thickness']).toBe(200);
  });

  it('rejects invalid props on the JSX path', () => {
    expect(() => <Wall key="bad" length={-1} height={2700} />).toThrow(/invalid props/);
  });

  it('conditional and mapped children compose', () => {
    const show = false;
    const tree = resolve(
      <Storey key="g">
        {show && <Wall key="hidden" length={100} height={100} />}
        {[1, 2].map((i) => (
          <Wall key={`w${i}`} length={1000 * i} height={2700} />
        ))}
      </Storey>
    );
    expect(tree.children.map((c) => c.keyPath)).toEqual(['g/w1', 'g/w2']);
  });

  it('fragments inline without a key-path segment', () => {
    const tree = resolve(
      <Storey key="g">
        <>
          <Wall key="a" length={100} height={100} />
          <Wall key="b" length={100} height={100} />
        </>
      </Storey>
    );
    expect(tree.children.map((c) => c.keyPath)).toEqual(['g/a', 'g/b']);
  });

  it('intrinsic transform and voids props type-check and resolve', () => {
    const Bin = family<{ readonly size: number }>('Bin', (p) => (
      <Box
        size={[p.size, p.size, p.size]}
        voids={[<Box size={[p.size / 2, p.size / 2, p.size / 2]} />]}
        transform={[tTranslate([1, 2, 3])]}
      />
    ));
    const tree = resolve(<Bin key="b" size={10} />);
    expect(tree.geometry.kind).toBe('Translate');
  });

  it('fill-role instances in a voids prop synthesize the opening triangle', () => {
    const Door = family<{ readonly width: number; readonly height: number }>(
      'Door',
      (p) => <Box size={[p.width, 300, p.height]} />,
      { role: 'fill' }
    );
    const VoidedWall = family<{ readonly voids: readonly Element[] }>('Wall', (p) => (
      <Box size={[4000, 200, 2700]} voids={p.voids} />
    ));

    const tree = resolve(
      <VoidedWall key="south" voids={[<Door key="entry" width={1000} height={2100} />]} />
    );

    expect(tree.relationships).toEqual([{ kind: 'Voids', target: 'south/voids:entry' }]);
    const opening = tree.children[0];
    expect(opening?.type).toBe('Opening');
    expect(opening?.keyPath).toBe('south/voids:entry');
    expect(opening?.relationships).toEqual([{ kind: 'Fills', target: 'south/voids:entry/fill' }]);
    expect(opening?.children[0]?.type).toBe('Door');
  });
});
