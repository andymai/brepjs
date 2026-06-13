import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { runPart } from '@/verify/runPart.js';

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

  it('flags a degenerate part deterministically', async () => {
    const { report } = await runPart(fix('degenerate.brep.ts'));
    const failed = report.errors.length + report.checks.filter((c) => !c.passed).length;
    expect(failed).toBeGreaterThan(0);
  }, 30000);

  it('emits a STEP buffer (primary artifact) for a valid shape', async () => {
    const { step } = await runPart(fix('validBox.brep.ts'), { step: true });
    expect(step).toBeInstanceOf(ArrayBuffer);
    expect((step as ArrayBuffer).byteLength).toBeGreaterThan(0);
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

  it('surfaces an INVALID_FILLET_RADIUS hint for a negative radius', async () => {
    const { report } = await runPart(fix('invalidFilletRadius.brep.ts'));
    const hint = report.hints.find((h) => h.code === 'INVALID_FILLET_RADIUS');
    expect(hint).toBeDefined();
    expect(hint?.fix.length).toBeGreaterThan(0);
    expect(hint?.nextStep.length).toBeGreaterThan(0);
  }, 30000);
});
