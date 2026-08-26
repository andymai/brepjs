import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { civilSemantics, el, family, resolve } from '../src/index.js';

describe('Civil Engineering Semantics', () => {
  it('accepts Site, Facility, Spatial Part, and Product meaning without IFC vocabulary', () => {
    const semantics = [
      civilSemantics({
        kind: 'site',
        category: 'site',
        role: 'transport-site',
        composition: 'element',
      }),
      civilSemantics({
        kind: 'facility',
        category: 'bridge',
        role: 'girder',
        composition: 'element',
      }),
      civilSemantics({
        kind: 'spatial-part',
        category: 'bridge-part',
        role: 'deck',
        composition: 'element',
        subdivision: 'longitudinal',
      }),
      civilSemantics({
        kind: 'product',
        category: 'earthworks-fill',
        role: 'embankment',
        material: 'Compacted earth',
        dimensionsMm: { length: 12_000, width: 8_000, height: 750 },
      }),
    ];

    expect(semantics.map(({ kind }) => kind)).toEqual([
      'site',
      'facility',
      'spatial-part',
      'product',
    ]);
  });

  it('preserves definition-owned semantics derived from validated Family props', () => {
    const props = z.object({
      length: z.number().positive(),
      width: z.number().positive(),
      height: z.number().positive(),
      material: z.string().trim().min(1).default('Compacted earth'),
    });
    type Props = z.output<typeof props>;
    type Input = z.input<typeof props>;

    const EarthFill = family<Props, Input>(
      'EarthFill',
      ({ length, width, height }) => el('Box', { size: [length, width, height] }),
      {
        props,
        semantics: ({ length, width, height, material }) =>
          civilSemantics({
            kind: 'product',
            category: 'earthworks-fill',
            role: 'embankment',
            material,
            dimensionsMm: { length, width, height },
          }),
      }
    );

    const occurrence = resolve(EarthFill({ key: 'north-fill', length: 12_000, width: 8_000, height: 750 }));

    expect(occurrence.semantics).toEqual({
      kind: 'product',
      category: 'earthworks-fill',
      role: 'embankment',
      material: 'Compacted earth',
      dimensionsMm: { length: 12_000, width: 8_000, height: 750 },
    });
  });

  it('rejects non-positive Product dimensions', () => {
    expect(() =>
      civilSemantics({
        kind: 'product',
        category: 'earthworks-fill',
        role: 'embankment',
        material: 'Compacted earth',
        dimensionsMm: { length: 12_000, width: 8_000, height: 0 },
      })
    ).toThrow(/dimensionsMm\.height.*positive/i);
  });

  it('rejects empty civil vocabulary values', () => {
    expect(() =>
      civilSemantics({
        kind: 'facility',
        category: '   ',
        role: 'girder',
        composition: 'element',
      })
    ).toThrow(/category.*non-empty string/i);
  });

  it('validates definition-owned semantic resolvers even without an explicit helper call', () => {
    const Invalid = family(
      'Invalid',
      () => el('Box', { size: [1, 1, 1] }),
      {
        semantics: () => ({
          kind: 'product',
          category: 'earthworks-fill',
          role: 'embankment',
          material: 'Earth',
          dimensionsMm: { length: 1, width: 1, height: 0 },
        }),
      }
    );

    expect(() => resolve(Invalid({ key: 'invalid' }))).toThrow(/dimensionsMm\.height.*positive/i);
  });

  it('rejects invalid spatial composition values at runtime', () => {
    expect(() =>
      civilSemantics({
        kind: 'facility',
        category: 'bridge',
        role: 'girder',
        composition: 'whole',
      } as never)
    ).toThrow(/composition.*collection, element, or partial/i);
  });

  it('keeps constant semantics owned by the Family definition', () => {
    const Bridge = family(
      'Bridge',
      () => el('Group', {}),
      {
        semantics: civilSemantics({
          kind: 'facility',
          category: 'bridge',
          role: 'girder',
          composition: 'element',
        }),
      }
    );

    const occurrence = resolve(
      Bridge({
        key: 'bridge-1',
        semantics: { kind: 'facility', category: 'road', role: 'other' },
      } as never)
    );

    expect(occurrence.semantics).toEqual({
      kind: 'facility',
      category: 'bridge',
      role: 'girder',
      composition: 'element',
    });
  });

  it('rejects fields that do not apply to a civil kind', () => {
    expect(() =>
      civilSemantics({
        kind: 'site',
        category: 'site',
        role: 'transport-site',
        composition: 'element',
        subdivision: 'regional',
      } as never)
    ).toThrow(/subdivision.*not applicable.*site/i);
  });

  it.each([
    [
      'kind',
      { kind: 'bridge', category: 'bridge', role: 'girder', composition: 'element' },
      /kind.*site, facility, spatial-part, or product/i,
    ],
    [
      'role',
      { kind: 'site', category: 'site', role: '', composition: 'element' },
      /role.*non-empty string/i,
    ],
    [
      'material',
      {
        kind: 'product',
        category: 'earthworks-fill',
        role: 'embankment',
        material: '',
        dimensionsMm: { length: 1 },
      },
      /material.*non-empty string/i,
    ],
    [
      'subdivision',
      {
        kind: 'spatial-part',
        category: 'bridge-part',
        role: 'deck',
        composition: 'element',
        subdivision: 'axial',
      },
      /subdivision.*lateral, longitudinal, vertical, or regional/i,
    ],
    [
      'dimension',
      {
        kind: 'product',
        category: 'earthworks-fill',
        role: 'embankment',
        material: 'Earth',
        dimensionsMm: { length: Number.NaN },
      },
      /dimensionsMm\.length.*finite positive/i,
    ],
    [
      'missing dimensions',
      {
        kind: 'product',
        category: 'earthworks-fill',
        role: 'embankment',
        material: 'Earth',
      },
      /dimensionsMm.*at least one/i,
    ],
    [
      'properties',
      {
        kind: 'site',
        category: 'site',
        role: 'transport-site',
        composition: 'element',
        properties: { tags: ['civil'] },
      },
      /properties\.tags.*string, number, or boolean/i,
    ],
  ])('rejects an invalid %s value', (_name, value, message) => {
    expect(() => civilSemantics(value as never)).toThrow(message);
  });

  it('allows a Spatial Part to leave subdivision unspecified', () => {
    expect(
      civilSemantics({
        kind: 'spatial-part',
        category: 'bridge-part',
        role: 'deck',
        composition: 'element',
      })
    ).toMatchObject({ kind: 'spatial-part', role: 'deck' });
  });

  it('resolves a structurally compatible legacy Family without a semantics hook', () => {
    const Legacy = family('Legacy', () => el('Box', { size: [1, 1, 1] }));
    delete (Legacy as { resolveSemanticsErased?: unknown }).resolveSemanticsErased;

    expect(resolve(Legacy({ key: 'legacy' })).semantics).toBeUndefined();
  });
});
