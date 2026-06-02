import { describe, it, expect } from 'vitest';
import * as WebIFC from 'web-ifc';
import {
  PSET_PROPERTY_TYPE_TABLE,
  PSET_TEMPLATES,
  measureTypeFor,
  webIfcConstantFor,
  templateFor,
  type PsetMeasureType,
  type PsetCategory,
} from '../src/psets/psetTemplates.js';

const ALL_CATEGORIES: readonly PsetCategory[] = [
  'WALL',
  'SLAB',
  'BEAM',
  'COLUMN',
  'DOOR',
  'WINDOW',
];

describe('psetTemplates — measure type table', () => {
  it('maps boolean-valued properties to IFCBOOLEAN', () => {
    expect(PSET_PROPERTY_TYPE_TABLE['IsExternal']).toBe('IFCBOOLEAN');
    expect(PSET_PROPERTY_TYPE_TABLE['LoadBearing']).toBe('IFCBOOLEAN');
    expect(PSET_PROPERTY_TYPE_TABLE['Combustible']).toBe('IFCBOOLEAN');
    expect(PSET_PROPERTY_TYPE_TABLE['Compartmentation']).toBe('IFCBOOLEAN');
  });

  it('maps ThermalTransmittance to its specific measure type, not IFCREAL', () => {
    expect(PSET_PROPERTY_TYPE_TABLE['ThermalTransmittance']).toBe(
      'IFCTHERMALTRANSMITTANCEMEASURE'
    );
    expect(PSET_PROPERTY_TYPE_TABLE['ThermalTransmittance']).not.toBe('IFCREAL');
  });

  it('maps label-valued properties to IFCLABEL', () => {
    expect(PSET_PROPERTY_TYPE_TABLE['FireRating']).toBe('IFCLABEL');
    expect(PSET_PROPERTY_TYPE_TABLE['AcousticRating']).toBe('IFCLABEL');
  });

  it('maps Reference to IFCIDENTIFIER', () => {
    expect(PSET_PROPERTY_TYPE_TABLE['Reference']).toBe('IFCIDENTIFIER');
  });

  it('maps ratio/fraction properties to IFCPOSITIVERATIOMEASURE', () => {
    expect(PSET_PROPERTY_TYPE_TABLE['GlazingAreaFraction']).toBe(
      'IFCPOSITIVERATIOMEASURE'
    );
  });
});

describe('psetTemplates — measureTypeFor helper', () => {
  it('returns the measure type for a known property', () => {
    expect(measureTypeFor('IsExternal')).toBe('IFCBOOLEAN');
    expect(measureTypeFor('ThermalTransmittance')).toBe(
      'IFCTHERMALTRANSMITTANCEMEASURE'
    );
  });

  it('returns undefined for an unknown property', () => {
    expect(measureTypeFor('SomeNonStandardProp')).toBeUndefined();
  });
});

describe('psetTemplates — webIfcConstantFor helper', () => {
  it('resolves each measure type to its web-ifc constant', () => {
    const cases: readonly [PsetMeasureType, number][] = [
      ['IFCBOOLEAN', WebIFC.IFCBOOLEAN],
      ['IFCLABEL', WebIFC.IFCLABEL],
      ['IFCIDENTIFIER', WebIFC.IFCIDENTIFIER],
      ['IFCTEXT', WebIFC.IFCTEXT],
      ['IFCREAL', WebIFC.IFCREAL],
      ['IFCLENGTHMEASURE', WebIFC.IFCLENGTHMEASURE],
      ['IFCPOSITIVELENGTHMEASURE', WebIFC.IFCPOSITIVELENGTHMEASURE],
      ['IFCAREAMEASURE', WebIFC.IFCAREAMEASURE],
      ['IFCVOLUMEMEASURE', WebIFC.IFCVOLUMEMEASURE],
      ['IFCTHERMALTRANSMITTANCEMEASURE', WebIFC.IFCTHERMALTRANSMITTANCEMEASURE],
      ['IFCPOSITIVERATIOMEASURE', WebIFC.IFCPOSITIVERATIOMEASURE],
      ['IFCINTEGER', WebIFC.IFCINTEGER],
    ];
    for (const [measure, expected] of cases) {
      expect(webIfcConstantFor(measure)).toBe(expected);
    }
  });
});

describe('psetTemplates — per-category templates', () => {
  it('provides a template for all 6 element categories', () => {
    for (const category of ALL_CATEGORIES) {
      const template = PSET_TEMPLATES[category];
      expect(template, `missing template for ${category}`).toBeDefined();
      expect(template.properties.length).toBeGreaterThan(0);
    }
  });

  it('names each template after the bSI Pset_*Common convention', () => {
    expect(PSET_TEMPLATES.WALL.psetName).toBe('Pset_WallCommon');
    expect(PSET_TEMPLATES.SLAB.psetName).toBe('Pset_SlabCommon');
    expect(PSET_TEMPLATES.BEAM.psetName).toBe('Pset_BeamCommon');
    expect(PSET_TEMPLATES.COLUMN.psetName).toBe('Pset_ColumnCommon');
    expect(PSET_TEMPLATES.DOOR.psetName).toBe('Pset_DoorCommon');
    expect(PSET_TEMPLATES.WINDOW.psetName).toBe('Pset_WindowCommon');
  });

  it('templateFor returns the same template as the map', () => {
    for (const category of ALL_CATEGORIES) {
      expect(templateFor(category)).toBe(PSET_TEMPLATES[category]);
    }
  });

  it('every property in every template has a resolvable measure type', () => {
    for (const category of ALL_CATEGORIES) {
      for (const prop of PSET_TEMPLATES[category].properties) {
        expect(prop.measureType, `${category}.${prop.name}`).toBeDefined();
        // The per-property measureType must agree with the global table.
        expect(PSET_PROPERTY_TYPE_TABLE[prop.name]).toBe(prop.measureType);
        expect(typeof webIfcConstantFor(prop.measureType)).toBe('number');
      }
    }
  });

  it('marks Status as an enumerated value with the standard status set', () => {
    for (const category of ALL_CATEGORIES) {
      const status = PSET_TEMPLATES[category].properties.find(
        (p) => p.name === 'Status'
      );
      expect(status, `${category} missing Status`).toBeDefined();
      if (status === undefined) continue;
      expect(status.kind).toBe('enumerated');
      expect(status.enumValues).toEqual([
        'NEW',
        'EXISTING',
        'DEMOLISH',
        'TEMPORARY',
        'OTHER',
        'NOTKNOWN',
        'UNSET',
      ]);
    }
  });

  it('marks non-enumerated properties as single values', () => {
    const isExternal = PSET_TEMPLATES.WALL.properties.find(
      (p) => p.name === 'IsExternal'
    );
    expect(isExternal?.kind).toBe('single');
    expect(isExternal?.enumValues).toBeUndefined();
  });

  it('includes the expected core common properties per category', () => {
    const wallNames = PSET_TEMPLATES.WALL.properties.map((p) => p.name);
    expect(wallNames).toContain('IsExternal');
    expect(wallNames).toContain('LoadBearing');
    expect(wallNames).toContain('ThermalTransmittance');
    expect(wallNames).toContain('FireRating');

    const slabNames = PSET_TEMPLATES.SLAB.properties.map((p) => p.name);
    expect(slabNames).toContain('Combustible');
    expect(slabNames).toContain('Compartmentation');

    const doorNames = PSET_TEMPLATES.DOOR.properties.map((p) => p.name);
    expect(doorNames).toContain('FireExit');
    expect(doorNames).toContain('SelfClosing');

    const windowNames = PSET_TEMPLATES.WINDOW.properties.map((p) => p.name);
    expect(windowNames).toContain('GlazingAreaFraction');
    expect(windowNames).toContain('Infiltration');
  });
});
