import { describe, it, expect, beforeAll } from 'vitest';
import { initOCCT } from '../../../tests/setup.js';
import { unfold } from '../src/unfoldFns.js';
import { flatPatternToDXF } from '../src/dxfFns.js';
import type { BendRule, FlatPattern, SheetMetalPart } from '../src/types.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

function rule(kFactor: number, innerRadius: number): BendRule {
  return { innerRadius, kFactor };
}

function makePart(direction: 'up' | 'down'): SheetMetalPart {
  return {
    thickness: 1.0,
    baseLength: 30,
    width: 20,
    flanges: [
      {
        id: 'flange-1',
        baseEdge: { kind: 'index', faceIndex: 0, edgeIndex: 0 },
        length: 20,
        span: 20,
        angleDeg: 90,
        rule: rule(0.44, 1.0),
      },
    ],
    bends: [
      {
        id: 'flange-1',
        axisOrigin: [0, 0, 0],
        axisDir: [0, 1, 0],
        angleDeg: 90,
        direction,
        rule: rule(0.44, 1.0),
      },
    ],
  };
}

function unfoldPattern(direction: 'up' | 'down'): FlatPattern {
  const result = unfold(makePart(direction));
  if (!result.ok) throw new Error('unfold failed');
  return result.value.pattern;
}

describe('flatPatternToDXF — structure', () => {
  it('emits the required SECTIONs and EOF', () => {
    const r = flatPatternToDXF(unfoldPattern('up'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const dxf = r.value;
    expect(dxf).toContain('SECTION');
    expect(dxf).toContain('HEADER');
    expect(dxf).toContain('TABLES');
    expect(dxf).toContain('ENTITIES');
    expect(dxf).toContain('ENDSEC');
    expect(dxf.trimEnd().endsWith('EOF')).toBe(true);
  });

  it('sets INSUNITS=4 (mm) in the header', () => {
    const r = flatPatternToDXF(unfoldPattern('up'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toContain('$INSUNITS');
    const lines = r.value.split('\n');
    const idx = lines.indexOf('$INSUNITS');
    expect(idx).toBeGreaterThan(-1);
    expect(lines[idx + 2]).toBe('4');
  });

  it('declares the three layers OUTLINE / BEND_UP / BEND_DOWN', () => {
    const r = flatPatternToDXF(unfoldPattern('up'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toContain('OUTLINE');
    expect(r.value).toContain('BEND_UP');
    expect(r.value).toContain('BEND_DOWN');
  });

  it('LAYER table entry count matches the 3 layers written', () => {
    const r = flatPatternToDXF(unfoldPattern('up'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const lines = r.value.split('\n');
    const symIdx = lines.indexOf('AcDbSymbolTable');
    expect(lines[symIdx + 1]).toBe('70');
    expect(lines[symIdx + 2]).toBe('3');
  });

  it('is R2000-conformant: $HANDSEED + AcDb subclass markers on every entity', () => {
    const r = flatPatternToDXF(unfoldPattern('up'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toContain('$HANDSEED');
    expect(r.value).toContain('AcDbEntity');
    expect(r.value).toContain('AcDbPolyline');
    expect(r.value).toContain('AcDbLine');
    expect(r.value).toContain('AcDbMText');
    // MTEXT reference rectangle width (group 41) so readers size the text box
    const lines = r.value.split('\n');
    const mtextIdx = lines.indexOf('MTEXT');
    expect(lines.indexOf('41', mtextIdx)).toBeGreaterThan(-1);
  });
});

describe('flatPatternToDXF — entities', () => {
  it('emits a closed outline polyline with all corner vertices', () => {
    const r = flatPatternToDXF(unfoldPattern('up'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toContain('LWPOLYLINE');
    const lines = r.value.split('\n');
    const idx = lines.indexOf('LWPOLYLINE');
    const vertexCountIdx = lines.indexOf('90', idx);
    expect(lines[vertexCountIdx + 1]).toBe('4');
  });

  it('emits a LINE and an MTEXT annotation per bend line', () => {
    const pattern = unfoldPattern('up');
    expect(pattern.bendLines).toHaveLength(1);
    const r = flatPatternToDXF(pattern);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toContain('LINE');
    expect(r.value).toContain('MTEXT');
    expect(r.value).toContain('∠90° U');
  });

  it('routes up bends to BEND_UP and annotates with U', () => {
    const r = flatPatternToDXF(unfoldPattern('up'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const lines = r.value.split('\n');
    const subIdx = lines.indexOf('AcDbLine');
    expect(lines[subIdx - 2]).toBe('BEND_UP');
    expect(r.value).toContain('∠90° U');
    expect(r.value).not.toContain('∠90° D');
  });

  it('routes down bends to BEND_DOWN and annotates with D', () => {
    const r = flatPatternToDXF(unfoldPattern('down'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const lines = r.value.split('\n');
    const subIdx = lines.indexOf('AcDbLine');
    expect(lines[subIdx - 2]).toBe('BEND_DOWN');
    expect(r.value).toContain('∠90° D');
  });
});

describe('flatPatternToDXF — validation', () => {
  it('rejects a non-positive text height', () => {
    const r = flatPatternToDXF(unfoldPattern('up'), { textHeight: 0 });
    expect(r.ok).toBe(false);
  });

  it('honors a custom text height on MTEXT', () => {
    const r = flatPatternToDXF(unfoldPattern('up'), { textHeight: 3.5 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const lines = r.value.split('\n');
    const mtextIdx = lines.indexOf('MTEXT');
    const heightCodeIdx = lines.indexOf('40', mtextIdx);
    expect(lines[heightCodeIdx + 1]).toBe('3.5');
  });
});
