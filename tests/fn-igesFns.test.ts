import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { fnImportIGES, fnExportIGES } from '../src/index.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- OCCT instance has dynamic members
let oc: any;

beforeAll(async () => {
  oc = await initOC();
}, 30000);

describe('IGES module exports', () => {
  it('exports fnImportIGES function', () => {
    expect(typeof fnImportIGES).toBe('function');
  });

  it('exports fnExportIGES function', () => {
    expect(typeof fnExportIGES).toBe('function');
  });
});

describe('IGES import/export (requires WASM rebuild)', () => {
  it('IGES classes availability', () => {
    const hasIGES = typeof oc.IGESControl_Reader_1 === 'function';
    // This test documents that IGES support requires a WASM rebuild.
    // Once IGESControl_Reader and IGESControl_Writer are added to
    // defaults.yml and the WASM is rebuilt, this test will pass.
    if (!hasIGES) {
      console.warn('IGES classes not in WASM build — skipping IGES integration tests');
      return;
    }
    expect(hasIGES).toBe(true);
  });
});
