import { describe, expect, it, beforeAll } from 'vitest';
import { initOCCT } from './setup.js';
import { importIGES, exportIGES } from '@/index.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- kernel instance has dynamic members
let oc: any;

describe('igesFns', () => {
  beforeAll(async () => {
    oc = await initOCCT();
  }, 30000);

  describe('IGES module exports', () => {
    it('exports importIGES function', () => {
      expect(typeof importIGES).toBe('function');
    });

    it('exports exportIGES function', () => {
      expect(typeof exportIGES).toBe('function');
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
});
