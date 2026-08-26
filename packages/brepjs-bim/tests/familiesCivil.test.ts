import { beforeAll, describe, expect, it } from 'vitest';
import { csg, getBounds, measureVolume, unwrap, type ValidSolid } from 'brepjs';
import { civilSemantics, el, family, resolve, tTranslate, type Element } from 'brepjs-families';
import { initOCCT } from '../../../tests/setup.js';
import { familiesToBim } from '../src/familiesAdapter.js';
import { toIfc, toIfcValidated } from '../src/serialize/toIfc.js';
import { deriveIfcGuidSync } from '../src/identity/guidDerivation.js';
import { checkSchema } from '../src/validation/schemaCheck.js';
import { checkRoundTrip } from '../src/validation/roundTrip.js';

beforeAll(async () => {
  await initOCCT();
}, 30_000);

interface SpatialProps {
  readonly children?: readonly Element[] | undefined;
  readonly at?: readonly [number, number, number] | undefined;
  readonly origin?: readonly [number, number, number] | undefined;
  readonly axisX?: readonly [number, number, number] | undefined;
  readonly axisZ?: readonly [number, number, number] | undefined;
}

function spatialGroup(props: SpatialProps): Element {
  return el(
    'Group',
    { transform: props.at !== undefined ? [tTranslate(props.at)] : undefined },
    props.children
  );
}

const Site = family<SpatialProps>('TransportSite', spatialGroup, {
  semantics: civilSemantics({
    kind: 'site',
    category: 'site',
    role: 'transport-site',
    composition: 'element',
  }),
});

const Bridge = family<SpatialProps>('RoadBridge', spatialGroup, {
  semantics: civilSemantics({
    kind: 'facility',
    category: 'bridge',
    role: 'girder',
    composition: 'element',
  }),
});

const BridgePart = family<SpatialProps>('BridgeDeck', spatialGroup, {
  semantics: civilSemantics({
    kind: 'spatial-part',
    category: 'bridge-part',
    role: 'deck',
    composition: 'element',
    subdivision: 'longitudinal',
  }),
});

const Beam = family<{
  readonly length: number;
  readonly profile: {
    readonly kind: 'RECTANGULAR';
    readonly width: number;
    readonly height: number;
  };
  readonly materialName: string;
}>(
  'DeckBeam',
  (props) => el('Box', { size: [props.length, props.profile.width, props.profile.height] }),
  {
    archetype: 'beam',
  }
);

const EarthFill = family(
  'EarthFill',
  () =>
    el('Geometry', {
      node: csg.fuse(
        csg.box(4_000, 3_000, 1_000),
        csg.translate(csg.box(2_000, 3_000, 1_000), [1_000, 0, 1_000])
      ),
    }),
  {
    semantics: civilSemantics({
      kind: 'product',
      category: 'earthworks-fill',
      role: 'embankment',
      material: 'Compacted soil',
      dimensionsMm: { length: 4_000, width: 3_000, height: 2_000 },
    }),
  }
);

function civilModel(
  siteProps: Partial<SpatialProps> = {},
  additionalProducts: readonly Element[] = []
): ReturnType<typeof resolve> {
  return resolve(
    el('Group', { key: 'civil-model' }, [
      Site({
        key: 'north-site',
        name: 'North transport site',
        at: [1_000, 0, 0],
        ...siteProps,
        children: [
          Bridge({
            key: 'river-bridge',
            name: 'River bridge',
            at: [2_000, 0, 0],
            children: [
              BridgePart({
                key: 'deck',
                name: 'Bridge deck',
                at: [3_000, 0, 0],
                children: [
                  Beam({
                    key: 'main-beam',
                    name: 'Main beam',
                    length: 12_000,
                    profile: { kind: 'RECTANGULAR', width: 400, height: 800 },
                    materialName: 'Structural steel',
                  }),
                  ...additionalProducts,
                ],
              }),
            ],
          }),
        ],
      }),
    ])
  );
}

describe('civil Families Projection', () => {
  it('projects a keyed Bridge hierarchy and contained product into IFC4X3', async () => {
    const projected = unwrap(
      familiesToBim(civilModel(), {
        project: { name: 'Civil gate', projectId: 'civil-gate' },
      })
    );
    using model = projected.model;

    expect([...projected.idByKeyPath.keys()]).toEqual([
      'civil-model',
      'civil-model/north-site',
      'civil-model/north-site/river-bridge',
      'civil-model/north-site/river-bridge/deck',
      'civil-model/north-site/river-bridge/deck/main-beam',
    ]);
    expect(model.getAllElements().map(({ category }) => category)).toEqual([
      'PROJECT',
      'SITE',
      'BRIDGE',
      'BRIDGE_PART',
      'BEAM',
    ]);
    for (const [keyPath, localId] of projected.idByKeyPath) {
      expect(model.getElement(localId)?.guid).toBe(deriveIfcGuidSync(`elem:civil-gate:${keyPath}`));
    }

    const [projectId, siteId, bridgeId, partId, beamId] = [
      'civil-model',
      'civil-model/north-site',
      'civil-model/north-site/river-bridge',
      'civil-model/north-site/river-bridge/deck',
      'civil-model/north-site/river-bridge/deck/main-beam',
    ].map((keyPath) => projected.idByKeyPath.get(keyPath));
    expect(model.getAllRelationships()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'AGGREGATES',
          relatingObject: projectId,
          relatedObjects: [siteId],
        }),
        expect.objectContaining({
          kind: 'AGGREGATES',
          relatingObject: siteId,
          relatedObjects: [bridgeId],
        }),
        expect.objectContaining({
          kind: 'AGGREGATES',
          relatingObject: bridgeId,
          relatedObjects: [partId],
        }),
        expect.objectContaining({
          kind: 'CONTAINED_IN',
          relatingStructure: partId,
          relatedElements: [beamId],
        }),
      ])
    );
    expect(model.getBridges()[0]?.spec).toMatchObject({
      origin: [2_000, 0, 0],
      compositionType: 'ELEMENT',
      predefinedType: 'GIRDER',
    });
    expect(model.getAllElements().find(({ category }) => category === 'SITE')?.spec).toMatchObject({
      origin: [1_000, 0, 0],
    });
    expect(model.getBridgeParts()[0]?.spec).toMatchObject({
      origin: [3_000, 0, 0],
      compositionType: 'ELEMENT',
      usageType: 'LONGITUDINAL',
      predefinedType: 'DECK',
    });
    expect(model.getBeams()[0]?.spec).toMatchObject({ origin: [0, 0, 0] });

    const bytes = unwrap(
      await toIfc(model, {
        applicationName: 'civil-test',
        applicationVersion: '1',
        ifcSchema: 'IFC4X3',
      })
    );
    const ifc = new TextDecoder().decode(bytes);
    expect(ifc).toContain('IFCBRIDGE(');
    expect(ifc).toContain('.GIRDER.');
    expect(ifc).toContain('IFCBRIDGEPART(');
    expect(ifc).toContain('.LONGITUDINAL.');
    expect(ifc).toContain('.DECK.');
    expect(ifc).toContain('IFCBEAM(');
    expect(ifc).not.toContain('IFCBUILDING(');
    expect(
      (await checkSchema(bytes)).issues.filter(({ severity }) => severity === 'error')
    ).toEqual([]);
    expect(
      (await checkRoundTrip(bytes)).issues.filter(({ severity }) => severity === 'error')
    ).toEqual([]);
  });

  it('rejects civil spatial entities when the requested schema is IFC4', async () => {
    const projected = unwrap(
      familiesToBim(civilModel(), {
        project: { name: 'Civil gate', projectId: 'civil-gate' },
      })
    );
    using model = projected.model;

    const result = await toIfc(model, {
      applicationName: 'civil-test',
      applicationVersion: '1',
      ifcSchema: 'IFC4',
    });

    expect(result).toMatchObject({
      ok: false,
      error: { kind: 'BIM_IFC', code: 'IFC4X3_REQUIRED' },
    });
  });

  it('rejects parallel axes before writing an invalid spatial placement', () => {
    const result = familiesToBim(civilModel({ axisX: [0, 0, 1] }), {
      project: { name: 'Civil gate', projectId: 'civil-gate' },
    });

    expect(result).toMatchObject({
      ok: false,
      error: { kind: 'BIM_SPEC', code: 'INVALID_SITE_SPEC' },
    });
  });

  it('requires an evaluator for an authored Earthworks Product Body', () => {
    const result = familiesToBim(civilModel({}, [EarthFill({ key: 'embankment' })]), {
      project: { name: 'Civil gate', projectId: 'civil-gate' },
    });

    expect(result).toMatchObject({
      ok: false,
      error: { kind: 'BIM_SPEC', code: 'FAMILIES_EARTHWORKS_EVALUATOR_REQUIRED' },
    });
  });

  it('projects an exact irregular Earthworks Fill body as a typed contained product', async () => {
    const root = civilModel({}, [EarthFill({ key: 'embankment', name: 'Approach embankment' })]);
    const fillOccurrence = root.children[0]?.children[0]?.children[0]?.children[1];
    expect(fillOccurrence?.keyPath).toBe('civil-model/north-site/river-bridge/deck/embankment');

    using evaluator = new csg.Evaluator();
    const source = unwrap(evaluator.evaluate(fillOccurrence?.geometry ?? csg.emptySolid()));
    let ownedBody: ValidSolid | undefined;
    {
      const projected = unwrap(
        familiesToBim(root, {
          project: { name: 'Civil gate', projectId: 'civil-gate' },
          bodyEvaluator: evaluator,
        })
      );
      using model = projected.model;

      const fill = model.getEarthworksFills()[0];
      ownedBody = fill?.geometry;
      expect(fill?.guid).toBe(
        deriveIfcGuidSync('elem:civil-gate:civil-model/north-site/river-bridge/deck/embankment')
      );
      expect(fill?.spec).toMatchObject({
        name: 'Approach embankment',
        materialName: 'Compacted soil',
        predefinedType: 'EMBANKMENT',
      });
      expect(projected.proxied).toEqual([]);

      const sourceVolume = unwrap(measureVolume(source));
      const projectedVolume = unwrap(measureVolume(fill?.geometry ?? source));
      expect(projectedVolume).toBeCloseTo(sourceVolume, 3);
      const sourceBounds = getBounds(source);
      const bounds = getBounds(fill?.geometry ?? source);
      expect(bounds.xMin).toBeCloseTo(sourceBounds.xMin - 6_000, 5);
      expect(bounds.xMax).toBeCloseTo(sourceBounds.xMax - 6_000, 5);
      const boundsVolume =
        (bounds.xMax - bounds.xMin) * (bounds.yMax - bounds.yMin) * (bounds.zMax - bounds.zMin);
      expect(projectedVolume).toBeLessThan(boundsVolume);

      const fillId = projected.idByKeyPath.get(
        'civil-model/north-site/river-bridge/deck/embankment'
      );
      const partId = projected.idByKeyPath.get('civil-model/north-site/river-bridge/deck');
      const containment = model
        .getAllRelationships()
        .find((rel) => rel.kind === 'CONTAINED_IN' && rel.relatingStructure === partId);
      expect(containment?.kind === 'CONTAINED_IN' && containment.relatedElements).toContain(fillId);
      expect(model.getAllRelationships()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'ASSOCIATES_MATERIAL',
            materialName: 'Compacted soil',
            relatedObjects: [fillId],
          }),
        ])
      );

      const validated = unwrap(
        await toIfcValidated(model, {
          applicationName: 'civil-test',
          applicationVersion: '1',
          ifcSchema: 'IFC4X3',
        })
      );
      expect(validated.report.issues.filter(({ severity }) => severity === 'error')).toEqual([]);
      const bytes = validated.bytes;
      const ifc = new TextDecoder().decode(bytes);
      expect(ifc).toContain('IFCEARTHWORKSFILL(');
      expect(ifc).toContain('.EMBANKMENT.');
      expect(ifc).toContain('IFCTRIANGULATEDFACESET(');
      expect(ifc).toContain('Compacted soil');
      expect(ifc).not.toContain('Qto_EarthworksFillBaseQuantities');
      expect(
        (await checkSchema(bytes)).issues.filter(({ severity }) => severity === 'error')
      ).toEqual([]);
      expect(
        (await checkRoundTrip(bytes)).issues.filter(({ severity }) => severity === 'error')
      ).toEqual([]);
    }
    expect(ownedBody?.disposed).toBe(true);
    expect(source.disposed).toBe(false);
  });
});
