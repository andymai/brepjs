import { box, clone, translate, unwrap, type Bounds3D, type ValidSolid } from 'brepjs';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import * as WebIFC from 'web-ifc';
import { BimModel } from '../../src/model/bimModel.js';
import type { WallSpec } from '../../src/specs/wallSpec.js';
import type { SpfReader } from '../../src/import/spfReader.js';
import {
  disposeProductBody,
  type ProductBody,
  type NonEmpty,
} from '../../src/types/productBody.js';
import { DOOR, WINDOW, OPENING_WALL, singletonWallSolid } from './openingFixture.js';
import { currentKernel } from '../../../../tests/setup.js';

export const IFC_BODY_META = { applicationName: 'step1-body-fixture', applicationVersion: '1' };
export type BodyLayout = 'singleton' | 'disconnected' | 'overlapping';

export function bodyExchangeFixture(
  category: 'WALL' | 'RAILING',
  authority: ProductBody['kind'],
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
    const adopted = model.replaceProductBody({ localId, body });
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

/** Reuses ticket05's already-cut host and keeps its opening/filler records. */
export function retainedOpeningFixture(
  authority: ProductBody['kind'],
  fillerKind: 'DOOR' | 'WINDOW' = 'DOOR',
  layout: 'disconnected' | 'aperture' = 'disconnected'
) {
  const model = new BimModel();
  try {
    const project = unwrap(
      model.init({
        name: 'Retained opening',
        projectId: `opening-${authority}-${fillerKind}-${layout}`,
      })
    );
    const site = unwrap(model.addSite({ name: 'Site' }));
    const building = unwrap(model.addBuilding({ name: 'Building' }));
    const storey = unwrap(model.addStorey({ name: 'Level', elevation: 7000 }));
    model.aggregate(project, site);
    model.aggregate(site, building);
    model.aggregate(building, storey);
    const wallId = unwrap(model.addWall(OPENING_WALL, { stableKey: 'wall' }));
    const fillerSpec = fillerKind === 'DOOR' ? DOOR : WINDOW;
    const fillerId = unwrap(
      model[fillerKind === 'DOOR' ? 'addDoor' : 'addWindow'](
        { ...fillerSpec, wallLocalId: wallId },
        { stableKey: 'filler', openingStableKey: 'opening' }
      )
    );
    model.placeIn(wallId, storey);
    model.placeIn(fillerId, storey);
    using source =
      layout === 'disconnected' ? box(2, 1, 3) : box(fillerSpec.width, 1, fillerSpec.height / 2);
    const solids: NonEmpty<ValidSolid> = [
      unwrap(clone(singletonWallSolid(model, wallId))),
      translate(
        source,
        layout === 'disconnected'
          ? [20, 0, 0]
          : [fillerSpec.offsetAlongWall, 0, fillerSpec.offsetFromFloor]
      ),
    ];
    const body = { kind: authority, solids };
    const replaced = model.replaceProductBody({ localId: wallId, body });
    if (!replaced.ok) disposeProductBody(body);
    unwrap(replaced);
    const opening = model.getAllElements().find((element) => element.category === 'OPENING');
    const wall = model.getElement(wallId);
    const filler = model.getElement(fillerId);
    if (!opening || !wall || !filler) throw new Error('Missing opening fixture product');
    return {
      model,
      wall,
      filler,
      opening,
      solids,
      itemVolumes: [
        60 - fillerSpec.width * fillerSpec.height,
        layout === 'disconnected' ? 6 : (fillerSpec.width * fillerSpec.height) / 2,
      ],
    };
  } catch (cause) {
    model[Symbol.dispose]();
    throw cause;
  }
}

const reference = z.object({ value: z.number().int().positive() });
const scalar = z.object({ value: z.number() }).transform(({ value }) => value);
const label = z.object({ value: z.string() }).transform(({ value }) => value);
const productLine = z.object({ Representation: reference });
const productShape = z.object({ Representations: z.array(reference) });
const representation = z.object({
  RepresentationIdentifier: label,
  RepresentationType: label,
  Items: z.array(reference).nonempty(),
});
const faceSet = z.object({ Coordinates: reference, CoordIndex: z.array(z.array(scalar)) });
const points = z.object({ CoordList: z.array(z.tuple([scalar, scalar, scalar])).nonempty() });
const styledItem = z.object({ Item: reference, Styles: z.array(reference).nonempty() });
const surfaceStyle = z.object({ Name: label, Styles: z.array(reference).nonempty() });
const rendering = z.object({ SurfaceColour: reference, Transparency: scalar });
const colour = z.object({ Red: scalar, Green: scalar, Blue: scalar });

export function emittedOpening(reader: SpfReader, guid: string) {
  const expressId = reader.expressIdFromGuid(guid);
  if (expressId === undefined) throw new Error('Missing IFC opening');
  const product = productLine.parse(reader.getLine(expressId));
  const shape = productShape.parse(reader.getLine(product.Representation.value));
  return shape.Representations.map(({ value }) => {
    const rep = representation.extend({ ContextOfItems: reference }).parse(reader.getLine(value));
    const context = z
      .object({ ContextIdentifier: label })
      .parse(reader.getLine(rep.ContextOfItems.value));
    return {
      identifier: rep.RepresentationIdentifier,
      type: rep.RepresentationType,
      contextIdentifier: context.ContextIdentifier,
      itemIds: rep.Items.map((item) => item.value),
    };
  });
}

export function emittedStyle(reader: SpfReader, styleId: number) {
  const style = surfaceStyle.parse(reader.getLine(styleId));
  const [renderingRef] = style.Styles;
  if (!renderingRef) throw new Error('Missing surface rendering');
  const rendered = rendering.parse(reader.getLine(renderingRef.value));
  const rgb = colour.parse(reader.getLine(rendered.SurfaceColour.value));
  return {
    name: style.Name,
    r: rgb.Red,
    g: rgb.Green,
    b: rgb.Blue,
    transparency: rendered.Transparency,
  };
}

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
  const styles = reader
    .getLinesOfType(WebIFC.IFCSTYLEDITEM)
    .map((id) => styledItem.parse(reader.getLine(id)));
  return {
    expressId,
    representationType: body.RepresentationType,
    items: body.Items.map(({ value: itemId }) => {
      const item = faceSet.parse(reader.getLine(itemId));
      const coords = points.parse(reader.getLine(item.Coordinates.value)).CoordList;
      return {
        itemId,
        type: reader.getLineType(itemId),
        coords,
        triangles: item.CoordIndex,
        styleIds: styles
          .filter((style) => style.Item.value === itemId)
          .flatMap((style) => style.Styles.map(({ value }) => value)),
      };
    }),
  };
}

export function coordinateBounds(coords: readonly (readonly [number, number, number])[]): Bounds3D {
  return {
    xMin: Math.min(...coords.map(([x]) => x)),
    xMax: Math.max(...coords.map(([x]) => x)),
    yMin: Math.min(...coords.map(([, y]) => y)),
    yMax: Math.max(...coords.map(([, y]) => y)),
    zMin: Math.min(...coords.map(([, , z]) => z)),
    zMax: Math.max(...coords.map(([, , z]) => z)),
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
