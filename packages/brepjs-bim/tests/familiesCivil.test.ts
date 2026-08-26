import { beforeAll, describe, expect, it } from 'vitest';
import { csg, getBounds, measureVolume, unwrap, type ValidSolid } from 'brepjs';
import {
  civilSemantics,
  el,
  family,
  resolve,
  tTranslate,
  type Element,
  type ResolvedElement,
  type SpatialComposition,
  type SpatialSubdivision,
} from 'brepjs-families';
import { initOCCT } from '../../../tests/setup.js';
import { familiesToBim } from '../src/familiesAdapter.js';
import { placedSolids } from '../src/elementFns/placedGeometry.js';
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

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Expected ${label}`);
  return value;
}

function findByKeyPath(root: ResolvedElement, keyPath: string): ResolvedElement | undefined {
  if (root.keyPath === keyPath) return root;
  for (const child of root.children) {
    const found = findByKeyPath(child, keyPath);
    if (found !== undefined) return found;
  }
  return undefined;
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

interface FlexibleSpatialProps extends SpatialProps {
  readonly composition: SpatialComposition;
  readonly role: string;
  readonly subdivision?: SpatialSubdivision | undefined;
}

const FlexibleSite = family<FlexibleSpatialProps>('FlexibleSite', spatialGroup, {
  semantics: (props) =>
    civilSemantics({
      kind: 'site',
      category: 'site',
      role: props.role,
      composition: props.composition,
    }),
});

const FlexibleBridge = family<FlexibleSpatialProps>('FlexibleBridge', spatialGroup, {
  semantics: (props) =>
    civilSemantics({
      kind: 'facility',
      category: 'bridge',
      role: props.role,
      composition: props.composition,
    }),
});

const FlexiblePart = family<FlexibleSpatialProps>('FlexibleBridgePart', spatialGroup, {
  semantics: (props) =>
    civilSemantics({
      kind: 'spatial-part',
      category: 'bridge-part',
      role: props.role,
      composition: props.composition,
      ...(props.subdivision !== undefined ? { subdivision: props.subdivision } : {}),
    }),
});

const UnsupportedFacility = family<SpatialProps>('UnsupportedFacility', spatialGroup, {
  semantics: civilSemantics({
    kind: 'facility',
    category: 'road',
    role: 'road',
    composition: 'element',
  }),
});

const UnsupportedMember = family(
  'UnsupportedMember',
  () => el('Box', { size: [1_000, 200, 300] }),
  {
    semantics: civilSemantics({
      kind: 'product',
      category: 'member',
      role: 'arch-segment',
      material: 'Steel',
      dimensionsMm: { length: 1_000, width: 200, height: 300 },
    }),
  }
);

const UnsupportedBeamMember = family<{
  readonly length: number;
  readonly profile: {
    readonly kind: 'RECTANGULAR';
    readonly width: number;
    readonly height: number;
  };
  readonly materialName: string;
}>(
  'UnsupportedBeamMember',
  (props) => el('Box', { size: [props.length, props.profile.width, props.profile.height] }),
  {
    archetype: 'beam',
    semantics: civilSemantics({
      kind: 'product',
      category: 'member',
      role: 'arch-segment',
      material: 'Steel',
      dimensionsMm: { length: 1_000, width: 200, height: 300 },
    }),
  }
);

const UnsupportedEarthworksRole = family(
  'UnsupportedEarthworksRole',
  () => el('Box', { size: [1_000, 1_000, 1_000] }),
  {
    semantics: civilSemantics({
      kind: 'product',
      category: 'earthworks-fill',
      role: 'roadbed',
      material: 'Soil',
      dimensionsMm: { length: 1_000, width: 1_000, height: 1_000 },
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
    const fillOccurrence = findByKeyPath(
      root,
      'civil-model/north-site/river-bridge/deck/embankment'
    );
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

      const fill = required(model.getEarthworksFills()[0], 'projected Earthworks Fill');
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

      const placed = unwrap(
        placedSolids(fill, {
          parentFrame: {
            origin: [6_000, 0, 0],
            axisX: [1, 0, 0],
            axisZ: [0, 0, 1],
          },
        })
      );
      using worldBody = required(placed[0], 'world-placed Earthworks Fill body');
      const worldBounds = getBounds(worldBody);
      expect(worldBounds.xMin).toBeCloseTo(sourceBounds.xMin, 5);
      expect(worldBounds.xMax).toBeCloseTo(sourceBounds.xMax, 5);

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

  it('projects multiple Bridges and recursive Parts with exact composition and usage', () => {
    const root = resolve(
      el('Group', { key: 'network' }, [
        FlexibleSite({
          key: 'road-site',
          name: 'Road site',
          role: 'transport-site',
          composition: 'collection',
          children: [
            FlexibleBridge({
              key: 'arched-bridge',
              name: 'Arched bridge',
              role: 'arched',
              composition: 'partial',
              children: [
                FlexiblePart({
                  key: 'superstructure',
                  name: 'Superstructure',
                  role: 'superstructure',
                  composition: 'partial',
                  subdivision: 'regional',
                  children: [
                    FlexiblePart({
                      key: 'deck',
                      name: 'Nested deck',
                      role: 'deck',
                      composition: 'element',
                      subdivision: 'longitudinal',
                      children: [
                        Beam({
                          key: 'deck-beam',
                          length: 8_000,
                          profile: { kind: 'RECTANGULAR', width: 300, height: 500 },
                          materialName: 'Steel',
                        }),
                      ],
                    }),
                    FlexiblePart({
                      key: 'pier',
                      name: 'Pier region',
                      role: 'pier',
                      composition: 'collection',
                      subdivision: 'vertical',
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
        FlexibleSite({
          key: 'rail-site',
          name: 'Rail site',
          role: 'transport-site',
          composition: 'element',
          children: [
            FlexibleBridge({
              key: 'girder-bridge',
              name: 'Girder bridge',
              role: 'girder',
              composition: 'element',
              children: [
                FlexiblePart({
                  key: 'approach',
                  name: 'Approach',
                  role: 'surface-structure',
                  composition: 'element',
                  subdivision: 'lateral',
                }),
                FlexiblePart({
                  key: 'unspecified',
                  name: 'Unspecified part',
                  role: 'substructure',
                  composition: 'element',
                }),
              ],
            }),
          ],
        }),
      ])
    );

    const projected = unwrap(
      familiesToBim(root, { project: { name: 'Network', projectId: 'network' } })
    );
    using model = projected.model;

    expect(model.getAllElements().filter(({ category }) => category === 'SITE')).toHaveLength(2);
    expect(model.getBridges()).toHaveLength(2);
    expect(model.getBridgeParts()).toHaveLength(5);
    expect(model.getAllElements().some(({ category }) => category === 'BUILDING')).toBe(false);
    expect(
      model
        .getAllElements()
        .find(({ category, spec }) => category === 'SITE' && spec.name === 'Road site')?.spec
    ).toMatchObject({ compositionType: 'COMPLEX' });
    expect(
      model.getBridges().find(({ spec }) => spec.name === 'Arched bridge')?.spec
    ).toMatchObject({ compositionType: 'PARTIAL', predefinedType: 'ARCHED' });
    expect(
      model.getBridgeParts().map(({ spec }) => [spec.name, spec.compositionType, spec.usageType])
    ).toEqual(
      expect.arrayContaining([
        ['Superstructure', 'PARTIAL', 'REGION'],
        ['Nested deck', 'ELEMENT', 'LONGITUDINAL'],
        ['Pier region', 'COMPLEX', 'VERTICAL'],
        ['Approach', 'ELEMENT', 'LATERAL'],
        ['Unspecified part', 'ELEMENT', 'NOTDEFINED'],
      ])
    );

    const superstructureId = projected.idByKeyPath.get(
      'network/road-site/arched-bridge/superstructure'
    );
    const deckId = projected.idByKeyPath.get('network/road-site/arched-bridge/superstructure/deck');
    const beamId = projected.idByKeyPath.get(
      'network/road-site/arched-bridge/superstructure/deck/deck-beam'
    );
    const nestedParts = model
      .getAllRelationships()
      .find((rel) => rel.kind === 'AGGREGATES' && rel.relatingObject === superstructureId);
    expect(nestedParts?.kind === 'AGGREGATES' && nestedParts.relatedObjects).toContain(deckId);
    expect(model.getAllRelationships()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'CONTAINED_IN',
          relatingStructure: deckId,
          relatedElements: [beamId],
        }),
      ])
    );
  });

  it('returns structured errors for invalid hierarchy and unsupported spatial meaning', () => {
    const invalidHierarchy = familiesToBim(
      resolve(el('Group', { key: 'invalid' }, [Bridge({ key: 'orphan-bridge', children: [] })])),
      { project: { name: 'Invalid', projectId: 'invalid' } }
    );
    expect(invalidHierarchy).toMatchObject({
      ok: false,
      error: { kind: 'BIM_SPEC', code: 'FAMILIES_INVALID_CIVIL_HIERARCHY' },
    });

    const unsupportedSpatial = familiesToBim(
      resolve(
        el('Group', { key: 'unsupported' }, [
          Site({
            key: 'site',
            children: [UnsupportedFacility({ key: 'road', children: [] })],
          }),
        ])
      ),
      { project: { name: 'Unsupported', projectId: 'unsupported' } }
    );
    if (unsupportedSpatial.ok) unsupportedSpatial.value.model[Symbol.dispose]();
    expect(unsupportedSpatial).toMatchObject({
      ok: false,
      error: { kind: 'BIM_SPEC', code: 'FAMILIES_UNSUPPORTED_CIVIL_SEMANTICS' },
    });
  });

  it('rejects unsupported civil roles instead of silently writing NOTDEFINED', () => {
    const unsupportedBridgeRole = familiesToBim(
      resolve(
        el('Group', { key: 'unsupported-bridge-role' }, [
          FlexibleSite({
            key: 'site',
            role: 'transport-site',
            composition: 'element',
            children: [
              FlexibleBridge({
                key: 'bridge',
                role: 'road',
                composition: 'element',
              }),
            ],
          }),
        ])
      ),
      { project: { name: 'Unsupported roles', projectId: 'unsupported-bridge-role' } }
    );
    expect(unsupportedBridgeRole).toMatchObject({
      ok: false,
      error: { kind: 'BIM_SPEC', code: 'FAMILIES_UNSUPPORTED_CIVIL_SEMANTICS' },
    });

    const unsupportedPartRole = familiesToBim(
      resolve(
        el('Group', { key: 'unsupported-part-role' }, [
          Site({
            key: 'site',
            children: [
              Bridge({
                key: 'bridge',
                children: [
                  FlexiblePart({
                    key: 'part',
                    role: 'roadbed',
                    composition: 'element',
                  }),
                ],
              }),
            ],
          }),
        ])
      ),
      { project: { name: 'Unsupported roles', projectId: 'unsupported-part-role' } }
    );
    expect(unsupportedPartRole).toMatchObject({
      ok: false,
      error: { kind: 'BIM_SPEC', code: 'FAMILIES_UNSUPPORTED_CIVIL_SEMANTICS' },
    });

    using bodyEvaluator = new csg.Evaluator();
    const unsupportedEarthworksRole = familiesToBim(
      civilModel({}, [UnsupportedEarthworksRole({ key: 'roadbed' })]),
      {
        project: { name: 'Unsupported roles', projectId: 'unsupported-earthworks-role' },
        bodyEvaluator,
      }
    );
    expect(unsupportedEarthworksRole).toMatchObject({
      ok: false,
      error: { kind: 'BIM_SPEC', code: 'FAMILIES_UNSUPPORTED_CIVIL_SEMANTICS' },
    });
  });

  it('never lets an archetype override an unsupported Product semantic class', () => {
    const root = civilModel({}, [
      UnsupportedBeamMember({
        key: 'semantic-member',
        length: 1_000,
        profile: { kind: 'RECTANGULAR', width: 200, height: 300 },
        materialName: 'Steel',
      }),
    ]);

    const strict = familiesToBim(root, {
      project: { name: 'Civil gate', projectId: 'civil-gate' },
    });
    expect(strict).toMatchObject({
      ok: false,
      error: { kind: 'BIM_SPEC', code: 'FAMILIES_UNSUPPORTED_TYPE' },
    });

    using proxyEvaluator = new csg.Evaluator();
    const projected = unwrap(
      familiesToBim(root, {
        project: { name: 'Civil gate', projectId: 'civil-gate' },
        proxyEvaluator,
      })
    );
    using model = projected.model;
    expect(model.getBeams()).toHaveLength(1);
    expect(model.getProxies()).toHaveLength(1);
    expect(projected.proxied).toEqual([
      expect.objectContaining({
        keyPath: 'civil-model/north-site/river-bridge/deck/semantic-member',
        archetype: 'beam',
      }),
    ]);
  });

  it('keeps unsupported Products strict unless proxy fallback is explicitly enabled', () => {
    const root = civilModel({}, [UnsupportedMember({ key: 'arch-member' })]);

    using bodyEvaluator = new csg.Evaluator();
    const bodyOnly = familiesToBim(root, {
      project: { name: 'Civil gate', projectId: 'civil-gate' },
      bodyEvaluator,
    });
    expect(bodyOnly).toMatchObject({
      ok: false,
      error: { kind: 'BIM_SPEC', code: 'FAMILIES_UNSUPPORTED_TYPE' },
    });

    const memberOccurrence = findByKeyPath(
      root,
      'civil-model/north-site/river-bridge/deck/arch-member'
    );
    using proxyEvaluator = new csg.Evaluator();
    const source = unwrap(proxyEvaluator.evaluate(memberOccurrence?.geometry ?? csg.emptySolid()));
    const projected = unwrap(
      familiesToBim(root, {
        project: { name: 'Civil gate', projectId: 'civil-gate' },
        proxyEvaluator,
      })
    );
    using model = projected.model;
    expect(projected.proxied).toEqual([
      {
        keyPath: 'civil-model/north-site/river-bridge/deck/arch-member',
        type: 'UnsupportedMember',
        archetype: undefined,
      },
    ]);
    expect(model.getProxies()).toHaveLength(1);
    expect(model.getAllElements().some(({ category }) => category === 'EARTHWORKS_FILL')).toBe(
      false
    );
    const sourceBounds = getBounds(source);
    const proxy = required(model.getProxies()[0], 'projected proxy');
    const proxyBounds = getBounds(proxy.geometry);
    expect(proxyBounds.xMin).toBeCloseTo(sourceBounds.xMin - 6_000, 5);
    expect(proxyBounds.xMax).toBeCloseTo(sourceBounds.xMax - 6_000, 5);

    const placed = unwrap(
      placedSolids(proxy, {
        parentFrame: {
          origin: [6_000, 0, 0],
          axisX: [1, 0, 0],
          axisZ: [0, 0, 1],
        },
      })
    );
    using worldBody = required(placed[0], 'world-placed proxy body');
    const worldBounds = getBounds(worldBody);
    expect(worldBounds.xMin).toBeCloseTo(sourceBounds.xMin, 5);
    expect(worldBounds.xMax).toBeCloseTo(sourceBounds.xMax, 5);
  });
});
