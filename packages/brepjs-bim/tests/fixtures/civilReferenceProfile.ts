import { csg } from 'brepjs';
import { civilSemantics, el, family, resolve, type Element } from 'brepjs-families';

interface GroupProps {
  readonly children?: readonly Element[] | undefined;
}

const Site = family<GroupProps>(
  'MigratedTransportSite',
  (props) => el('Group', {}, props.children),
  {
    semantics: civilSemantics({
      kind: 'site',
      category: 'site',
      role: 'transport-site',
      composition: 'element',
    }),
  }
);

const Bridge = family<GroupProps>(
  'MigratedGirderBridge',
  (props) => el('Group', {}, props.children),
  {
    semantics: civilSemantics({
      kind: 'facility',
      category: 'bridge',
      role: 'girder',
      composition: 'element',
    }),
  }
);

const Superstructure = family<GroupProps>(
  'MigratedSuperstructure',
  (props) => el('Group', {}, props.children),
  {
    semantics: civilSemantics({
      kind: 'spatial-part',
      category: 'bridge-part',
      role: 'superstructure',
      composition: 'partial',
      subdivision: 'regional',
    }),
  }
);

const Deck = family<GroupProps>('MigratedDeck', (props) => el('Group', {}, props.children), {
  semantics: civilSemantics({
    kind: 'spatial-part',
    category: 'bridge-part',
    role: 'deck',
    composition: 'element',
    subdivision: 'longitudinal',
  }),
});

const Wall = family<{
  readonly length: number;
  readonly thickness: number;
  readonly height: number;
  readonly bayCount: number;
  readonly openingRun: number;
  readonly openingRise: number;
  readonly material: string;
}>(
  'ReferenceSpandrelWall',
  (props) =>
    el('Geometry', {
      node: csg.cutAll(
        csg.box(props.length, props.thickness, props.height),
        Array.from({ length: props.bayCount }, (_, index) =>
          csg.translate(csg.box(props.openingRun, props.thickness, props.openingRise), [
            (index + 0.5) * (props.length / props.bayCount) - props.openingRun / 2,
            0,
            0,
          ])
        )
      ),
    }),
  {
    semantics: (props) =>
      civilSemantics({
        kind: 'product',
        category: 'wall',
        role: 'wall',
        material: props.material,
        dimensionsMm: {
          length: props.length,
          width: props.thickness,
          height: props.height,
        },
      }),
  }
);

const Slab = family<{
  readonly length: number;
  readonly width: number;
  readonly thickness: number;
  readonly longitudinalSide: 'positive' | 'negative';
  readonly transverseSide: 'positive' | 'negative';
  readonly material: string;
}>(
  'ReferenceApproachSlab',
  (props) =>
    el('Geometry', {
      node: csg.translate(csg.box(props.length, props.width, props.thickness), [
        props.longitudinalSide === 'positive' ? 0 : -props.length,
        props.transverseSide === 'positive' ? 0 : -props.width,
        -props.thickness,
      ]),
    }),
  {
    semantics: (props) =>
      civilSemantics({
        kind: 'product',
        category: 'slab',
        role: 'deck',
        material: props.material,
        dimensionsMm: {
          length: props.length,
          width: props.width,
          height: props.thickness,
        },
      }),
  }
);

const Beam = family<{
  readonly length: number;
  readonly width: number;
  readonly depth: number;
  readonly transverseSide: 'positive' | 'negative';
  readonly material: string;
}>(
  'ReferenceCrossGirder',
  (props) =>
    el('Geometry', {
      node: csg.translate(csg.box(props.length, props.width, props.depth), [
        -props.length,
        props.transverseSide === 'positive' ? 0 : -props.width,
        0,
      ]),
    }),
  {
    semantics: (props) =>
      civilSemantics({
        kind: 'product',
        category: 'beam',
        role: 'cross-girder',
        material: props.material,
        dimensionsMm: { length: props.length, width: props.width, height: props.depth },
      }),
  }
);

const Column = family<{
  readonly length: number;
  readonly width: number;
  readonly height: number;
  readonly capOffset: number;
  readonly material: string;
}>(
  'ReferencePierStem',
  (props) =>
    el('Geometry', {
      node: csg.translate(csg.box(props.length, props.width, props.height), [
        -props.length / 2,
        -props.width / 2,
        -(props.capOffset + props.height),
      ]),
    }),
  {
    semantics: (props) =>
      civilSemantics({
        kind: 'product',
        category: 'column',
        role: 'pier-stem',
        material: props.material,
        dimensionsMm: { length: props.length, width: props.width, height: props.height },
      }),
  }
);

const Footing = family<{
  readonly length: number;
  readonly width: number;
  readonly thickness: number;
  readonly material: string;
}>(
  'ReferenceFooting',
  (props) =>
    el('Geometry', {
      node: csg.translate(csg.box(props.length, props.width, props.thickness), [
        -props.length / 2,
        -props.width / 2,
        -props.thickness,
      ]),
    }),
  {
    semantics: (props) =>
      civilSemantics({
        kind: 'product',
        category: 'footing',
        role: 'pad',
        material: props.material,
        dimensionsMm: { length: props.length, width: props.width, height: props.thickness },
      }),
  }
);

interface RailingPostProfile {
  readonly toeWidth: number;
  readonly baseWidth: number;
  readonly shaftWidth: number;
  readonly capWidth: number;
  readonly top: number;
}

const Railing = family<{
  readonly length: number;
  readonly setoutInset: number;
  readonly longitudinalSide: 'positive' | 'negative';
  readonly railWidth: number;
  readonly railHeight: number;
  readonly lowerRailBase: number;
  readonly upperRailBase: number;
  readonly postPitch: number;
  readonly postThickness: number;
  readonly postRunIn: number;
  readonly postRunOut: number;
  readonly postProfile: RailingPostProfile;
  readonly material: string;
}>(
  'ReferenceRoadRailing',
  (props) => {
    const direction = props.longitudinalSide === 'positive' ? 1 : -1;
    const railStart = direction > 0 ? -props.setoutInset : -(props.length - props.setoutInset);
    const rails = [props.lowerRailBase, props.upperRailBase].map((z) =>
      csg.translate(csg.box(props.length, props.railWidth, props.railHeight), [railStart, 0, z])
    );
    const posts = Array.from({ length: Math.floor(props.length / props.postPitch) + 1 }, (_, i) =>
      csg.translate(
        csg.box(props.postThickness, props.postProfile.baseWidth, props.postProfile.top),
        [direction * i * props.postPitch, 0, 0]
      )
    );
    return el('Geometry', { node: csg.compound([...rails, ...posts]) });
  },
  {
    semantics: (props) =>
      (() => {
        const direction = props.longitudinalSide === 'positive' ? 1 : -1;
        const railMin = direction > 0 ? -props.setoutInset : -(props.length - props.setoutInset);
        const railMax = railMin + props.length;
        const finalPost = props.length - props.postRunOut;
        const postMin =
          direction > 0 ? Math.min(0, finalPost) : -Math.max(0, finalPost) - props.postThickness;
        const postMax =
          direction > 0 ? Math.max(0, finalPost) + props.postThickness : -Math.min(0, finalPost);
        return civilSemantics({
          kind: 'product',
          category: 'railing',
          role: 'guardrail',
          material: props.material,
          dimensionsMm: {
            length: Math.max(railMax, postMax) - Math.min(railMin, postMin),
            width: Math.max(
              props.railWidth,
              props.postProfile.toeWidth,
              props.postProfile.baseWidth,
              props.postProfile.shaftWidth,
              props.postProfile.capWidth
            ),
            height: Math.max(props.upperRailBase + props.railHeight, props.postProfile.top),
          },
        });
      })(),
  }
);

const EarthworksFill = family<{
  readonly halfSpan: number;
  readonly halfWidth: number;
  readonly crownRise: number;
  readonly material: string;
}>(
  'ReferenceEarthFill',
  (props) =>
    el('Geometry', {
      node: csg.fuse(
        csg.box(props.halfSpan * 2, props.halfWidth * 2, props.crownRise / 2),
        csg.translate(csg.box(props.halfSpan, props.halfWidth * 2, props.crownRise / 2), [
          props.halfSpan / 2,
          0,
          props.crownRise / 2,
        ])
      ),
    }),
  {
    semantics: (props) =>
      civilSemantics({
        kind: 'product',
        category: 'earthworks-fill',
        role: 'embankment',
        material: props.material,
        dimensionsMm: {
          length: props.halfSpan * 2,
          width: props.halfWidth * 2,
          height: props.crownRise,
        },
      }),
  }
);

export const Member = family('ExcludedMember', () => el('Box', { size: [1_000, 200, 300] }), {
  semantics: civilSemantics({
    kind: 'product',
    category: 'member',
    role: 'arch-segment',
    material: 'Steel',
    dimensionsMm: { length: 1_000, width: 200, height: 300 },
  }),
});

export const Sign = family('ExcludedSign', () => el('Box', { size: [500, 30, 300] }), {
  semantics: civilSemantics({
    kind: 'product',
    category: 'sign',
    role: 'marker',
    material: 'Aluminium',
    dimensionsMm: { width: 500, thickness: 30, height: 300 },
  }),
});

export function profileModel(
  additionalProducts: readonly Element[] = []
): ReturnType<typeof resolve> {
  return resolve(
    el('Group', { key: 'migrated-profile' }, [
      Site({
        key: 'site',
        children: [
          Bridge({
            key: 'bridge',
            children: [
              Superstructure({
                key: 'superstructure',
                children: [
                  Deck({
                    key: 'deck',
                    children: [
                      Wall({
                        key: 'wall',
                        length: 2_000,
                        thickness: 250,
                        height: 1_200,
                        bayCount: 2,
                        openingRun: 500,
                        openingRise: 700,
                        material: 'Concrete',
                      }),
                      Slab({
                        key: 'slab',
                        length: 4_000,
                        width: 2_000,
                        thickness: 250,
                        longitudinalSide: 'negative',
                        transverseSide: 'negative',
                        material: 'Concrete',
                      }),
                      Beam({
                        key: 'beam',
                        length: 4_000,
                        width: 300,
                        depth: 500,
                        transverseSide: 'negative',
                        material: 'Steel',
                      }),
                      Column({
                        key: 'column',
                        length: 500,
                        width: 500,
                        height: 2_000,
                        capOffset: 300,
                        material: 'Concrete',
                      }),
                      Footing({
                        key: 'footing',
                        length: 1_500,
                        width: 1_200,
                        thickness: 400,
                        material: 'Concrete',
                      }),
                      Railing({
                        key: 'railing',
                        length: 3_000,
                        setoutInset: 100,
                        longitudinalSide: 'positive',
                        railWidth: 80,
                        railHeight: 100,
                        lowerRailBase: 500,
                        upperRailBase: 950,
                        postPitch: 1_000,
                        postThickness: 100,
                        postRunIn: 200,
                        postRunOut: 0,
                        postProfile: {
                          toeWidth: 180,
                          baseWidth: 150,
                          shaftWidth: 100,
                          capWidth: 180,
                          top: 1_100,
                        },
                        material: 'Steel',
                      }),
                      EarthworksFill({
                        key: 'earthworks',
                        halfSpan: 1_500,
                        halfWidth: 1_000,
                        crownRise: 1_200,
                        material: 'Compacted soil',
                      }),
                      ...additionalProducts,
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ])
  );
}
