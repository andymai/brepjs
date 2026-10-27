import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Box, captureSourceLocations, el, family, Group, resolve, sourceOf } from 'brepjs-families';
import type { Element, ResolvedElement } from 'brepjs-families';

const here = fileURLToPath(import.meta.url);
const lines = readFileSync(here, 'utf8').split('\n');
/** The 1-based line of this file that contains `marker`. */
const lineOf = (marker: string) => lines.findIndex((l) => l.includes(marker)) + 1;

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
  el('Group', {}, [
    Wall({ key: 'a', length: p.length }), // pair-a
    Wall({ key: 'b', length: p.length }), // pair-b
  ])
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
    expect(at('site')).toMatchObject({ file: here, line: lineOf('<Group key="site">') });
    expect(at('site/south')?.line).toBe(lineOf('<Wall key="south"'));
    expect(at('site/plinth')?.line).toBe(lineOf('<Box key="plinth"'));
    expect(at('site/pair/a')?.line).toBe(lineOf('// pair-a'));
    expect(at('site/pair/b')?.line).toBe(lineOf('// pair-b'));
    // A synthesized Opening answers with its fill's location.
    expect(at('site/south/voids:entry')).toEqual(at('site/south/voids:entry/fill'));
    expect(at('site/south/voids:entry/fill')?.line).toBe(lineOf('<Wall key="south"'));
  });

  it('records nothing while capture is off', () => {
    const root = resolve(el('Group', { key: 'g' }, [el('Box', { key: 'b', size: [1, 1, 1] })]));
    expect(sourceOf(root)).toBeUndefined();
    expect(sourceOf(find(root, 'g/b'))).toBeUndefined();
  });
});
