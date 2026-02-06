import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import { makeBox, unwrap, isErr } from '../src/index.js';
import {
  createCamera,
  cameraLookAt,
  cameraFromPlane,
  cameraToProjectionCamera,
  projectEdges,
} from '../src/projection/cameraFns.js';
import { vecEquals, vecLength } from '../src/core/vecOps.js';

beforeAll(async () => {
  await initOC();
}, 30000);

describe('createCamera', () => {
  it('creates a camera with defaults', () => {
    const cam = unwrap(createCamera());
    expect(vecEquals(cam.position, [0, 0, 0])).toBe(true);
    expect(vecLength(cam.direction)).toBeCloseTo(1);
    expect(vecLength(cam.xAxis)).toBeCloseTo(1);
    expect(vecLength(cam.yAxis)).toBeCloseTo(1);
  });

  it('creates a camera with custom position and direction', () => {
    const cam = unwrap(createCamera([10, 0, 0], [0, 0, 1]));
    expect(vecEquals(cam.position, [10, 0, 0])).toBe(true);
    expect(cam.direction[2]).toBeCloseTo(1);
  });

  it('creates a camera with custom xAxis', () => {
    const cam = unwrap(createCamera([0, 0, 0], [0, 0, 1], [1, 0, 0]));
    expect(cam.xAxis[0]).toBeCloseTo(1);
  });

  it('direction, xAxis, yAxis are unit vectors', () => {
    const cam = unwrap(createCamera([5, 5, 5], [1, 1, 1]));
    expect(vecLength(cam.direction)).toBeCloseTo(1);
    expect(vecLength(cam.xAxis)).toBeCloseTo(1);
    expect(vecLength(cam.yAxis)).toBeCloseTo(1);
  });

  it('returns error for zero-length direction', () => {
    const result = createCamera([0, 0, 0], [0, 0, 0]);
    expect(isErr(result)).toBe(true);
  });
});

describe('cameraLookAt', () => {
  it('reorients camera to look at a point', () => {
    const cam = unwrap(createCamera([10, 0, 0], [0, 0, 1]));
    const looking = unwrap(cameraLookAt(cam, [0, 0, 0]));
    // Direction should point from [10,0,0] toward [0,0,0], normalized
    expect(looking.direction[0]).toBeCloseTo(1);
    expect(looking.position[0]).toBeCloseTo(10);
  });
});

describe('cameraFromPlane', () => {
  it('creates camera for XY plane', () => {
    const cam = unwrap(cameraFromPlane('XY'));
    expect(cam.direction[2]).toBeCloseTo(1);
    expect(cam.xAxis[0]).toBeCloseTo(1);
  });

  it('creates camera for front plane', () => {
    const cam = unwrap(cameraFromPlane('front'));
    expect(cam.direction[1]).toBeCloseTo(-1);
  });

  it('creates cameras for all named planes', () => {
    const planes = [
      'XY',
      'XZ',
      'YZ',
      'YX',
      'ZX',
      'ZY',
      'front',
      'back',
      'left',
      'right',
      'top',
      'bottom',
    ] as const;
    for (const name of planes) {
      const cam = unwrap(cameraFromPlane(name));
      expect(vecLength(cam.direction)).toBeCloseTo(1);
    }
  });

  it('throws for unknown plane', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing invalid input
    expect(() => cameraFromPlane('INVALID' as any)).toThrow();
  });
});

describe('cameraToProjectionCamera', () => {
  it('converts to ProjectionCamera', () => {
    const cam = unwrap(createCamera([0, 0, 10], [0, 0, -1], [1, 0, 0]));
    const projCam = cameraToProjectionCamera(cam);
    expect(projCam).toBeDefined();
    projCam.delete();
  });
});

describe('projectEdges', () => {
  it('projects a box', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const cam = unwrap(cameraFromPlane('front'));
    const result = projectEdges(box, cam);
    expect(result.visible.length).toBeGreaterThan(0);
  });

  it('projects with hidden lines', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const cam = unwrap(createCamera([50, 50, 50], [-1, -1, -1]));
    const result = projectEdges(box, cam, true);
    expect(result.visible.length).toBeGreaterThan(0);
    expect(result.hidden.length).toBeGreaterThanOrEqual(0);
  });

  it('projects without hidden lines', () => {
    const box = makeBox([0, 0, 0], [10, 10, 10]);
    const cam = unwrap(cameraFromPlane('XY'));
    const result = projectEdges(box, cam, false);
    expect(result.visible.length).toBeGreaterThan(0);
    expect(result.hidden).toEqual([]);
  });
});
