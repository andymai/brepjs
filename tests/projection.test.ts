import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  box,
  isProjectionPlane,
  makeProjectedEdges,
  unwrap as _unwrap,
  createCamera,
  cameraFromPlane,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('isProjectionPlane', () => {
  it('returns true for valid projection planes', () => {
    const planes = [
      'XY',
      'XZ',
      'YZ',
      'YX',
      'ZX',
      'ZY',
      'front',
      'back',
      'top',
      'bottom',
      'left',
      'right',
    ];
    for (const p of planes) {
      expect(isProjectionPlane(p)).toBe(true);
    }
  });

  it('returns false for invalid strings', () => {
    expect(isProjectionPlane('invalid')).toBe(false);
    expect(isProjectionPlane('xy')).toBe(false);
  });

  it('returns false for non-strings', () => {
    expect(isProjectionPlane(42)).toBe(false);
    expect(isProjectionPlane(null)).toBe(false);
    expect(isProjectionPlane(undefined)).toBe(false);
  });
});

describe('cameraFromPlane', () => {
  it('creates camera for each valid plane', () => {
    const planes = [
      'XY',
      'XZ',
      'YZ',
      'YX',
      'ZX',
      'ZY',
      'front',
      'back',
      'top',
      'bottom',
      'left',
      'right',
    ] as const;
    for (const p of planes) {
      const cam = unwrap(cameraFromPlane(p));
      expect(cam).toBeDefined();
      expect(cam.direction).toBeDefined();
      expect(cam.xAxis).toBeDefined();
      expect(cam.yAxis).toBeDefined();
    }
  });

  it('front camera looks along -Y', () => {
    const cam = unwrap(cameraFromPlane('front'));
    const dir = cam.direction;
    expect(Math.abs(dir[0])).toBeLessThan(1e-9);
    expect(dir[1]).toBeCloseTo(-1);
    expect(Math.abs(dir[2])).toBeLessThan(1e-9);
  });

  it('top camera looks along -Z', () => {
    const cam = unwrap(cameraFromPlane('top'));
    const dir = cam.direction;
    expect(Math.abs(dir[0])).toBeLessThan(1e-9);
    expect(Math.abs(dir[1])).toBeLessThan(1e-9);
    expect(dir[2]).toBeCloseTo(-1);
  });
});

describe('createCamera', () => {
  it('creates with default parameters', () => {
    const cam = unwrap(createCamera());
    expect(cam.position).toBeDefined();
    expect(cam.direction).toBeDefined();
  });

  it('creates with position and direction', () => {
    const cam = unwrap(createCamera([10, 20, 30], [0, 0, 1]));
    const pos = cam.position;
    expect(pos[0]).toBeCloseTo(10);
    expect(pos[1]).toBeCloseTo(20);
    expect(pos[2]).toBeCloseTo(30);
  });

  it('creates with custom xAxis', () => {
    const cam = unwrap(createCamera([0, 0, 0], [0, 0, 1], [1, 0, 0]));
    const xAxis = cam.xAxis;
    expect(xAxis[0]).toBeCloseTo(1);
    expect(Math.abs(xAxis[1])).toBeLessThan(1e-9);
    expect(Math.abs(xAxis[2])).toBeLessThan(1e-9);
  });

  it('auto-computes xAxis when not provided', () => {
    const cam = unwrap(createCamera([0, 0, 0], [0, 1, 0]));
    const xAxis = cam.xAxis;
    const dot = xAxis[0] * 0 + xAxis[1] * 1 + xAxis[2] * 0;
    expect(Math.abs(dot)).toBeLessThan(1e-9);
  });

  it('auto-computes xAxis for Z direction', () => {
    const cam = unwrap(createCamera([0, 0, 0], [0, 0, 1]));
    const xAxis = cam.xAxis;
    const dot = xAxis[0] * 0 + xAxis[1] * 0 + xAxis[2] * 1;
    expect(Math.abs(dot)).toBeLessThan(1e-9);
  });
});

describe('makeProjectedEdges', () => {
  it('projects a box from front', () => {
    const b = box(10, 10, 10);
    const cam = unwrap(cameraFromPlane('front'));
    const result = makeProjectedEdges(b, cam);
    expect(result.visible).toBeDefined();
    expect(result.hidden).toBeDefined();
    expect(result.visible.length).toBeGreaterThan(0);
  });

  it('projects a box from top', () => {
    const b = box(10, 10, 10);
    const cam = unwrap(cameraFromPlane('top'));
    const result = makeProjectedEdges(b, cam);
    expect(result.visible.length).toBeGreaterThan(0);
  });

  it('without hidden lines', () => {
    const b = box(10, 10, 10);
    const cam = unwrap(cameraFromPlane('front'));
    const result = makeProjectedEdges(b, cam, false);
    expect(result.visible.length).toBeGreaterThan(0);
    expect(result.hidden.length).toBe(0);
  });

  it('with hidden lines', () => {
    const b = box(10, 10, 10);
    const cam = unwrap(cameraFromPlane('front'));
    const result = makeProjectedEdges(b, cam, true);
    expect(result.visible.length).toBeGreaterThan(0);
    expect(result.hidden.length).toBeGreaterThan(0);
  });

  it('projects with custom camera', () => {
    const b = box(10, 10, 10);
    const cam = unwrap(createCamera([50, 50, 50], [-1, -1, -1]));
    const result = makeProjectedEdges(b, cam);
    expect(result.visible.length).toBeGreaterThan(0);
  });

  it('projects from all standard planes', () => {
    const b = box(10, 10, 10);
    const planes = ['XY', 'XZ', 'YZ', 'front', 'back', 'top', 'bottom', 'left', 'right'] as const;
    for (const p of planes) {
      const cam = unwrap(cameraFromPlane(p));
      const result = makeProjectedEdges(b, cam);
      expect(result.visible.length).toBeGreaterThan(0);
    }
  });
});
