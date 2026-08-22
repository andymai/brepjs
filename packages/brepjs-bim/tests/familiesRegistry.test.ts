/**
 * Registry families -> familiesToBim integration: the shipped copy-in
 * components carry identity data (storey name, psets, material) through their
 * zod schemas into IFC output, and anonymous voids are rejected instead of
 * silently diverging the exported body from the viewport.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { csg, isOk, unwrap } from 'brepjs';
import { z } from 'zod';
import { family, el, resolve, tRotate } from 'brepjs-families';
import { Beam } from '../../brepjs-families/registry/families/beam.js';
import { Wall } from '../../brepjs-families/registry/families/wall.js';
import { Door } from '../../brepjs-families/registry/families/door.js';
import { Room } from '../../brepjs-families/registry/families/room.js';
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
            // Pset_SlabCommon is foreign to a Wall: it must flow through as a
            // custom pset, not be relabeled onto the wall's own common pset.
            psets: {
              Pset_ProjectSpecific: { Zone: 'A', Occupancy: 12 },
              Pset_SlabCommon: { IsExternal: false },
            },
            voids: [
              Door({
                key: 'entry',
                width: 1000,
                height: 2100,
                at: [1500, 0],
                psets: { Pset_DoorCommon: { FireRating: 'EI30' } },
              }),
            ],
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
    // The door's own common pset reaches its spec fields through the fill path.
    expect(text).toContain('EI30');
    // The foreign common pset survives as a custom pset under its own name.
    expect(text).toContain('Pset_SlabCommon');
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
          BareSlab({
            key: 's',
            length: 4000,
            width: 3000,
            thickness: 200,
            material: 'Cast concrete',
          }),
        ],
      })
    );
    const projected = unwrap(familiesToBim(tree, { project: PROJECT }));
    using model = projected.model;
    const text = new TextDecoder().decode(unwrap(await toIfc(model, META)));
    expect(text).toContain('Cast concrete');
  });

  it('folds a composed room placement into wall origins', () => {
    const tree = resolve(
      Storey({
        key: 'g',
        items: [Room({ key: 'r', width: 4000, depth: 3000, height: 2700, at: [1000, 2000] })],
      })
    );
    const projected = unwrap(familiesToBim(tree, { project: PROJECT }));
    using model = projected.model;
    const wallAt = (keyPath: string): [number, number, number] | undefined => {
      const localId = projected.idByKeyPath.get(keyPath);
      return model.getWalls().find((w) => w.localId === localId)?.spec.origin;
    };
    expect(wallAt('g/r/south')).toEqual([1000, 2000, 0]);
    expect(wallAt('g/r/north')).toEqual([1000, 2000 + 3000 - 200, 0]);
  });

  it('routes a circular beam whose render orients its body internally', () => {
    // The beam family bakes a csg.rotate into its body to run along axisX;
    // that is body orientation the spec rebuilds from props, not a placement
    // rotation, and must not trip the tRotate rejection.
    const tree = resolve(
      Storey({
        key: 'g',
        items: [
          Beam({
            key: 'b',
            length: 3000,
            profile: { kind: 'CIRCULAR', radius: 100 },
            axisX: [0, 1, 0],
          }),
        ],
      })
    );
    const projected = unwrap(familiesToBim(tree, { project: PROJECT }));
    using model = projected.model;
    expect(projected.idByKeyPath.has('g/b')).toBe(true);
    expect(model.getBeams()).toHaveLength(1);
  });

  it('rejects a rotated routed element instead of exporting a diverged body', () => {
    const tree = resolve(
      Storey({
        key: 'g',
        items: [
          el('Group', { key: 'wing', transform: [tRotate(30)] }, [
            Wall({ key: 'w', length: 4000, height: 2700, thickness: 200 }),
          ]),
        ],
      })
    );
    const projected = familiesToBim(tree, { project: PROJECT });
    expect(isOk(projected)).toBe(false);
    if (!projected.ok) expect(projected.error.code).toBe('FAMILIES_UNSUPPORTED_TRANSFORM');
  });

  it('routes unrouted geometry through the proxy escape hatch when enabled', async () => {
    const Plinth = family<{ readonly radius: number; readonly height: number }>('Plinth', (p) => {
      const pts: Array<[number, number, number]> = [];
      for (let i = 0; i < 6; i++) {
        const a = (2 * Math.PI * i) / 6;
        pts.push([p.radius * Math.cos(a), p.radius * Math.sin(a), 0]);
      }
      return el('Geometry', { node: csg.extrude(csg.polygon(pts), [0, 0, p.height]) });
    });
    const tree = resolve(
      Storey({
        key: 'g',
        items: [
          Plinth({
            key: 'plinth',
            name: 'Hex plinth',
            material: 'Granite',
            radius: 400,
            height: 900,
          }),
        ],
      })
    );

    const withoutHatch = familiesToBim(tree, { project: PROJECT });
    expect(isOk(withoutHatch)).toBe(false);
    if (!withoutHatch.ok) expect(withoutHatch.error.code).toBe('FAMILIES_UNSUPPORTED_TYPE');

    using ev = new csg.Evaluator();
    const projected = unwrap(familiesToBim(tree, { project: PROJECT, proxyEvaluator: ev }));
    using model = projected.model;
    expect(projected.idByKeyPath.has('g/plinth')).toBe(true);
    expect(model.getProxies()).toHaveLength(1);
    const text = new TextDecoder().decode(unwrap(await toIfc(model, META)));
    expect(text).toContain('IFCBUILDINGELEMENTPROXY');
    expect(text).toContain('Hex plinth');
    expect(text).toContain('Granite');
  });

  it('a proxied element with a fill-role void keeps its baked opening', () => {
    const Slot = family<{ readonly w: number }>(
      'Slot',
      (p) => el('Box', { size: [p.w, 400, 400] }),
      {
        role: 'fill',
      }
    );
    const Cabin = family<{ readonly size: number }>('Cabin', (p) =>
      el('Geometry', {
        node: csg.box(p.size, p.size, p.size),
        voids: [Slot({ key: 'hatch', w: 600 })],
      })
    );
    const tree = resolve(Storey({ key: 'g', items: [Cabin({ key: 'cabin', size: 2000 })] }));
    using ev = new csg.Evaluator();
    const projected = unwrap(familiesToBim(tree, { project: PROJECT, proxyEvaluator: ev }));
    using model = projected.model;
    // The body is authoritative: the hole is baked into the tessellated proxy,
    // and the synthesized Opening child must not trip the wall-only mapping.
    expect(model.getProxies()).toHaveLength(1);
    expect(projected.idByKeyPath.has('g/cabin')).toBe(true);
  });

  it('rejects an anonymous void instead of silently diverging the IFC body', () => {
    const Hole = family<{ readonly size?: number }>('Hole', () =>
      el('Box', { size: [500, 500, 500] })
    );
    const tree = resolve(
      Storey({
        key: 'g',
        items: [
          Wall({
            key: 'w',
            length: 4000,
            height: 2700,
            thickness: 200,
            voids: [Hole({ key: 'h' })],
          }),
        ],
      })
    );
    const projected = familiesToBim(tree, { project: PROJECT });
    expect(isOk(projected)).toBe(false);
    if (!projected.ok) expect(projected.error.code).toBe('FAMILIES_ANONYMOUS_VOID');
  });
});
