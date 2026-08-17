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

  it('schema defaults apply at construction', () => {
    const slab = resolve(Slab({ key: 'f', length: 100, width: 100, thickness: 10 }));
    expect(slab.props['predefinedType']).toBe('FLOOR');
    expect(slab.props['materialName']).toBe('Concrete');
  });

  it('invalid starter props throw with the family name', () => {
    expect(() => Wall({ key: 'w', length: -1, height: 100, thickness: 10 })).toThrow(
      /invalid props for family 'Wall'/
    );
  });
});
