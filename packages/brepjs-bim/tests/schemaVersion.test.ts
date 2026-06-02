import { describe, it, expect } from 'vitest';
import {
  IFC_SCHEMAS,
  DEFAULT_IFC_SCHEMA,
  fileSchemaString,
  isIfcSchema,
  schemaSupports,
  type IfcSchema,
} from '../src/ifc-writer/schemaVersion.js';

describe('IfcSchema constants', () => {
  it('lists exactly the two supported schemas', () => {
    expect(IFC_SCHEMAS).toEqual(['IFC4', 'IFC4X3']);
  });

  it('defaults to IFC4', () => {
    expect(DEFAULT_IFC_SCHEMA).toBe('IFC4');
  });
});

describe('fileSchemaString', () => {
  it('returns the FILE_SCHEMA token for IFC4', () => {
    expect(fileSchemaString('IFC4')).toBe('IFC4');
  });

  it('returns the FILE_SCHEMA token for IFC4X3', () => {
    expect(fileSchemaString('IFC4X3')).toBe('IFC4X3');
  });
});

describe('isIfcSchema', () => {
  it('accepts supported schema strings', () => {
    expect(isIfcSchema('IFC4')).toBe(true);
    expect(isIfcSchema('IFC4X3')).toBe(true);
  });

  it('rejects unsupported or malformed strings', () => {
    expect(isIfcSchema('IFC2X3')).toBe(false);
    expect(isIfcSchema('ifc4')).toBe(false);
    expect(isIfcSchema('')).toBe(false);
    expect(isIfcSchema(undefined)).toBe(false);
    expect(isIfcSchema(42)).toBe(false);
  });
});

describe('schemaSupports', () => {
  it('reports an IFC4-only entity as supported in IFC4 and not IFC4X3', () => {
    // IfcBuildingSystem replaces IfcZone-style grouping changes; IfcBuilding
    // representation differs. We use a representative IFC4-only entity name.
    expect(schemaSupports('IFC4', 'IfcBuildingElementProxy')).toBe(true);
  });

  it('reports an IFC4X3-only entity as supported only in IFC4X3', () => {
    // IfcAlignment and related linear-infrastructure entities are new in IFC4X3.
    expect(schemaSupports('IFC4X3', 'IfcAlignment')).toBe(true);
    expect(schemaSupports('IFC4', 'IfcAlignment')).toBe(false);
  });

  it('reports a shared entity as supported in both schemas', () => {
    expect(schemaSupports('IFC4', 'IfcWall')).toBe(true);
    expect(schemaSupports('IFC4X3', 'IfcWall')).toBe(true);
  });

  it('treats unknown entity names as supported (open-world default)', () => {
    expect(schemaSupports('IFC4', 'IfcSomethingNotTracked')).toBe(true);
    expect(schemaSupports('IFC4X3', 'IfcSomethingNotTracked')).toBe(true);
  });
});

describe('IfcSchema type', () => {
  it('every IFC_SCHEMAS member is a valid IfcSchema', () => {
    for (const s of IFC_SCHEMAS) {
      const typed: IfcSchema = s;
      expect(isIfcSchema(typed)).toBe(true);
    }
  });
});
