/** @jsxRuntime automatic @jsxImportSource brepjs-families */
import { describe, it, expect, afterEach } from 'vitest';
import { Box, captureSourceLocations, el, family, Group, resolve, sourceOf } from 'brepjs-families';
import type { Element, ResolvedElement } from 'brepjs-families';

// This file is type-checked without Node types, so the lines are checked relative to each other
// here; brepjs-cad's session tests check absolute lines against the file's text.
const Door = family<{ readonly width: number }>(
  'Door',
  (p) => el('Box', { size: [p.width, 100, 2000] }),
  { role: 'fill' }
);
const Wall = family<{ readonly length: number; readonly voids?: readonly Element[] }>('Wall', (p) =>
  el('Box', { size: [p.length, 200, 2700], voids: p.voids ?? [] })
);
// A composed family: the walls it makes are authored here, inside its render function.
const Pair = family<{ readonly length: number }>('Pair', (p) =>
  el('Group', {}, [Wall({ key: 'a', length: p.length }), Wall({ key: 'b', length: p.length })])
);

function find(root: ResolvedElement, keyPath: string): ResolvedElement {
  const stack = [root];
  for (let n = stack.pop(); n; n = stack.pop()) {
    if (n.keyPath === keyPath) return n;
    stack.push(...n.children);
  }
  throw new Error(`no ${keyPath}`);
}

describe('source locations', () => {
  afterEach(() => captureSourceLocations(false));

  it('points each resolved element at the call or tag that authored it', () => {
    captureSourceLocations(true);
    const model = (
      <Group key="site">
        <Wall key="south" length={6000} voids={[Door({ key: 'entry', width: 900 })]} />
        <Pair key="pair" length={3000} />
        <Box key="plinth" size={[1, 1, 1]} />
      </Group>
    );
    const root = resolve(model);
    const at = (keyPath: string) => sourceOf(find(root, keyPath));
    const line = (keyPath: string) => at(keyPath)?.line ?? NaN;
    expect(at('site')?.file).toMatch(/[\\/]tests[\\/]sourceLocation\.test\.tsx$/);
    expect(line('site/south')).toBe(line('site') + 1);
    expect(line('site/pair')).toBe(line('site') + 2);
    expect(line('site/plinth')).toBe(line('site') + 3);
    // Walls made inside Pair's render point at the calls there, above the test body.
    expect(at('site/pair/a')?.file).toBe(at('site')?.file);
    expect(line('site/pair/b')).toBe(line('site/pair/a'));
    expect(at('site/pair/b')?.column).toBeGreaterThan(at('site/pair/a')?.column ?? Infinity);
    expect(line('site/pair/a')).toBeLessThan(line('site'));
    // A synthesized Opening answers with its fill's location, the Door call inside the Wall tag.
    expect(at('site/south/voids:entry')).toEqual(at('site/south/voids:entry/fill'));
    expect(line('site/south/voids:entry/fill')).toBe(line('site/south'));
  });

  it('records nothing while capture is off', () => {
    const root = resolve(el('Group', { key: 'g' }, [el('Box', { key: 'b', size: [1, 1, 1] })]));
    expect(sourceOf(root)).toBeUndefined();
    expect(sourceOf(find(root, 'g/b'))).toBeUndefined();
  });
});
