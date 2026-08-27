import { beforeAll, describe, expect, it } from 'vitest';
import { csg, unwrap } from 'brepjs';
import { initOCCT } from '../../../tests/setup.js';
import { familiesToBim } from '../src/familiesAdapter.js';
import { deriveIfcGuidSync } from '../src/identity/guidDerivation.js';
import { disposeImportedModel, type ImportedSpatialNode } from '../src/import/importedModel.js';
import { fromIfc } from '../src/import/fromIfc.js';
import { toIfcValidated } from '../src/serialize/toIfc.js';
import { Member, Sign, profileModel } from './fixtures/civilReferenceProfile.js';

beforeAll(async () => {
  await initOCCT();
}, 30_000);

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Expected ${label}`);
  return value;
}

function flattenSpatial(root: ImportedSpatialNode): readonly ImportedSpatialNode[] {
  return [root, ...root.children.flatMap(flattenSpatial)];
}

const PROFILE_KEY_BY_CATEGORY: Readonly<Record<string, string>> = {
  WALL: 'wall',
  SLAB: 'slab',
  BEAM: 'beam',
  COLUMN: 'column',
  FOOTING: 'footing',
  RAILING: 'railing',
  EARTHWORKS_FILL: 'earthworks',
};

describe('focused civil BIM Capability Profile', () => {
  it('migrates the supported infrastructure slice through the official Projection and re-imports it', async () => {
    using evaluator = new csg.Evaluator();
    const projected = unwrap(
      familiesToBim(profileModel(), {
        project: { name: 'Migrated civil profile', projectId: 'migrated-civil-profile' },
        bodyEvaluator: evaluator,
      })
    );
    using model = projected.model;

    expect(projected.proxied).toEqual([]);
    for (const [keyPath, localId] of projected.idByKeyPath) {
      expect(model.getElement(localId)?.guid).toBe(
        deriveIfcGuidSync(`elem:migrated-civil-profile:${keyPath}`)
      );
    }
    expect(model.getAllElements().map(({ category }) => category)).toEqual([
      'PROJECT',
      'SITE',
      'BRIDGE',
      'BRIDGE_PART',
      'BRIDGE_PART',
      'WALL',
      'SLAB',
      'BEAM',
      'COLUMN',
      'FOOTING',
      'RAILING',
      'EARTHWORKS_FILL',
    ]);
    expect(model.getBeams()[0]?.spec).toMatchObject({
      origin: [-4_000, -150, 250],
      profile: { kind: 'RECTANGULAR', width: 300, height: 500 },
      materialName: 'Steel',
      predefinedType: 'BEAM',
    });
    expect(model.getColumns()[0]?.spec).toMatchObject({
      origin: [0, 0, -2_300],
      profile: { kind: 'RECTANGULAR', width: 500, height: 500 },
      materialName: 'Concrete',
      predefinedType: 'COLUMN',
    });
    expect(model.getSlabs()[0]?.spec).toMatchObject({
      origin: [-4_000, -2_000, -250],
      predefinedType: 'FLOOR',
    });
    expect(model.getFootings()[0]?.spec).toMatchObject({
      origin: [-750, -600, -400],
      predefinedType: 'PAD_FOOTING',
    });
    expect(model.getRailings()[0]?.spec).toMatchObject({
      length: 3_200,
      thickness: 180,
      height: 1_100,
      predefinedType: 'GUARDRAIL',
    });

    const validated = unwrap(
      await toIfcValidated(model, {
        applicationName: 'civil-profile-test',
        applicationVersion: '1',
        ifcSchema: 'IFC4X3',
      })
    );
    expect(validated.report.issues.filter(({ severity }) => severity === 'error')).toEqual([]);

    const imported = unwrap(await fromIfc(validated.bytes));
    try {
      expect(imported.schema).toBe('IFC4X3');
      expect(imported.spatialTree).toMatchObject({
        category: 'PROJECT',
        children: [
          {
            category: 'SITE',
            children: [
              {
                category: 'BRIDGE',
                children: [
                  {
                    category: 'BRIDGE_PART',
                    children: [{ category: 'BRIDGE_PART' }],
                  },
                ],
              },
            ],
          },
        ],
      });
      expect(imported.elements.map(({ category }) => category).sort()).toEqual(
        ['BEAM', 'COLUMN', 'EARTHWORKS_FILL', 'FOOTING', 'RAILING', 'SLAB', 'WALL'].sort()
      );
      for (const element of imported.elements) {
        const productKey = required(
          PROFILE_KEY_BY_CATEGORY[element.category],
          `profile key for ${element.category}`
        );
        expect(element.guid).toBe(
          deriveIfcGuidSync(
            `elem:migrated-civil-profile:migrated-profile/site/bridge/superstructure/deck/${productKey}`
          )
        );
      }
      expect(imported.elements.map(({ category, material }) => [category, material?.name])).toEqual(
        expect.arrayContaining([
          ['BEAM', 'Steel'],
          ['COLUMN', 'Concrete'],
          ['FOOTING', 'Concrete'],
          ['RAILING', 'Steel'],
          ['SLAB', 'Concrete'],
          ['WALL', 'Concrete'],
          ['EARTHWORKS_FILL', 'Compacted soil'],
        ])
      );
      const spatial = flattenSpatial(required(imported.spatialTree, 'imported spatial tree'));
      const deck = required(
        spatial.find(({ category, name }) => category === 'BRIDGE_PART' && name.endsWith('/deck')),
        'imported deck Bridge Part'
      );
      expect(
        imported.elements.map(({ spatialStructureExpressId }) => spatialStructureExpressId)
      ).toEqual(imported.elements.map(() => deck.expressId));
      expect([...deck.containedElements].sort((a, b) => a - b)).toEqual(
        imported.elements.map(({ expressId }) => expressId).sort((a, b) => a - b)
      );
      expect(
        imported.elements.find(({ category }) => category === 'EARTHWORKS_FILL')
      ).toMatchObject({
        predefinedType: 'EMBANKMENT',
        material: { kind: 'SIMPLE', name: 'Compacted soil' },
      });
    } finally {
      disposeImportedModel(imported);
    }
  });

  it('keeps excluded Member and Sign semantics strict or explicitly reported as proxies', () => {
    const root = profileModel([Member({ key: 'member' }), Sign({ key: 'sign' })]);
    using bodyEvaluator = new csg.Evaluator();
    expect(
      familiesToBim(root, {
        project: { name: 'Broader model', projectId: 'broader-model' },
        bodyEvaluator,
      })
    ).toMatchObject({ ok: false, error: { code: 'FAMILIES_UNSUPPORTED_TYPE' } });

    using proxyEvaluator = new csg.Evaluator();
    const projected = unwrap(
      familiesToBim(root, {
        project: { name: 'Broader model', projectId: 'broader-model' },
        bodyEvaluator,
        proxyEvaluator,
      })
    );
    using model = projected.model;
    expect(projected.proxied.map(({ keyPath }) => keyPath)).toEqual([
      'migrated-profile/site/bridge/superstructure/deck/member',
      'migrated-profile/site/bridge/superstructure/deck/sign',
    ]);
    expect(model.getProxies()).toHaveLength(2);
  });
});
