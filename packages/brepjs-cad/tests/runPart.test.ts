import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { runPart } from '@/verify/runPart.js';
import { reportOk } from '@/verify/report.js';

const fix = (n: string) => fileURLToPath(new URL(`./fixtures/${n}`, import.meta.url));

interface GlbDoc {
  scene: number;
  scenes: { nodes: number[] }[];
  nodes: { mesh?: number; rotation?: number[]; children?: number[] }[];
  materials?: { name?: string }[];
}

// Extract the JSON chunk from a binary GLB (12-byte header, then a JSON chunk).
function parseGlbJson(glb: ArrayBuffer): GlbDoc {
  const view = new DataView(glb);
  const jsonLen = view.getUint32(12, true);
  const json = new TextDecoder().decode(new Uint8Array(glb, 20, jsonLen));
  return JSON.parse(json) as GlbDoc;
}

describe('runPart', () => {
  it('builds a shape and verifies it', async () => {
    const { report } = await runPart(fix('validBox.brep.ts'));
    expect(report.shapeType).toBe('Solid');
    expect(report.measurements.volume).toBeCloseTo(1000, 1);
  }, 30000);

  it('engraves text with the bundled fallback font when the part loads none', async () => {
    const { report } = await runPart(fix('engravedText.brep.ts'));
    expect(report.errors).toEqual([]);
    // 40 x 20 x 3 plate minus the 1 mm-deep "Pi 5" cut.
    expect(report.measurements.volume).toBeLessThan(2400);
    expect(report.measurements.volume).toBeGreaterThan(2300);
  }, 30000);

  it('flags a degenerate part deterministically', async () => {
    const { report } = await runPart(fix('degenerate.brep.ts'));
    const failed = report.errors.length + report.checks.filter((c) => !c.passed).length;
    expect(failed).toBeGreaterThan(0);
  }, 30000);

  it('emits a STEP buffer (primary artifact) for a valid shape', async () => {
    const { step } = await runPart(fix('validBox.brep.ts'), { step: true });
    expect(step).toBeInstanceOf(ArrayBuffer);
    expect((step as ArrayBuffer).byteLength).toBeGreaterThan(0);
    // CAD tools show the STEP product name as the model's root; name it after the part file.
    expect(new TextDecoder().decode(step)).toContain("PRODUCT('validBox'");
  }, 30000);

  it('names each solid of a multi-solid part in the STEP', async () => {
    const { step } = await runPart(fix('twoBoxes.brep.ts'), { step: true });
    const text = new TextDecoder().decode(step);
    expect(text).toContain("PRODUCT('twoBoxes-1'");
    expect(text).toContain("PRODUCT('twoBoxes-2'");
  }, 30000);

  it('keeps non-solid geometry in the STEP when a part mixes solids and a face', async () => {
    const { step } = await runPart(fix('boxesAndFace.brep.ts'), { step: true });
    const text = new TextDecoder().decode(step);
    expect(text).toContain("PRODUCT('boxesAndFace'");
    // 6 faces per box plus the free triangle.
    expect(text.match(/ADVANCED_FACE\(/g)?.length ?? 0).toBeGreaterThanOrEqual(13);
  }, 30000);

  it('emits a GLB buffer (derived preview) for a valid shape', async () => {
    const { glb } = await runPart(fix('validBox.brep.ts'), { glb: true });
    expect(glb).toBeInstanceOf(ArrayBuffer);
    expect((glb as ArrayBuffer).byteLength).toBeGreaterThan(0);
  }, 30000);

  it('colors the GLB from a part `export const materials` predicate', async () => {
    const { glb } = await runPart(fix('materialsBox.brep.ts'), { glb: true });
    const doc = parseGlbJson(glb as ArrayBuffer);
    // Two regions painted ⇒ two glTF materials.
    expect(doc.materials?.map((m) => m.name).sort()).toEqual(['white', 'wood']);
    // ...and the default Y-up root node is still present.
    const rotated = doc.nodes.filter((n) => n.rotation !== undefined);
    expect(rotated).toHaveLength(1);
    expect(rotated[0]?.rotation).toEqual([-Math.SQRT1_2, 0, 0, Math.SQRT1_2]);
  }, 30000);

  it('ignores a malformed `materials` export with a warning, not a crash', async () => {
    const { glb, report } = await runPart(fix('materialsBadShape.brep.ts'), { glb: true });
    expect(glb).toBeInstanceOf(ArrayBuffer);
    expect(report.errorInfos.some((e) => e.code === 'MATERIALS_IGNORED')).toBe(true);
  }, 30000);

  it('surfaces a FILLET_NO_EDGES hint with an actionable fix and next step', async () => {
    const { report } = await runPart(fix('filletNoEdges.brep.ts'));
    const hint = report.hints.find((h) => h.code === 'FILLET_NO_EDGES');
    expect(hint).toBeDefined();
    expect(hint?.fix).not.toBe('');
    expect(hint?.nextStep).not.toBe('');
    // The structured error info carried the public BrepError code through runPart.
    expect(report.errorInfos.some((e) => e.code === 'FILLET_NO_EDGES')).toBe(true);
  }, 30000);

  it('recovers the specific code from an unwrap()-thrown kernel error so its hint fires', async () => {
    const { report } = await runPart(fix('filletFailed.brep.ts'));
    expect(report.errors.length).toBeGreaterThan(0);
    // The FILLET_FAILED code arrived flattened inside the thrown Error message; runPart
    // recovers that exact code...
    expect(report.errorInfos.some((e) => e.code === 'FILLET_FAILED')).toBe(true);
    // ...so the matching hint fires instead of the table going dark.
    expect(report.hints.some((h) => h.code === 'FILLET_FAILED')).toBe(true);
  }, 30000);

  it('verifies the shape inside a fluent shape(...) chain', async () => {
    const { report } = await runPart(fix('fluentChain.brep.ts'));
    expect(report.errors).toEqual([]);
    expect(report.shapeType).toBe('Solid');
    expect(report.measurements.bounds?.xMin).toBeCloseTo(5, 6);
  }, 30000);

  it.each(['returnsSketch.brep.ts', 'returnsArray.brep.ts', 'returnsNullProtoObject.brep.ts'])(
    'reports PART_NOT_A_SHAPE instead of crashing when %s returns a non-shape',
    async (file) => {
      const { report, shape } = await runPart(fix(file));
      expect(shape).toBeNull();
      expect(reportOk(report)).toBe(false);
      expect(report.hints.some((h) => h.code === 'PART_NOT_A_SHAPE')).toBe(true);
    },
    30000
  );

  it('fails a part that returns a face instead of a solid', async () => {
    const { report } = await runPart(fix('returnsFace.brep.ts'));
    expect(report.shapeType).toBe('Face');
    expect(report.checks).toContainEqual(expect.objectContaining({ name: 'is3D', passed: false }));
    expect(reportOk(report)).toBe(false);
    expect(report.hints.some((h) => h.code === 'PART_NOT_3D')).toBe(true);
  }, 30000);

  it('surfaces an INVALID_FILLET_RADIUS hint for a negative radius', async () => {
    const { report } = await runPart(fix('invalidFilletRadius.brep.ts'));
    const hint = report.hints.find((h) => h.code === 'INVALID_FILLET_RADIUS');
    expect(hint).toBeDefined();
    expect(hint?.fix.length).toBeGreaterThan(0);
    expect(hint?.nextStep.length).toBeGreaterThan(0);
  }, 30000);
});

describe('runPart with declared parameters', () => {
  // The shape is a live kernel handle; these tests read the report only.
  const run = async (...args: Parameters<typeof runPart>) => {
    const result = await runPart(...args);
    result.shape?.[Symbol.dispose]();
    return result;
  };

  it('builds at the defaults and reports them', async () => {
    const { report } = await run(fix('paramBox.brep.ts'));
    expect(reportOk(report)).toBe(true);
    expect(report.params).toEqual({ width: 10, height: 10, label: 'a' });
    expect(report.measurements.volume).toBeCloseTo(1000, 1);
  }, 30000);

  it('builds with caller values, converted from strings', async () => {
    const { report } = await run(fix('paramBox.brep.ts'), {
      params: { width: '40', label: 'b' },
    });
    expect(reportOk(report)).toBe(true);
    expect(report.params).toEqual({ width: 40, height: 10, label: 'b' });
    expect(report.measurements.volume).toBeCloseTo(4000, 1);
  }, 30000);

  it('checks an expected function against the values in use', async () => {
    const { report } = await run(fix('paramBox.brep.ts'), { params: { width: 40 } });
    expect(report.assertions).toEqual([
      { name: 'volume', expected: 4000, actual: expect.closeTo(4000, 1) as number, passed: true },
    ]);
  }, 30000);

  it.each([
    ['a value outside its limits', { width: 500 }, 'PARAM_OUT_OF_RANGE'],
    ['a value of the wrong type', { width: 'wide' }, 'PARAM_INVALID_VALUE'],
    ['a name that is not declared', { depth: 5 }, 'PARAM_UNKNOWN'],
  ])(
    'does not build with %s',
    async (_case, params, code) => {
      const { report, shape } = await run(fix('paramBox.brep.ts'), { params });
      expect(shape).toBeNull();
      expect(reportOk(report)).toBe(false);
      expect(report.errorInfos.map((e) => e.code)).toEqual([code]);
      expect(report.errors[0]).toMatch(/^params: /);
    },
    30000
  );

  it('waits for an async expected function', async () => {
    const { report } = await run(fix('paramBoxAsyncExpected.brep.ts'));
    expect(report.assertions).toEqual([
      { name: 'volume', expected: 2000, actual: expect.closeTo(1000, 1) as number, passed: false },
    ]);
    expect(reportOk(report)).toBe(false);
  }, 30000);

  it('skips a fixed expected when a value is set, and says so', async () => {
    const { report } = await run(fix('paramBoxFixedExpected.brep.ts'), {
      params: { width: 20 },
    });
    expect(reportOk(report)).toBe(true);
    expect(report.assertions).toEqual([]);
    expect(report.notes?.join(' ')).toContain('expected was not checked');
  }, 30000);

  it('checks a fixed expected at the defaults', async () => {
    const { report } = await run(fix('paramBoxFixedExpected.brep.ts'));
    expect(report.assertions.map((a) => a.passed)).toEqual([true]);
  }, 30000);

  it('rejects a value for a part that declares no parameters', async () => {
    const { report, shape } = await run(fix('validBox.brep.ts'), { params: { width: 5 } });
    expect(shape).toBeNull();
    expect(report.errorInfos[0]?.code).toBe('PARAMS_NOT_DECLARED');
  }, 30000);

  it('leaves a part alone when its own params export is not a declaration', async () => {
    const { report } = await run(fix('ownParamsExport.brep.ts'));
    expect(reportOk(report)).toBe(true);
    expect(report.params).toBeUndefined();
  }, 30000);
});
