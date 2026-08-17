/**
 * The sample building authored declaratively with brepjs-families: two
 * storeys, four perimeter walls (X- and Y-running), a door and a window as
 * fill-role voids, and floor slabs — projected onto an IFC4 model through
 * `familiesToBim`, with every GlobalId derived from families key paths.
 *
 * The element-tree builder is pure (no kernel); running this file directly
 * initialises the kernel, validates the model, and writes the fixture that
 * scripts/validateIfc.py checks with IfcOpenShell:
 *
 *   npx tsx packages/brepjs-bim/examples/sampleBuildingFamilies.ts
 *
 * Columns and classifications from the imperative sample are out of scope:
 * the adapter maps Storey, Wall, Slab, and wall openings in v1.
 */

import { family, el, tTranslate, type Element } from 'brepjs-families';

type Vec3 = readonly [number, number, number];

interface WallProps {
  readonly length: number;
  readonly height: number;
  readonly thickness: number;
  readonly at: Vec3;
  /** Along-wall direction fed to the IFC spec; the render orients the IR box
   *  to coincide with the spec solid (thickness spans axisZ x axisX). */
  readonly axisX?: Vec3;
  readonly voids?: readonly Element[];
  readonly materialName: string;
  readonly isExternal?: boolean;
  readonly loadBearing?: boolean;
  readonly fireRating?: string;
}

const Wall = family<WallProps>('Wall', (p) => {
  const alongY = (p.axisX ?? [1, 0, 0])[1] !== 0;
  return el('Box', {
    size: alongY
      ? [p.thickness, p.length, p.height]
      : [p.length, p.thickness, p.height],
    voids: p.voids ?? [],
    // A +Y wall's thickness spans world -X (axisY = axisZ x axisX), so the
    // IR box shifts to coincide with the spec solid.
    transform: [tTranslate(alongY ? [p.at[0] - p.thickness, p.at[1], p.at[2]] : p.at)],
  });
});

interface FillProps {
  readonly width: number;
  readonly height: number;
  /** [along-wall, sill] in the host wall's local frame. */
  readonly at: readonly [number, number];
  readonly depth: number;
  readonly alongY?: boolean;
  readonly materialName: string;
  readonly isExternal?: boolean;
  readonly fireRating?: string;
  readonly thermalTransmittance?: number;
}

const fillRender = (p: FillProps): Element =>
  el('Box', {
    size: p.alongY ? [p.depth, p.width, p.height] : [p.width, p.depth, p.height],
    transform: [
      tTranslate(p.alongY ? [0, p.at[0], p.at[1]] : [p.at[0], 0, p.at[1]]),
    ],
  });

const Door = family<FillProps>('Door', fillRender, { role: 'fill' });
const Window = family<FillProps>('Window', fillRender, { role: 'fill' });

interface SlabProps {
  readonly length: number;
  readonly width: number;
  readonly thickness: number;
  readonly at: Vec3;
  readonly predefinedType: 'FLOOR' | 'ROOF' | 'LANDING' | 'BASESLAB';
  readonly materialName: string;
  readonly loadBearing?: boolean;
  readonly isExternal?: boolean;
}

const Slab = family<SlabProps>('Slab', (p) =>
  el('Box', {
    size: [p.length, p.width, p.thickness],
    transform: [tTranslate(p.at)],
  })
);

const Storey = family<{ readonly elevation: number; readonly items: readonly Element[] }>(
  'Storey',
  (p) => el('Group', {}, p.items)
);

const Building = family<{ readonly storeys: readonly Element[] }>('Building', (p) =>
  el('Group', {}, p.storeys)
);

const L = 6000;
const W = 4000;
const H = 3000;
const T = 200;

export const SAMPLE_PROJECT = {
  name: 'brepjs-families Sample Office',
  projectId: 'families-sample-office',
};

export const SAMPLE_OPTIONS = {
  project: SAMPLE_PROJECT,
  siteName: 'Riverside Plot',
  buildingName: 'Office Block A',
};

export const SAMPLE_META = {
  applicationName: 'brepjs-families sample',
  applicationVersion: '1',
};

export function buildSampleBuilding(): Element {
  const concrete = {
    thickness: T,
    height: H,
    materialName: 'Concrete',
    isExternal: true,
    loadBearing: true,
    fireRating: 'REI 120',
  };

  const ground = Storey({
    key: 'ground',
    elevation: 0,
    items: [
      Wall({
        key: 'south',
        ...concrete,
        length: L,
        at: [0, 0, 0],
        voids: [
          Window({
            key: 'win-1',
            width: 1500,
            height: 1200,
            at: [2250, 900],
            depth: T,
            materialName: 'Aluminium + Glazing',
            isExternal: true,
            thermalTransmittance: 1.4,
          }),
        ],
      }),
      Wall({
        key: 'east',
        ...concrete,
        length: W,
        at: [L, 0, 0],
        axisX: [0, 1, 0],
        voids: [
          Door({
            key: 'door-1',
            width: 1000,
            height: 2100,
            at: [1500, 0],
            depth: T,
            alongY: true,
            materialName: 'Timber',
            isExternal: true,
            fireRating: 'EI 60',
          }),
        ],
      }),
      Wall({ key: 'north', ...concrete, length: L, at: [0, W - T, 0] }),
      Wall({ key: 'west', ...concrete, length: W, at: [T, 0, 0], axisX: [0, 1, 0] }),
      Slab({
        key: 'floor',
        length: L,
        width: W,
        thickness: 250,
        at: [0, 0, -250],
        predefinedType: 'FLOOR',
        materialName: 'Concrete',
        loadBearing: true,
      }),
    ],
  });

  const first = Storey({
    key: 'first',
    elevation: 3200,
    items: [
      Slab({
        key: 'floor',
        length: L,
        width: W,
        thickness: 250,
        at: [0, 0, H],
        predefinedType: 'FLOOR',
        materialName: 'Concrete',
        loadBearing: true,
      }),
    ],
  });

  return Building({ key: 'office', storeys: [ground, first] });
}

const invokedDirectly =
  typeof process !== 'undefined' &&
  process.argv[1] !== undefined &&
  import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  await import('brepjs/quick');
  const { resolve } = await import('brepjs-families');
  const { familiesToBim } = await import('../src/familiesAdapter.js');
  const { toIfcValidated } = await import('../src/serialize/toIfc.js');
  const { writeFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');

  const projected = familiesToBim(resolve(buildSampleBuilding()), SAMPLE_OPTIONS);
  if (!projected.ok) throw new Error(`familiesToBim failed: ${projected.error.message}`);
  using model = projected.value.model;
  const ifc = await toIfcValidated(model, SAMPLE_META);
  if (!ifc.ok) throw new Error(`toIfcValidated failed: ${ifc.error.message}`);
  const out = join(dirname(fileURLToPath(import.meta.url)), 'sample-building-families.ifc');
  await writeFile(out, ifc.value.bytes);
  console.warn(`Wrote ${out} (${ifc.value.bytes.byteLength} bytes)`);
}
