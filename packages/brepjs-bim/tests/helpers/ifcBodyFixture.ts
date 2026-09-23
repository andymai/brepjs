import { box, translate, unwrap, type Bounds3D, type ValidSolid } from 'brepjs';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { BimModel } from '../../src/model/bimModel.js';
import type { WallSpec } from '../../src/specs/wallSpec.js';
import type { SpfReader } from '../../src/import/spfReader.js';
import { disposeProductBody, type NonEmpty } from '../../src/types/productBody.js';
import { currentKernel } from '../../../../tests/setup.js';

export const IFC_BODY_META = { applicationName: 'step1-body-fixture', applicationVersion: '1' };
export type BodyLayout = 'singleton' | 'disconnected' | 'overlapping';

export function bodyExchangeFixture(
  category: 'WALL' | 'RAILING',
  authority: 'EXACT',
  layout: BodyLayout
) {
  const model = new BimModel();
  try {
    const projectId = unwrap(
      model.init({
        name: 'Retained Body exchange',
        projectId: `${category}-${authority}-${layout}`,
      })
    );
    const siteId = unwrap(model.addSite({ name: 'Site' }));
    const buildingId = unwrap(model.addBuilding({ name: 'Building' }));
    const storeyId = unwrap(model.addStorey({ name: 'Level', elevation: 7000 }));
    model.aggregate(projectId, siteId);
    model.aggregate(siteId, buildingId);
    model.aggregate(buildingId, storeyId);
    const spec: WallSpec = {
      length: 2000,
      height: 500,
      thickness: 100,
      origin: [1000, 2000, 3000],
      axisX: [0, 1, 0],
      axisZ: [0, 0, 1],
      materialName: 'Concrete',
      classification: {
        system: 'Step1',
        code: 'retained-body',
        description: 'Preserved classification',
      },
      customProperties: { Fixture: { Source: 'retained items', Enabled: true } },
    };
    const localId = unwrap(
      category === 'WALL'
        ? model.addWall(spec, { stableKey: 'product' })
        : model.addRailing({ ...spec, predefinedType: 'GUARDRAIL' }, { stableKey: 'product' })
    );
    model.placeIn(localId, storeyId);
    const first = box(1000, 100, 500);
    const solids: NonEmpty<ValidSolid> =
      layout === 'singleton'
        ? [first]
        : [
            first,
            offsetBox(
              layout === 'disconnected' ? 500 : 1000,
              layout === 'disconnected' ? 2000 : 500
            ),
          ];
    const body = { kind: authority, solids };
    const adopted = model.takeExactProductBody(localId, body);
    if (!adopted.ok) disposeProductBody(body);
    unwrap(adopted);
    const styled = layout !== 'singleton';
    if (styled)
      model.setSurfaceStyle(localId, {
        name: 'Body blue',
        r: 0.2,
        g: 0.4,
        b: 0.6,
        transparency: 0.25,
      });
    const localBounds: Bounds3D[] = [
      { xMin: 0, xMax: 1000, yMin: 0, yMax: 100, zMin: 0, zMax: 500 },
    ];
    if (layout !== 'singleton')
      localBounds.push({
        xMin: layout === 'disconnected' ? 2000 : 500,
        xMax: layout === 'disconnected' ? 2500 : 1500,
        yMin: 0,
        yMax: 100,
        zMin: 0,
        zMax: 500,
      });
    const worldBounds = localBounds.map((bounds): Bounds3D => ({
      xMin: 900,
      xMax: 1000,
      yMin: 2000 + bounds.xMin,
      yMax: 2000 + bounds.xMax,
      zMin: 10000,
      zMax: 10500,
    }));
    return {
      model,
      localId,
      solids,
      styled,
      localBounds,
      worldBounds,
      itemVolumes:
        layout === 'singleton'
          ? [50_000_000]
          : [50_000_000, layout === 'disconnected' ? 25_000_000 : 50_000_000],
      materialVolume: layout === 'singleton' ? 50_000_000 : 75_000_000,
    };
  } catch (cause) {
    model[Symbol.dispose]();
    throw cause;
  }
}

function offsetBox(length: number, offset: number): ValidSolid {
  using source = box(length, 100, 500);
  return translate(source, [offset, 0, 0]);
}

const reference = z.object({ value: z.number().int().positive() });
const label = z.object({ value: z.string() }).transform(({ value }) => value);
const productLine = z.object({ Representation: reference });
const productShape = z.object({ Representations: z.array(reference) });
const representation = z.object({
  RepresentationIdentifier: label,
  RepresentationType: label,
  Items: z.array(reference).nonempty(),
});
export function emittedBody(reader: SpfReader, guid: string) {
  reader.buildGuidMap();
  const expressId = reader.expressIdFromGuid(guid);
  if (expressId === undefined) throw new Error('Missing IFC product');
  const product = productLine.parse(reader.getLine(expressId));
  const shape = productShape.parse(reader.getLine(product.Representation.value));
  const body = shape.Representations.map(({ value }) =>
    representation.parse(reader.getLine(value))
  ).find((rep) => rep.RepresentationIdentifier === 'Body');
  if (body === undefined) throw new Error('Missing IFC Body');
  return {
    expressId,
    representationType: body.RepresentationType,
    items: body.Items.map(({ value: itemId }) => ({ itemId, type: reader.getLineType(itemId) })),
  };
}

/** Opt-in fresh fixtures for the independent ticket09 IFC validator. */
export function recordIfcBodyFixture(name: string, bytes: Uint8Array, evidence: unknown): void {
  const directory = process.env['BIM_STEP1_FIXTURE_DIR'];
  if (directory === undefined) return;
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, `${name}.ifc`), bytes);
  writeFileSync(
    join(directory, `${name}.json`),
    JSON.stringify(
      {
        fixture: name,
        backend: currentKernel,
        generatedAt: new Date().toISOString(),
        byteLength: bytes.byteLength,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        evidence,
      },
      null,
      2
    ) + '\n'
  );
}
