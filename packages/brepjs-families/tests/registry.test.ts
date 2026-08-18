/**
 * Starter registry — the copy-in distribution's ground truth. The manifest
 * is data (self-hostable); every family file carries a machine-managed
 * version-marker first line that `brepjs diff` anchors on. These tests keep
 * manifest, markers, and files from drifting apart, and prove the starter
 * families actually resolve and materialize.
 */

import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it, beforeAll } from 'vitest';
import { z } from 'zod';
import { initOCCT } from '../../../tests/setup.js';
import { csg, isOk } from 'brepjs';
import { resolve, evaluateModel } from '../src/index.js';
import { Room } from '../registry/families/room.js';
import { Storey } from '../registry/families/storey.js';
import { Slab } from '../registry/families/slab.js';
import { Column } from '../registry/families/column.js';
import { Beam } from '../registry/families/beam.js';
import { Roof } from '../registry/families/roof.js';
import { Stair } from '../registry/families/stair.js';
import { Window } from '../registry/families/window.js';
import { Wall } from '../registry/families/wall.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

const REGISTRY_DIR = join(dirname(fileURLToPath(import.meta.url)), '../registry');

const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  name: z.string().min(1),
  families: z.array(
    z.object({
      name: z.string().regex(/^[a-z][a-z0-9-]*$/),
      version: z.number().int().positive(),
      description: z.string().min(1),
      files: z.array(z.string().min(1)).min(1),
      npmDeps: z.array(z.string().min(1)),
      familyDeps: z.array(z.string().min(1)),
    })
  ),
});

async function loadManifest(): Promise<z.output<typeof manifestSchema>> {
  const raw = await readFile(join(REGISTRY_DIR, 'manifest.json'), 'utf8');
  return manifestSchema.parse(JSON.parse(raw));
}

describe('registry manifest', () => {
  it('parses, lists every family file, and every listed file exists', async () => {
    const manifest = await loadManifest();
    const listed = new Set(manifest.families.flatMap((f) => f.files));
    for (const file of listed) {
      await expect(readFile(join(REGISTRY_DIR, file), 'utf8')).resolves.toBeTruthy();
    }
    const onDisk = (await readdir(join(REGISTRY_DIR, 'families'))).map((f) => `families/${f}`);
    for (const file of onDisk) {
      expect(listed.has(file), `${file} missing from manifest`).toBe(true);
    }
  });

  it('every file starts with a version marker matching its manifest entry', async () => {
    const manifest = await loadManifest();
    for (const fam of manifest.families) {
      for (const file of fam.files) {
        const firstLine = (await readFile(join(REGISTRY_DIR, file), 'utf8')).split('\n', 1)[0];
        expect(firstLine, file).toBe(`// brepjs-family: ${fam.name}@${fam.version}`);
      }
    }
  });

  it('family names are unique and familyDeps close over the manifest', async () => {
    const manifest = await loadManifest();
    const names = manifest.families.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
    for (const fam of manifest.families) {
      for (const dep of fam.familyDeps) {
        expect(names, `${fam.name} -> ${dep}`).toContain(dep);
      }
    }
  });
});

describe('starter families', () => {
  it('a room on a storey resolves with keyed paths and a synthesized opening', () => {
    const storey = resolve(
      Storey({
        key: 'ground',
        items: [
          Room({ key: 'office', width: 6000, depth: 4000, height: 3000 }),
          Slab({ key: 'floor', length: 6000, width: 4000, thickness: 250, at: [0, 0, -250] }),
        ],
      })
    );
    const room = storey.children[0];
    const south = room?.children.find((c) => c.keyPath.endsWith('/south'));
    expect(south?.keyed).toBe(true);
    const opening = south?.children.find((c) => c.type === 'Opening');
    expect(opening?.keyPath).toBe('ground/office/south/voids:door');
    expect(opening?.keyed).toBe(true);
  });

  it('starter walls and windows materialize with meshes', () => {
    using ev = new csg.Evaluator();
    const storey = resolve(
      Storey({
        key: 's',
        items: [
          Wall({
            key: 'w',
            length: 3000,
            height: 2700,
            thickness: 200,
            voids: [Window({ key: 'n', width: 1200, height: 1000, at: [900, 900], depth: 200 })],
          }),
        ],
      })
    );
    const model = evaluateModel(storey, ev);
    const wall = model.byKeyPath.get('s/w');
    expect(wall && isOk(wall.mesh)).toBe(true);
  });

  it('starter beams materialize for every profile kind and both axes', () => {
    using ev = new csg.Evaluator();
    const storey = resolve(
      Storey({
        key: 's',
        items: [
          Beam({
            key: 'rect',
            length: 4000,
            profile: { kind: 'RECTANGULAR', width: 200, height: 400 },
          }),
          Beam({
            key: 'round',
            length: 4000,
            profile: { kind: 'CIRCULAR', radius: 120 },
            axisX: [0, 1, 0],
          }),
          Beam({
            key: 'ipe',
            length: 4000,
            profile: {
              kind: 'I_BEAM',
              overallWidth: 100,
              overallDepth: 200,
              flangeThickness: 8.5,
              webThickness: 5.6,
            },
          }),
        ],
      })
    );
    const model = evaluateModel(storey, ev);
    for (const key of ['s/rect', 's/round', 's/ipe']) {
      const beam = model.byKeyPath.get(key);
      expect(beam && isOk(beam.mesh), key).toBe(true);
    }
  });

  const ROOF_DIMS = { length: 8000, width: 5000, thickness: 200 };
  const ROOF_SHAPES: ReadonlyArray<Record<string, unknown>> = [
    { key: 'flat' },
    { key: 'shed', predefinedType: 'SHED_ROOF', pitch: 15 },
    { key: 'gable', predefinedType: 'GABLE_ROOF', pitch: 30 },
    { key: 'hip', predefinedType: 'HIP_ROOF', pitch: 25 },
    { key: 'dome', predefinedType: 'DOME_ROOF', pitch: 1 },
  ];

  it.each(ROOF_SHAPES)('starter roof shape $key materializes', (shape) => {
    using ev = new csg.Evaluator();
    const storey = resolve(Storey({ key: 's', items: [Roof({ ...ROOF_DIMS, ...shape })] }));
    const model = evaluateModel(storey, ev);
    const roof = model.byKeyPath.get(`s/${shape['key'] as string}`);
    expect(roof && isOk(roof.mesh)).toBe(true);
  });

  it('a two-flight return stair materializes', () => {
    using ev = new csg.Evaluator();
    const flight = { width: 1200, riserHeight: 175, treadLength: 280, numberOfRisers: 8 };
    const storey = resolve(
      Storey({
        key: 's',
        items: [
          Stair({
            key: 'main',
            predefinedType: 'HALF_TURN_STAIR',
            flights: [
              { ...flight },
              { ...flight, origin: [8 * 280, 1400, 8 * 175], axisX: [-1, 0, 0] },
            ],
          }),
        ],
      })
    );
    const model = evaluateModel(storey, ev);
    const stair = model.byKeyPath.get('s/main');
    expect(stair && isOk(stair.mesh)).toBe(true);
  });

  it('a rectangular column materializes through the profile bridge', () => {
    using ev = new csg.Evaluator();
    const storey = resolve(
      Storey({
        key: 's',
        items: [
          Column({
            key: 'c1',
            height: 3000,
            profile: { kind: 'RECTANGULAR', width: 300, height: 300 },
          }),
        ],
      })
    );
    const model = evaluateModel(storey, ev);
    const col = model.byKeyPath.get('s/c1');
    expect(col && isOk(col.mesh)).toBe(true);
  });

  it('a starter column resolves and materializes with a mesh', () => {
    using ev = new csg.Evaluator();
    const storey = resolve(
      Storey({
        key: 's',
        items: [Column({ key: 'c1', height: 3000, profile: { kind: 'CIRCULAR', radius: 150 } })],
      })
    );
    const model = evaluateModel(storey, ev);
    const col = model.byKeyPath.get('s/c1');
    expect(col && isOk(col.mesh)).toBe(true);
    expect(storey.children[0]?.props['predefinedType']).toBe('COLUMN');
    expect(storey.children[0]?.props['materialName']).toBe('Concrete');
  });

  it('schema defaults apply at construction', () => {
    const slab = resolve(Slab({ key: 'f', length: 100, width: 100, thickness: 10 }));
    expect(slab.props['predefinedType']).toBe('FLOOR');
    expect(slab.props['materialName']).toBe('Concrete');
  });

  it('degenerate I-profiles and unsupported beam axes are rejected at construction', () => {
    expect(() =>
      Beam({
        key: 'b',
        length: 4000,
        profile: {
          kind: 'I_BEAM',
          overallWidth: 100,
          overallDepth: 200,
          flangeThickness: 100,
          webThickness: 5.6,
        },
      })
    ).toThrow(/invalid props for family 'Beam'/);
    expect(() =>
      Column({
        key: 'c',
        height: 3000,
        profile: {
          kind: 'I_BEAM',
          overallWidth: 100,
          overallDepth: 200,
          flangeThickness: 8.5,
          webThickness: 100,
        },
      })
    ).toThrow(/invalid props for family 'Column'/);
    expect(() =>
      Beam({
        key: 'b',
        length: 4000,
        profile: { kind: 'RECTANGULAR', width: 200, height: 400 },
        axisX: [0, -1, 0] as never,
      })
    ).toThrow(/invalid props for family 'Beam'/);
  });

  it('invalid starter props throw with the family name', () => {
    expect(() => Wall({ key: 'w', length: -1, height: 100, thickness: 10 })).toThrow(
      /invalid props for family 'Wall'/
    );
  });

  it('a door that cannot fit its room is rejected at construction', () => {
    // Wider than the south wall (centered placement goes negative).
    expect(() => Room({ key: 'r', width: 900, depth: 900, height: 2400 })).toThrow(/does not fit/);
    // Explicit placement overflowing the wall.
    expect(() =>
      Room({ key: 'r', width: 3000, depth: 3000, height: 2400, doorAlong: 2500 })
    ).toThrow(/does not fit/);
    // Taller than the room.
    expect(() =>
      Room({ key: 'r', width: 3000, depth: 3000, height: 2000, doorHeight: 2100 })
    ).toThrow(/exceeds the room height/);
  });
});
