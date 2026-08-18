/**
 * The families round trip: declarative source -> IFC bytes -> independent
 * re-import, asserting that identity (key-path GlobalIds), categories,
 * opening relationships, psets, spatial containment, and geometry volumes
 * all survive the trip. Complements the one-way gates (fixture match,
 * IfcOpenShell) by proving the emitted file MEANS what the source said.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { csg, isOk, unwrap, measureVolume } from 'brepjs';
import { resolve, evaluateModel } from 'brepjs-families';
import { familiesToBim } from '../src/familiesAdapter.js';
import { toIfc } from '../src/serialize/toIfc.js';
import { fromIfc } from '../src/import/fromIfc.js';
import { deriveIfcGuidSync } from '../src/identity/guidDerivation.js';
import type { ImportedElement, ImportedModel } from '../src/import/importedModel.js';
import {
  buildSampleBuilding,
  SAMPLE_META,
  SAMPLE_OPTIONS,
  SAMPLE_PROJECT,
} from '../examples/sampleBuildingFamilies.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

const SCOPE = SAMPLE_PROJECT.projectId;
const guidOf = (keyPath: string): string => deriveIfcGuidSync(`elem:${SCOPE}:${keyPath}`);

const KEY_PATHS = {
  storeys: ['office/ground', 'office/first'],
  walls: ['office/ground/south', 'office/ground/east', 'office/ground/north', 'office/ground/west'],
  slabs: ['office/ground/floor', 'office/first/floor'],
  openings: ['office/ground/south/voids:win-1', 'office/ground/east/voids:door-1'],
  fills: ['office/ground/south/voids:win-1/fill', 'office/ground/east/voids:door-1/fill'],
};

let imported: ImportedModel;
let byGuid: Map<string, ImportedElement>;

beforeAll(async () => {
  const resolved = resolve(buildSampleBuilding());
  const projected = familiesToBim(resolved, SAMPLE_OPTIONS);
  if (!projected.ok) throw new Error(projected.error.message);
  using model = projected.value.model;
  const bytes = unwrap(await toIfc(model, SAMPLE_META));
  imported = unwrap(await fromIfc(bytes));
  byGuid = new Map(imported.elements.map((e) => [e.guid, e]));
}, 60000);

describe('families IFC round trip', () => {
  it('every key-path GlobalId survives with the right category', () => {
    const expectCategory = (paths: string[], category: string) => {
      for (const p of paths) {
        const el = byGuid.get(guidOf(p));
        expect(el, p).toBeDefined();
        expect(el?.category, p).toBe(category);
      }
    };
    expectCategory(KEY_PATHS.walls, 'WALL');
    expectCategory(KEY_PATHS.slabs, 'SLAB');
    expectCategory(KEY_PATHS.openings, 'OPENING');
    expect(byGuid.get(guidOf('office/ground/south/voids:win-1/fill'))?.category).toBe('WINDOW');
    expect(byGuid.get(guidOf('office/ground/east/voids:door-1/fill'))?.category).toBe('DOOR');
  });

  it('opening relationships reconnect: fills and voidedBy point at the same elements', () => {
    const door = byGuid.get(guidOf('office/ground/east/voids:door-1/fill'));
    const doorOpening = byGuid.get(guidOf('office/ground/east/voids:door-1'));
    const eastWall = byGuid.get(guidOf('office/ground/east'));
    expect(doorOpening?.expressId).toBeDefined();
    expect(door?.fills).toBe(doorOpening?.expressId);
    expect(eastWall?.voidedBy).toContain(doorOpening?.expressId);

    const win = byGuid.get(guidOf('office/ground/south/voids:win-1/fill'));
    const winOpening = byGuid.get(guidOf('office/ground/south/voids:win-1'));
    const southWall = byGuid.get(guidOf('office/ground/south'));
    expect(winOpening?.expressId).toBeDefined();
    expect(win?.fills).toBe(winOpening?.expressId);
    expect(southWall?.voidedBy).toContain(winOpening?.expressId);
  });

  it('psets survive: fire rating, external flag, thermal transmittance', () => {
    const south = byGuid.get(guidOf('office/ground/south'));
    const common = south?.psets.find((p) => p.name === 'Pset_WallCommon');
    expect(common?.properties['FireRating']).toBe('REI 120');
    expect(common?.properties['IsExternal']).toBe(true);

    const win = byGuid.get(guidOf('office/ground/south/voids:win-1/fill'));
    const winCommon = win?.psets.find((p) => p.name === 'Pset_WindowCommon');
    expect(winCommon?.properties['ThermalTransmittance']).toBeCloseTo(1.4, 5);
  });

  it('spatial containment survives: walls sit in their storey', () => {
    const storeys = imported.elements.length; // spatial nodes live in the tree, not elements
    expect(storeys).toBeGreaterThan(0);
    const wall = byGuid.get(guidOf('office/ground/south'));
    const slabFirst = byGuid.get(guidOf('office/first/floor'));
    expect(wall?.storeyExpressId).toBeDefined();
    expect(slabFirst?.storeyExpressId).toBeDefined();
    // Ground-floor wall and first-floor slab live in different storeys.
    expect(wall?.storeyExpressId).not.toBe(slabFirst?.storeyExpressId);
  });

  it('wall and slab volumes match the families-evaluated shapes', () => {
    using ev = new csg.Evaluator();
    const evaluated = evaluateModel(resolve(buildSampleBuilding()), ev, {}, { shapes: true });
    for (const p of [...KEY_PATHS.walls, ...KEY_PATHS.slabs]) {
      const node = evaluated.byKeyPath.get(p);
      const el = byGuid.get(guidOf(p));
      expect(node?.shape && isOk(node.shape), p).toBe(true);
      expect(el?.geometry.solid, `${p} imported solid`).not.toBeNull();
      if (node?.shape && isOk(node.shape) && el?.geometry.solid) {
        const sourceVol = unwrap(measureVolume(node.shape.value));
        const importedVol = unwrap(measureVolume(el.geometry.solid));
        // Within 0.5%: the IFC path re-extrudes parametrically.
        expect(Math.abs(importedVol - sourceVol) / sourceVol, p).toBeLessThan(0.005);
      }
    }
  });
});
