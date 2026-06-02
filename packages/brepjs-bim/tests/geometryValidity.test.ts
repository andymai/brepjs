import { describe, it, expect, beforeAll } from 'vitest';
import { box, scale } from 'brepjs';
import { initOCCT } from '../../../tests/setup.js';
import { checkGeometryValidity } from '../src/validation/geometryValidity.js';

beforeAll(async () => {
  await initOCCT();
}, 30000);

describe('checkGeometryValidity', () => {
  it('passes a valid box with no error issues', () => {
    const solid = box(1000, 500, 300);
    const report = checkGeometryValidity(solid, 'Box 1');
    const errors = report.issues.filter((i) => i.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('accepts a list of valid solids', () => {
    const a = box(1000, 500, 300);
    const b = box(200, 200, 200);
    const report = checkGeometryValidity([a, b]);
    const errors = report.issues.filter((i) => i.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('reports a ZERO_VOLUME error for a degenerate near-zero-volume solid', () => {
    // Uniformly scaling a valid box by a tiny factor keeps the topology valid
    // (isValid passes) while collapsing the volume to ~1e-13 mm³ — a degenerate
    // solid that carries no usable geometry for IFC export.
    const degenerate = scale(box(1000, 500, 300), 1e-7);
    const report = checkGeometryValidity(degenerate, 'Flat 1');
    const errors = report.issues.filter((i) => i.severity === 'error');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((i) => i.code === 'ZERO_VOLUME')).toBe(true);
  });

  it('attaches the supplied entity label to issues', () => {
    const degenerate = scale(box(1000, 500, 300), 1e-7);
    const report = checkGeometryValidity(degenerate, 'My Element');
    const errors = report.issues.filter((i) => i.severity === 'error');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every((i) => i.entity === 'My Element')).toBe(true);
  });

  it('indexes labels when validating a list of more than one solid', () => {
    const good = box(1000, 500, 300);
    const degenerate = scale(box(1000, 500, 300), 1e-7);
    const report = checkGeometryValidity([good, degenerate], 'Wall');
    const errors = report.issues.filter((i) => i.severity === 'error');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every((i) => i.entity === 'Wall [1]')).toBe(true);
  });
});
