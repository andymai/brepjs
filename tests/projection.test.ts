import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  makeBox,
  ProjectionCamera,
  lookFromPlane,
  isProjectionPlane,
  makeProjectedEdges,
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

describe('lookFromPlane', () => {
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
      const cam = lookFromPlane(p);
      expect(cam).toBeDefined();
      expect(cam.direction).toBeDefined();
      expect(cam.xAxis).toBeDefined();
      expect(cam.yAxis).toBeDefined();
    }
  });

  it('front camera looks along -Y', () => {
    const cam = lookFromPlane('front');
    const dir = cam.direction;
    expect(Math.abs(dir.x)).toBeLessThan(1e-9);
    expect(dir.y).toBeCloseTo(-1);
    expect(Math.abs(dir.z)).toBeLessThan(1e-9);
  });

  it('top camera looks along -Z', () => {
    const cam = lookFromPlane('top');
    const dir = cam.direction;
    expect(Math.abs(dir.x)).toBeLessThan(1e-9);
    expect(Math.abs(dir.y)).toBeLessThan(1e-9);
    expect(dir.z).toBeCloseTo(-1);
  });
});

describe('ProjectionCamera', () => {
  it('creates with default parameters', () => {
    const cam = new ProjectionCamera();
    expect(cam.position).toBeDefined();
    expect(cam.direction).toBeDefined();
  });

  it('creates with position and direction', () => {
    const cam = new ProjectionCamera([10, 20, 30], [0, 0, 1]);
    const pos = cam.position;
    expect(pos.x).toBeCloseTo(10);
    expect(pos.y).toBeCloseTo(20);
    expect(pos.z).toBeCloseTo(30);
  });

  it('creates with custom xAxis', () => {
    const cam = new ProjectionCamera([0, 0, 0], [0, 0, 1], [1, 0, 0]);
    const xAxis = cam.xAxis;
    expect(xAxis.x).toBeCloseTo(1);
    expect(Math.abs(xAxis.y)).toBeLessThan(1e-9);
    expect(Math.abs(xAxis.z)).toBeLessThan(1e-9);
  });

  it('auto-computes xAxis when not provided', () => {
    const cam = new ProjectionCamera([0, 0, 0], [0, 1, 0]);
    const xAxis = cam.xAxis;
    const dot = xAxis.x * 0 + xAxis.y * 1 + xAxis.z * 0;
    expect(Math.abs(dot)).toBeLessThan(1e-9);
  });

  it('auto-computes xAxis for Z direction', () => {
    const cam = new ProjectionCamera([0, 0, 0], [0, 0, 1]);
    const xAxis = cam.xAxis;
    const dot = xAxis.x * 0 + xAxis.y * 0 + xAxis.z * 1;
    expect(Math.abs(dot)).toBeLessThan(1e-9);
  });

  it('setPosition changes position', () => {
    const cam = new ProjectionCamera();
    cam.setPosition([5, 10, 15]);
    const pos = cam.position;
    expect(pos.x).toBeCloseTo(5);
    expect(pos.y).toBeCloseTo(10);
    expect(pos.z).toBeCloseTo(15);
  });

  it('setPosition returns this for chaining', () => {
    const cam = new ProjectionCamera();
    const result = cam.setPosition([1, 2, 3]);
    expect(result).toBe(cam);
  });

  it('setXAxis changes x axis', () => {
    const cam = new ProjectionCamera([0, 0, 0], [0, 0, 1]);
    cam.setXAxis([0, 1, 0]);
    expect(cam.xAxis.y).toBeCloseTo(1);
  });

  it('setYAxis changes y axis', () => {
    const cam = new ProjectionCamera([0, 0, 0], [0, 0, 1]);
    cam.setYAxis([1, 0, 0]);
    expect(cam.yAxis.x).toBeCloseTo(1);
  });

  it('autoAxes sets perpendicular axes', () => {
    const cam = new ProjectionCamera([0, 0, 0], [0, 0, 1], [1, 0, 0]);
    cam.autoAxes();
    const xAxis = cam.xAxis;
    const dir = cam.direction;
    const dot = xAxis.x * dir.x + xAxis.y * dir.y + xAxis.z * dir.z;
    expect(Math.abs(dot)).toBeLessThan(1e-9);
  });

  it('lookAt a point', () => {
    const cam = new ProjectionCamera([10, 0, 0], [0, 0, 1]);
    cam.lookAt([0, 0, 0]);
    const dir = cam.direction;
    expect(dir.x).toBeCloseTo(1);
    expect(Math.abs(dir.y)).toBeLessThan(1e-9);
    expect(Math.abs(dir.z)).toBeLessThan(1e-9);
  });

  it('lookAt a shape with boundingBox', () => {
    const box = makeBox([10, 10, 10]);
    const cam = new ProjectionCamera([100, 0, 0], [0, 0, 1]);
    cam.lookAt(box);
    const dir = cam.direction;
    expect(dir.x).toBeGreaterThan(0.9);
  });

  it('lookAt returns this for chaining', () => {
    const cam = new ProjectionCamera([10, 0, 0], [0, 0, 1]);
    const result = cam.lookAt([0, 0, 0]);
    expect(result).toBe(cam);
  });
});

describe('makeProjectedEdges', () => {
  it('projects a box from front', () => {
    const box = makeBox([10, 10, 10]);
    const cam = lookFromPlane('front');
    const result = makeProjectedEdges(box, cam);
    expect(result.visible).toBeDefined();
    expect(result.hidden).toBeDefined();
    expect(result.visible.length).toBeGreaterThan(0);
  });

  it('projects a box from top', () => {
    const box = makeBox([10, 10, 10]);
    const cam = lookFromPlane('top');
    const result = makeProjectedEdges(box, cam);
    expect(result.visible.length).toBeGreaterThan(0);
  });

  it('without hidden lines', () => {
    const box = makeBox([10, 10, 10]);
    const cam = lookFromPlane('front');
    const result = makeProjectedEdges(box, cam, false);
    expect(result.visible.length).toBeGreaterThan(0);
    expect(result.hidden.length).toBe(0);
  });

  it('with hidden lines', () => {
    const box = makeBox([10, 10, 10]);
    const cam = lookFromPlane('front');
    const result = makeProjectedEdges(box, cam, true);
    expect(result.visible.length).toBeGreaterThan(0);
    expect(result.hidden.length).toBeGreaterThan(0);
  });

  it('projects with custom camera', () => {
    const box = makeBox([10, 10, 10]);
    const cam = new ProjectionCamera([50, 50, 50], [-1, -1, -1]);
    const result = makeProjectedEdges(box, cam);
    expect(result.visible.length).toBeGreaterThan(0);
  });

  it('projects from all standard planes', () => {
    const box = makeBox([10, 10, 10]);
    const planes = ['XY', 'XZ', 'YZ', 'front', 'back', 'top', 'bottom', 'left', 'right'] as const;
    for (const p of planes) {
      const cam = lookFromPlane(p);
      const result = makeProjectedEdges(box, cam);
      expect(result.visible.length).toBeGreaterThan(0);
    }
  });
});
