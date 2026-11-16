import { describe, it, expect, vi } from 'vitest';
import { createPartRunner, PartError, type BrepjsForPart } from '@viewer/publish/partRunner.js';

const fakeMesh = {
  vertices: new Float32Array([0, 0, 0]),
  normals: new Float32Array([0, 0, 1]),
  triangles: new Uint32Array([0]),
  faceGroups: [{ start: 0, count: 1, faceId: 7, origin: 0 }],
};
function makeShape() {
  const disposed = vi.fn();
  return { wrapped: {}, disposed, [Symbol.dispose]: disposed };
}
function makeBrepjs(overrides: Partial<BrepjsForPart> = {}): BrepjsForPart {
  const unused = () => Promise.resolve({ ok: false });
  return {
    isOk: (r) => r.ok,
    importSTEP: unused,
    importSTL: unused,
    importIGES: unused,
    importThreeMF: unused,
    importGLB: unused,
    importOBJ: unused,
    mesh: () => fakeMesh,
    meshEdges: () => ({ lines: new Float32Array([0, 0, 0, 1, 0, 0]) }),
    measureVolume: () => ({ ok: true, value: 42 }),
    measureArea: () => ({ ok: true, value: 84 }),
    isValid: () => true,
    getFaces: () => [],
    getSurfaceType: () => ({ ok: true, value: 'PLANE' }),
    normalAt: () => [0, 0, 1],
    getHashCode: () => 1,
    resolveParams: (_params, input) =>
      Number(input['width'] ?? 10) > 100
        ? { ok: false, error: { code: 'PARAM_OUT_OF_RANGE', message: 'width too large' } }
        : { ok: true, value: { width: Number(input['width'] ?? 10) } },
    exportSTEP: () => ({ ok: true, value: new Blob(['ISO-10303-21']) }),
    exportSTL: () => ({ ok: true, value: new Blob(['stl']) }),
    exportThreeMF: () => new Uint8Array([80, 75]).buffer,
    ...overrides,
  };
}
const params = { kind: 'brepjs.params', defs: { width: { type: 'number', default: 10 } } };

describe('createPartRunner', () => {
  it('reports the declarations and the presets of the part', () => {
    const runner = createPartRunner(makeBrepjs(), {
      default: makeShape,
      params,
      presets: { Wide: { width: 80 }, broken: 'no' },
    });
    expect(runner.defs).toEqual(params.defs);
    expect(runner.presets).toEqual({ Wide: { width: 80 } });
  });

  it('builds with the resolved values', async () => {
    const part = vi.fn(makeShape);
    const runner = createPartRunner(makeBrepjs(), { default: part, params });
    const built = await runner.build({ width: '40' });
    expect(part).toHaveBeenCalledWith({ width: 40 });
    expect(built.values).toEqual({ width: 40 });
    expect(built.measurements).toEqual({ valid: true, volume: 42, area: 84 });
    expect(built.meshData.faceGroups).toEqual([{ start: 0, count: 1, faceId: 7 }]);
  });

  it('calls a part with no declaration with no argument', async () => {
    const part = vi.fn(makeShape);
    const runner = createPartRunner(makeBrepjs(), { default: part });
    const built = await runner.build({});
    expect(part).toHaveBeenCalledWith();
    expect(built.values).toEqual({});
    expect(runner.defs).toEqual({});
  });

  it('rejects values that do not fit, with the error code, and keeps the last shape', async () => {
    const first = makeShape();
    const runner = createPartRunner(makeBrepjs(), { default: () => first, params });
    await runner.build({});
    const failure = await runner.build({ width: 500 }).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(PartError);
    expect(failure).toMatchObject({
      code: 'PARAM_OUT_OF_RANGE',
      message: 'params: width too large',
    });
    expect(first.disposed).not.toHaveBeenCalled();
    await expect(runner.export('step', 'part')).resolves.toMatchObject({ filename: 'part.step' });
  });

  it('disposes the previous shape after a new build', async () => {
    const shapes = [makeShape(), makeShape()];
    let n = 0;
    const runner = createPartRunner(makeBrepjs(), { default: () => shapes[n++] });
    await runner.build({});
    await runner.build({});
    expect(shapes[0]?.disposed).toHaveBeenCalledOnce();
    expect(shapes[1]?.disposed).not.toHaveBeenCalled();
  });

  it('unwraps a Result and a fluent wrapper', async () => {
    const shape = makeShape();
    const viaResult = createPartRunner(makeBrepjs(), {
      default: () => ({ ok: true, value: shape }),
    });
    await expect(viaResult.build({})).resolves.toBeDefined();
    const viaFluent = createPartRunner(makeBrepjs(), {
      default: () => ({ __wrapped: true, val: makeShape() }),
    });
    await expect(viaFluent.build({})).resolves.toBeDefined();
  });

  it.each([
    [
      'an Err',
      () => ({ ok: false, error: { code: 'FILLET_FAILED', message: 'no' } }),
      'part returned Err: no',
    ],
    [
      'a throw',
      () => {
        throw new Error('boom');
      },
      'part threw: boom',
    ],
    ['a value that is not a shape', () => 42, 'the part returned no shape'],
  ])('fails for a part that gives %s', async (_case, part, message) => {
    const runner = createPartRunner(makeBrepjs(), { default: part });
    await expect(runner.build({})).rejects.toThrow(message);
  });

  it('fails for a module with no part function', async () => {
    const runner = createPartRunner(makeBrepjs(), {});
    await expect(runner.build({})).rejects.toThrow('no default-exported function');
  });

  it('exports each format from the last build', async () => {
    const exportSTL = vi.fn(() => ({ ok: true as const, value: new Blob(['stl']) }));
    const runner = createPartRunner(makeBrepjs({ exportSTL }), { default: makeShape });
    await expect(runner.export('step', 'part')).rejects.toThrow('no part is built');
    await runner.build({});
    const step = await runner.export('step', 'plate');
    expect(new TextDecoder().decode(step.bytes)).toBe('ISO-10303-21');
    expect(await runner.export('3mf', 'plate')).toMatchObject({
      filename: 'plate.3mf',
      mime: 'model/3mf',
    });
    await runner.export('stl', 'plate');
    expect(exportSTL).toHaveBeenCalledWith(expect.anything(), { binary: true });
  });
});
