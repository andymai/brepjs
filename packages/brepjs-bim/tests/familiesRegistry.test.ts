/**
 * Registry families -> familiesToBim integration: the shipped copy-in
 * components carry identity data (storey name, psets, material) through their
 * zod schemas into IFC output, and anonymous voids are rejected instead of
 * silently diverging the exported body from the viewport.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { isOk, unwrap } from 'brepjs';
import { z } from 'zod';
import { family, el, resolve } from 'brepjs-families';
import { Wall } from '../../brepjs-families/registry/families/wall.js';
import { Door } from '../../brepjs-families/registry/families/door.js';
import { Storey } from '../../brepjs-families/registry/families/storey.js';
import { familiesToBim } from '../src/familiesAdapter.js';
import { toIfc } from '../src/serialize/toIfc.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

const PROJECT = { name: 'Registry', projectId: 'registry-project' };
const META = { applicationName: 'registry-test', applicationVersion: '1' };

describe('registry families through familiesToBim', () => {
  it('projects storey name, custom psets, and a door opening into IFC', async () => {
    const tree = resolve(
      Storey({
        key: 'ground',
        name: 'Ground floor',
        elevation: 0,
        items: [
          Wall({
            key: 'south',
            length: 4000,
            height: 2700,
            thickness: 200,
            isExternal: true,
            psets: { Pset_ProjectSpecific: { Zone: 'A', Occupancy: 12 } },
            voids: [Door({ key: 'entry', width: 1000, height: 2100, at: [1500, 0] })],
          }),
        ],
      })
    );
    const projected = unwrap(familiesToBim(tree, { project: PROJECT }));
    using model = projected.model;
    expect(projected.idByKeyPath.has('ground/south')).toBe(true);
    expect(projected.idByKeyPath.has('ground/south/voids:entry/fill')).toBe(true);

    const text = new TextDecoder().decode(unwrap(await toIfc(model, META)));
    expect(text).toContain('Ground floor');
    expect(text).toContain('IFCDOOR');
    expect(text).toContain('IFCRELFILLSELEMENT');
    expect(text).toContain('Pset_ProjectSpecific');
    expect(text).toContain('Zone');
  });

  it('adopts the material attribute when a family declares no materialName', async () => {
    const slabSchema = z.object({
      length: z.number().positive(),
      width: z.number().positive(),
      thickness: z.number().positive(),
      predefinedType: z.literal('FLOOR').default('FLOOR'),
    });
    const BareSlab = family(
      'Slab',
      (p: z.output<typeof slabSchema>) => el('Box', { size: [p.length, p.width, p.thickness] }),
      { props: slabSchema }
    );
    const tree = resolve(
      Storey({
        key: 'g',
        items: [
          BareSlab({ key: 's', length: 4000, width: 3000, thickness: 200, material: 'Cast concrete' }),
        ],
      })
    );
    const projected = unwrap(familiesToBim(tree, { project: PROJECT }));
    using model = projected.model;
    const text = new TextDecoder().decode(unwrap(await toIfc(model, META)));
    expect(text).toContain('Cast concrete');
  });

  it('rejects an anonymous void instead of silently diverging the IFC body', () => {
    const Hole = family<{ readonly size?: number }>('Hole', () =>
      el('Box', { size: [500, 500, 500] })
    );
    const tree = resolve(
      Storey({
        key: 'g',
        items: [
          Wall({ key: 'w', length: 4000, height: 2700, thickness: 200, voids: [Hole({ key: 'h' })] }),
        ],
      })
    );
    const projected = familiesToBim(tree, { project: PROJECT });
    expect(isOk(projected)).toBe(false);
    if (!projected.ok) expect(projected.error.code).toBe('FAMILIES_ANONYMOUS_VOID');
  });
});
