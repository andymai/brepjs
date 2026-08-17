/**
 * The Phase 6 capstone: the sample building authored declaratively with
 * families projects onto a valid IFC4 model — deterministic bytes, key-path
 * GlobalIds, wall openings on both X- and Y-running walls, and a clean
 * validation report. The committed fixture is additionally checked by an
 * independent implementation (IfcOpenShell) via scripts/validateIfc.py.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { isOk, unwrap } from 'brepjs';
import { family, el, resolve, tTranslate, type Element } from 'brepjs-families';
import { familiesToBim } from '../src/familiesAdapter.js';
import { toIfcValidated } from '../src/serialize/toIfc.js';
import { deriveIfcGuidSync } from '../src/identity/guidDerivation.js';
import {
  buildSampleBuilding,
  SAMPLE_META,
  SAMPLE_OPTIONS,
  SAMPLE_PROJECT,
} from '../examples/sampleBuildingFamilies.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

async function projectToIfc(): Promise<string> {
  const projected = familiesToBim(resolve(buildSampleBuilding()), SAMPLE_OPTIONS);
  expect(isOk(projected)).toBe(true);
  using model = unwrap(projected).model;
  const ifc = unwrap(await toIfcValidated(model, SAMPLE_META));
  expect(ifc.report.issues.filter((i) => i.severity === 'error')).toEqual([]);
  return new TextDecoder()
    .decode(ifc.bytes)
    .split('\n')
    .filter((line) => !line.startsWith('FILE_NAME'))
    .join('\n');
}

describe('families sample building (Phase 6 gate)', () => {
  it('projects to a valid IFC with every element class represented', async () => {
    const ifc = await projectToIfc();
    for (const entity of [
      'IFCWALL',
      'IFCSLAB',
      'IFCDOOR',
      'IFCWINDOW',
      'IFCOPENINGELEMENT',
      'IFCRELVOIDSELEMENT',
      'IFCRELFILLSELEMENT',
    ]) {
      expect(ifc, entity).toContain(entity);
    }
    // Identity is key-path-derived, including on the Y-running east wall.
    const scope = SAMPLE_PROJECT.projectId;
    expect(ifc).toContain(deriveIfcGuidSync(`elem:${scope}:office/ground/south`));
    expect(ifc).toContain(deriveIfcGuidSync(`elem:${scope}:office/ground/east/voids:door-1`));
    expect(ifc).toContain(
      deriveIfcGuidSync(`elem:${scope}:office/ground/south/voids:win-1/fill`)
    );
    expect(ifc).toContain(deriveIfcGuidSync(`elem:${scope}:office/first/floor`));
  });

  it('is content-identical across independent rebuilds', async () => {
    expect(await projectToIfc()).toBe(await projectToIfc());
  });

  it('projects along-wall offsets onto the wall axis for Y-running walls', () => {
    const YDoor = family<{
      readonly along: number;
      readonly width: number;
      readonly height: number;
      readonly materialName: string;
    }>(
      'Door',
      (p) =>
        el('Box', {
          size: [200, p.width, p.height],
          transform: [tTranslate([0, p.along, 0])],
        }),
      { role: 'fill' }
    );
    interface YWallProps {
      readonly length: number;
      readonly height: number;
      readonly thickness: number;
      readonly axisX: readonly [number, number, number];
      readonly materialName: string;
      readonly voids: readonly Element[];
    }
    const YWall = family<YWallProps>('Wall', (p) =>
      el('Box', { size: [p.thickness, p.length, p.height], voids: p.voids })
    );
    const YStorey = family<{ readonly walls: readonly Element[] }>('Storey', (p) =>
      el('Group', {}, p.walls)
    );
    const build = (along: number): Element =>
      YStorey({
        key: 's',
        walls: [
          YWall({
            key: 'w',
            length: 4000,
            height: 3000,
            thickness: 200,
            axisX: [0, 1, 0],
            materialName: 'Concrete',
            voids: [
              YDoor({ key: 'd', along, width: 1000, height: 2100, materialName: 'Timber' }),
            ],
          }),
        ],
      });
    const project = { name: 'y-probe', projectId: 'y-probe' };

    const fits = familiesToBim(resolve(build(1500)), { project });
    expect(isOk(fits)).toBe(true);
    if (isOk(fits)) unwrap(fits).model[Symbol.dispose]();
    // 3600 + 1000 > 4000 can only trip bounds validation if the Y translation
    // actually projected onto the wall axis (an X-only reading would be 0).
    expect(isOk(familiesToBim(resolve(build(3600)), { project }))).toBe(false);
  });

  it('matches the committed fixture (regenerate via the example script on change)', async () => {
    const fixture = await readFile(
      join(
        dirname(fileURLToPath(import.meta.url)),
        '../examples/sample-building-families.ifc'
      ),
      'utf8'
    );
    const stripHeader = (s: string): string =>
      s
        .split('\n')
        .filter((line) => !line.startsWith('FILE_NAME'))
        .join('\n');
    expect(stripHeader(fixture)).toBe(await projectToIfc());
  });
});
