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
    expect(Math.abs(dir[0])).toBeLessThan(1e-9);
    expect(dir[1]).toBeCloseTo(-1);
    expect(Math.abs(dir[2])).toBeLessThan(1e-9);
  });

  it('top camera looks along -Z', () => {
    const cam = lookFromPlane('top');
    const dir = cam.direction;
    expect(Math.abs(dir[0])).toBeLessThan(1e-9);
    expect(Math.abs(dir[1])).toBeLessThan(1e-9);
    expect(dir[2]).toBeCloseTo(-1);
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
    expect(pos[0]).toBeCloseTo(10);
    expect(pos[1]).toBeCloseTo(20);
    expect(pos[2]).toBeCloseTo(30);
  });

  it('creates with custom xAxis', () => {
    const cam = new ProjectionCamera([0, 0, 0], [0, 0, 1], [1, 0, 0]);
    const xAxis = cam.xAxis;
    expect(xAxis[0]).toBeCloseTo(1);
    expect(Math.abs(xAxis[1])).toBeLessThan(1e-9);
    expect(Math.abs(xAxis[2])).toBeLessThan(1e-9);
  });

  it('auto-computes xAxis when not provided', () => {
    const cam = new ProjectionCamera([0, 0, 0], [0, 1, 0]);
    const xAxis = cam.xAxis;
    const dot = xAxis[0] * 0 + xAxis[1] * 1 + xAxis[2] * 0;
    expect(Math.abs(dot)).toBeLessThan(1e-9);
  });

  it('auto-computes xAxis for Z direction', () => {
    const cam = new ProjectionCamera([0, 0, 0], [0, 0, 1]);
    const xAxis = cam.xAxis;
    const dot = xAxis[0] * 0 + xAxis[1] * 0 + xAxis[2] * 1;
    expect(Math.abs(dot)).toBeLessThan(1e-9);
  });

  it('setPosition changes position', () => {
    const cam = new ProjectionCamera();
    cam.setPosition([5, 10, 15]);
    const pos = cam.position;
    expect(pos[0]).toBeCloseTo(5);
    expect(pos[1]).toBeCloseTo(10);
    expect(pos[2]).toBeCloseTo(15);
  });

  it('setPosition returns this for chaining', () => {
    const cam = new ProjectionCamera();
    const result = cam.setPosition([1, 2, 3]);
    expect(result).toBe(cam);
  });

  it('setXAxis changes x axis', () => {
    const cam = new ProjectionCamera([0, 0, 0], [0, 0, 1]);
    cam.setXAxis([0, 1, 0]);
    expect(cam.xAxis[1]).toBeCloseTo(1);
  });

  it('setYAxis changes y axis', () => {
    const cam = new ProjectionCamera([0, 0, 0], [0, 0, 1]);
    cam.setYAxis([1, 0, 0]);
    expect(cam.yAxis[0]).toBeCloseTo(1);
  });

  it('autoAxes sets perpendicular axes', () => {
    const cam = new ProjectionCamera([0, 0, 0], [0, 0, 1], [1, 0, 0]);
    cam.autoAxes();
    const xAxis = cam.xAxis;
    const dir = cam.direction;
    const dot = xAxis[0] * dir[0] + xAxis[1] * dir[1] + xAxis[2] * dir[2];
    expect(Math.abs(dot)).toBeLessThan(1e-9);
  });

  it('lookAt a point', () => {
    const cam = new ProjectionCamera([10, 0, 0], [0, 0, 1]);
    cam.lookAt([0, 0, 0]);
    const dir = cam.direction;
    expect(dir[0]).toBeCloseTo(1);
    expect(Math.abs(dir[1])).toBeLessThan(1e-9);
    expect(Math.abs(dir[2])).toBeLessThan(1e-9);
  });

  it('lookAt a shape with boundingBox', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const cam = new ProjectionCamera([100, 0, 0], [0, 0, 1]);
    cam.lookAt(box);
    const dir = cam.direction;
    expect(dir[0]).toBeGreaterThan(0.9);
  });

  it('lookAt returns this for chaining', () => {
    const cam = new ProjectionCamera([10, 0, 0], [0, 0, 1]);
    const result = cam.lookAt([0, 0, 0]);
    expect(result).toBe(cam);
  });
});

describe('makeProjectedEdges', () => {
  it('projects a box from front', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const cam = lookFromPlane('front');
    const result = makeProjectedEdges(box, cam);
    expect(result.visible).toBeDefined();
    expect(result.hidden).toBeDefined();
    expect(result.visible.length).toBeGreaterThan(0);
  });

  it('projects a box from top', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const cam = lookFromPlane('top');
    const result = makeProjectedEdges(box, cam);
    expect(result.visible.length).toBeGreaterThan(0);
  });

  it('without hidden lines', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const cam = lookFromPlane('front');
    const result = makeProjectedEdges(box, cam, false);
    expect(result.visible.length).toBeGreaterThan(0);
    expect(result.hidden.length).toBe(0);
  });

  it('with hidden lines', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const cam = lookFromPlane('front');
    const result = makeProjectedEdges(box, cam, true);
    expect(result.visible.length).toBeGreaterThan(0);
    expect(result.hidden.length).toBeGreaterThan(0);
  });

  it('projects with custom camera', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const cam = new ProjectionCamera([50, 50, 50], [-1, -1, -1]);
    const result = makeProjectedEdges(box, cam);
    expect(result.visible.length).toBeGreaterThan(0);
  });

  it('projects from all standard planes', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const planes = ['XY', 'XZ', 'YZ', 'front', 'back', 'top', 'bottom', 'left', 'right'] as const;
    for (const p of planes) {
      const cam = lookFromPlane(p);
      const result = makeProjectedEdges(box, cam);
      expect(result.visible.length).toBeGreaterThan(0);
    }
  });
});
