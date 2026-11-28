import { afterEach, describe, expect, it, vi } from 'vitest';

const MISSING = "IFC export needs 'brepjs-bim' installed in this project";

async function load() {
  return import('../src/session/bim.js');
}

describe('importBim', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('brepjs-bim');
    vi.doUnmock('../src/preview/evaluate.js');
  });

  it('returns the installed brepjs-bim when it has the document API', async () => {
    const { importBim } = await load();
    const loaded = await importBim(process.cwd(), MISSING);
    expect(loaded.ok).toBe(true);
  });

  it('reports BIM_OUTDATED for a brepjs-bim without BimDocument and authoring', async () => {
    // A vitest mock throws on an export it does not define; a real namespace reads undefined.
    vi.doMock('brepjs-bim', () => ({
      BimModel: class {},
      BimDocument: undefined,
      authoring: undefined,
      toIfc: () => undefined,
      familiesToBim: () => undefined,
    }));
    const { importBim, MIN_BIM_VERSION } = await load();
    const loaded = await importBim(process.cwd(), MISSING);
    expect(loaded).toEqual({
      ok: false,
      code: 'BIM_OUTDATED',
      message: expect.stringContaining(`brepjs-bim ${MIN_BIM_VERSION} or later`) as unknown,
    });
  });

  it('reports BIM_MISSING with the caller message when brepjs-bim does not resolve', async () => {
    vi.doMock('brepjs-bim', () => {
      throw new Error("Cannot find package 'brepjs-bim'");
    });
    vi.doMock('../src/preview/evaluate.js', () => ({
      resolveProjectPackageEntry: () => undefined,
    }));
    const { importBim } = await load();
    expect(await importBim(process.cwd(), MISSING)).toEqual({
      ok: false,
      code: 'BIM_MISSING',
      message: MISSING,
    });
  });
});
