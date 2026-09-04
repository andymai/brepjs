import { beforeAll, describe, expect, it } from 'vitest';
import * as WebIFC from 'web-ifc';
import {
  csg,
  getBounds,
  getSolids,
  measureVolume,
  unwrap,
  type AnyShape,
  type Bounds3D,
  type Dimension,
} from 'brepjs';
import {
  civilSemantics,
  el,
  evaluateModel,
  family,
  resolve,
  tTranslate,
  type Element,
  type ResolvedElement,
  type TransformOp,
} from 'brepjs-families';
import { initKernel } from '../../../tests/setup.js';
import { placedSolids } from '../src/elementFns/placedGeometry.js';
import { familiesToBim } from '../src/familiesAdapter.js';
import { fromIfc } from '../src/import/fromIfc.js';
import { disposeImportedModel } from '../src/import/importedModel.js';
import { toIfc } from '../src/serialize/toIfc.js';
import { bodySolids } from '../src/types/productBody.js';
import type { BimCategory } from '../src/types/bimTypes.js';

beforeAll(async () => {
  await initKernel();
}, 30_000);

const PROJECT = { name: 'Exact typed bodies', projectId: 'exact-typed-bodies' };
const IFC_METADATA = { applicationName: 'exact-typed-body-test', applicationVersion: '1' };
const PRODUCT_TRANSFORM = [tTranslate([1_000, 2_000, 3_000])] as const;
const BOUND_COMPONENTS: readonly (keyof Bounds3D)[] = [
  'xMin',
  'xMax',
  'yMin',
  'yMax',
  'zMin',
  'zMax',
];

const Storey = family<{ readonly children: readonly Element[] }>(
  'ExactBodyStorey',
  ({ children }) => el('Group', {}, children),
  { archetype: 'storey' }
);

interface ProductPlacementProps {
  readonly transform?: readonly TransformOp[] | undefined;
}

const DisconnectedRailing = family<ProductPlacementProps>(
  'DisconnectedRailing',
  ({ transform }) =>
    el('Geometry', {
      node: csg.compound([
        csg.box(1_000, 100, 50),
        csg.translate(csg.box(1_000, 100, 50), [0, 0, 450]),
      ]),
      transform: transform ?? [],
    }),
  {
    semantics: civilSemantics({
      kind: 'product',
      category: 'railing',
      role: 'guardrail',
      material: 'Steel',
      dimensionsMm: { length: 1_000, width: 100, height: 500 },
    }),
  }
);

const SlottedWall = family<ProductPlacementProps>(
  'SlottedWall',
  ({ transform }) =>
    el('Geometry', {
      node: csg.cut(csg.box(1_000, 100, 500), csg.translate(csg.box(600, 100, 300), [200, 0, 100])),
      transform: transform ?? [],
    }),
  {
    semantics: civilSemantics({
      kind: 'product',
      category: 'wall',
      role: 'wall',
      material: 'Masonry',
      dimensionsMm: { length: 1_000, width: 100, height: 500 },
    }),
  }
);

interface ExactBodyCase {
  readonly name: string;
  readonly root: ResolvedElement;
  readonly keyPath: string;
  readonly category: Extract<BimCategory, 'RAILING' | 'WALL'>;
  readonly ifcType: number;
  readonly authoredSolidCount: number;
}

const cases: readonly ExactBodyCase[] = [
  {
    name: 'a disconnected two-rail Body remains an IfcRailing',
    root: resolve(
      Storey({
        key: 'level',
        children: [
          DisconnectedRailing({
            key: 'railing',
            name: 'Railing',
            transform: PRODUCT_TRANSFORM,
          }),
        ],
      })
    ),
    keyPath: 'level/railing',
    category: 'RAILING',
    ifcType: WebIFC.IFCRAILING,
    authoredSolidCount: 2,
  },
  {
    name: 'a baked through-slot remains in an IfcWall',
    root: resolve(
      Storey({
        key: 'level',
        children: [
          SlottedWall({ key: 'wall', name: 'Slotted wall', transform: PRODUCT_TRANSFORM }),
        ],
      })
    ),
    keyPath: 'level/wall',
    category: 'WALL',
    ifcType: WebIFC.IFCWALL,
    authoredSolidCount: 1,
  },
];

describe('authoritative exact Bodies on typed civil Products', () => {
  for (const bodyCase of cases) {
    it(bodyCase.name, async () => {
      using evaluator = new csg.Evaluator();
      const evaluated = evaluateModel(bodyCase.root, evaluator, {}, { shapes: true });
      const authoredResult = required(
        evaluated.byKeyPath.get(bodyCase.keyPath)?.shape,
        `${bodyCase.keyPath} evaluated Body`
      );
      if (!authoredResult.ok) throw new Error(authoredResult.error.message);
      const authored = authoredResult.value;
      expect(getSolids(authored)).toHaveLength(bodyCase.authoredSolidCount);

      const projected = unwrap(
        familiesToBim(bodyCase.root, {
          project: PROJECT,
          bodyEvaluator: evaluator,
        })
      );
      using model = projected.model;
      const localId = required(projected.idByKeyPath.get(bodyCase.keyPath), 'projected local id');
      const element = required(model.getElement(localId), 'projected element');
      expect(element.category).toBe(bodyCase.category);
      if (element.category !== bodyCase.category) throw new Error('Projected category mismatch');
      expect(element.geometry.kind).toBe('EXACT');
      expect(bodySolids(element.geometry)).toHaveLength(bodyCase.authoredSolidCount);

      const placed = unwrap(placedSolids(element));
      try {
        expect(placed).toHaveLength(bodyCase.authoredSolidCount);
        expectBodyClose(placed, authored, 3, 'eager projection');

        const bytes = unwrap(await toIfc(model, IFC_METADATA));
        await expectIfcOccurrence(bytes, element.guid, bodyCase);
        const imported = unwrap(await fromIfc(bytes));
        try {
          const importedElement = required(
            imported.elements.find(({ guid }) => guid === element.guid),
            'IFC-imported element'
          );
          expect(importedElement.category).toBe(bodyCase.category);
          expect(importedElement.geometry.completeness).toBe('COMPLETE');
          expect(importedElement.geometry.solids).toHaveLength(bodyCase.authoredSolidCount);
          expectBodyClose(importedElement.geometry.solids, authored, 1, 'IFC round-trip');
          expectBoundsClose(
            required(importedElement.geometry.bounds, 'complete aggregate bounds'),
            getBounds(authored),
            2,
            'IFC aggregate bounds'
          );

          if (bodyCase.category === 'RAILING') {
            expect(importedElement.geometry.solid).toBeNull();
          } else {
            expect(importedElement.geometry.solid).toBe(importedElement.geometry.solids[0]);
            const quantities = required(
              importedElement.psets.find(({ name }) => name === 'Qto_WallBaseQuantities'),
              'exact wall quantities'
            );
            expect(Object.keys(quantities.properties).sort()).toEqual([
              'Height',
              'Length',
              'NetVolume',
              'Width',
            ]);
            expect(quantities.properties['NetVolume']).toBeCloseTo(
              totalVolume([authored]) / 1_000_000_000,
              8
            );
          }
        } finally {
          disposeImportedModel(imported);
        }
      } finally {
        for (const shape of placed) shape[Symbol.dispose]();
      }
    });
  }
});

async function expectIfcOccurrence(
  bytes: Uint8Array,
  guid: string,
  bodyCase: ExactBodyCase
): Promise<void> {
  const api = new WebIFC.IfcAPI();
  await api.Init();
  const modelId = api.OpenModel(bytes);
  try {
    const occurrence = findOccurrence(api, modelId, bodyCase.ifcType, guid);
    if (bodyCase.category === 'RAILING') {
      expect(effectivePredefinedType(api, modelId, occurrence)).toBe('GUARDRAIL');
    }
    const representationId = refValue(occurrence['Representation']);
    const productShape = api.GetLine(modelId, representationId) as Record<string, unknown>;
    const representations = refs(productShape['Representations']);
    const body = required(
      representations
        .map((id) => api.GetLine(modelId, id) as Record<string, unknown>)
        .find(
          (representation) => labelValue(representation['RepresentationIdentifier']) === 'Body'
        ),
      'Body shape representation'
    );
    expect(labelValue(body['RepresentationType'])).toBe('Tessellation');
    expect(refs(body['Items'])).toHaveLength(bodyCase.authoredSolidCount);
  } finally {
    api.CloseModel(modelId);
  }
}

function findOccurrence(
  api: WebIFC.IfcAPI,
  modelId: number,
  type: number,
  guid: string
): Record<string, unknown> {
  const ids = api.GetLineIDsWithType(modelId, type);
  for (let index = 0; index < ids.size(); index++) {
    const occurrence = api.GetLine(modelId, ids.get(index)) as Record<string, unknown>;
    if (labelValue(occurrence['GlobalId']) === guid) return occurrence;
  }
  throw new Error(`Expected IFC occurrence ${guid}`);
}

function effectivePredefinedType(
  api: WebIFC.IfcAPI,
  modelId: number,
  occurrence: Record<string, unknown>
): string | undefined {
  const own = labelValue(occurrence['PredefinedType']);
  if (own !== undefined && own !== 'NOTDEFINED') return own;
  const occurrenceId = numberValue(occurrence['expressID']);
  const relIds = api.GetLineIDsWithType(modelId, WebIFC.IFCRELDEFINESBYTYPE);
  for (let index = 0; index < relIds.size(); index++) {
    const relation = api.GetLine(modelId, relIds.get(index)) as Record<string, unknown>;
    if (!refs(relation['RelatedObjects']).includes(occurrenceId)) continue;
    const typeLine = api.GetLine(modelId, refValue(relation['RelatingType'])) as Record<
      string,
      unknown
    >;
    return labelValue(typeLine['PredefinedType']);
  }
  return own;
}

function refs(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.map(refValue);
}

function refValue(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && value !== null && 'value' in value) {
    return numberValue(value.value);
  }
  throw new Error('Expected IFC reference');
}

function numberValue(value: unknown): number {
  if (typeof value !== 'number') throw new Error('Expected IFC number');
  return value;
}

function labelValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'value' in value) {
    return typeof value.value === 'string' ? value.value : undefined;
  }
  return undefined;
}

function required<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) throw new Error(`Expected ${label}`);
  return value;
}

function expectBodyClose(
  actual: readonly AnyShape<Dimension>[],
  expected: AnyShape<Dimension>,
  precision: number,
  label: string
): void {
  expect
    .soft(totalVolume(actual), `${label} volume`)
    .toBeCloseTo(totalVolume([expected]), precision);
  expectBoundsClose(combinedBounds(actual), getBounds(expected), precision, label);
}

function totalVolume(shapes: readonly AnyShape<Dimension>[]): number {
  return shapes.reduce(
    (sum, shape) =>
      sum +
      getSolids(shape).reduce((solidSum, solid) => solidSum + unwrap(measureVolume(solid)), 0),
    0
  );
}

function combinedBounds(shapes: readonly AnyShape<Dimension>[]): Bounds3D {
  const first = required(shapes[0], 'Body shape');
  return shapes.slice(1).reduce<Bounds3D>((combined, shape) => {
    const next = getBounds(shape);
    return {
      xMin: Math.min(combined.xMin, next.xMin),
      xMax: Math.max(combined.xMax, next.xMax),
      yMin: Math.min(combined.yMin, next.yMin),
      yMax: Math.max(combined.yMax, next.yMax),
      zMin: Math.min(combined.zMin, next.zMin),
      zMax: Math.max(combined.zMax, next.zMax),
    };
  }, getBounds(first));
}

function expectBoundsClose(
  actual: Bounds3D,
  expected: Bounds3D,
  precision: number,
  label: string
): void {
  for (const component of BOUND_COMPONENTS) {
    expect
      .soft(actual[component], `${label} ${component}`)
      .toBeCloseTo(expected[component], precision);
  }
}
