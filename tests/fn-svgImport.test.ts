import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { importSVGPathD, importSVG } from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('importSVGPathD', () => {
  it('parses a simple rectangle', () => {
    const result = importSVGPathD('M 0 0 L 10 0 L 10 10 L 0 10 Z');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 4 line segments (3 L commands + 1 Z close)
    expect(result.value.curves).toHaveLength(4);
  });

  it('parses relative line commands', () => {
    const result = importSVGPathD('M 0 0 l 10 0 l 0 10 l -10 0 z');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.curves).toHaveLength(4);
  });

  it('parses H and V commands', () => {
    const result = importSVGPathD('M 0 0 H 10 V 10 H 0 Z');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.curves).toHaveLength(4);
  });

  it('parses relative h and v commands', () => {
    const result = importSVGPathD('M 0 0 h 10 v 10 h -10 z');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.curves).toHaveLength(4);
  });

  it('parses cubic bezier (C command)', () => {
    const result = importSVGPathD('M 0 0 C 10 0 10 10 0 10');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.curves).toHaveLength(1);
  });

  it('parses smooth cubic bezier (S command)', () => {
    const result = importSVGPathD('M 0 0 C 5 0 10 5 10 10 S 15 20 20 20');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.curves).toHaveLength(2);
  });

  it('parses quadratic bezier (Q command)', () => {
    const result = importSVGPathD('M 0 0 Q 10 5 20 0');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.curves).toHaveLength(1);
  });

  it('parses smooth quadratic bezier (T command)', () => {
    const result = importSVGPathD('M 0 0 Q 10 5 20 0 T 40 0');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.curves).toHaveLength(2);
  });

  it('parses arc command (A)', () => {
    const result = importSVGPathD('M 10 80 A 25 25 0 0 1 50 80');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.curves).toHaveLength(1);
  });

  it('handles degenerate arc (zero radius) as line', () => {
    const result = importSVGPathD('M 0 0 A 0 0 0 0 1 10 10');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.curves).toHaveLength(1);
  });

  it('parses implicit L after M', () => {
    // After first M pair, additional pairs are treated as L
    const result = importSVGPathD('M 0 0 10 0 10 10 0 10 Z');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.curves).toHaveLength(4);
  });

  it('returns error for empty path', () => {
    const result = importSVGPathD('');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('SVG_EMPTY_PATH');
  });

  it('flips Y axis (SVG Y-down to brepjs Y-up)', () => {
    const result = importSVGPathD('M 0 0 L 10 5');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The endpoint should have negated Y
    const curve = result.value.curves[0];
    expect(curve).toBeDefined();
    // First point: [0, 0] → [0, -0] = [0, 0]
    // End point: [10, 5] → [10, -5]
    const lastPoint = curve!.lastPoint;
    expect(lastPoint[0]).toBeCloseTo(10);
    expect(lastPoint[1]).toBeCloseTo(-5);
  });
});

describe('importSVG', () => {
  it('extracts paths from SVG string', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <path d="M 0 0 L 10 0 L 10 10 Z" />
      <path d="M 20 20 L 30 20 L 30 30 Z" />
    </svg>`;
    const result = importSVG(svg);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(2);
  });

  it('handles single-quoted d attributes', () => {
    const svg = `<svg><path d='M 0 0 L 10 0 L 10 10 Z' /></svg>`;
    const result = importSVG(svg);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
  });

  it('returns error for SVG with no paths', () => {
    const svg = `<svg><rect width="10" height="10" /></svg>`;
    const result = importSVG(svg);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('SVG_NO_PATHS');
  });

  it('skips paths that produce no curves', () => {
    // One valid path, one invalid empty path
    const svg = `<svg>
      <path d="M 0 0 L 10 0 L 10 10 Z" />
      <path d="" />
    </svg>`;
    const result = importSVG(svg);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
  });
});
