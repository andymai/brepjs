import type { KernelPrimitiveOps } from '@/kernel/interfaces/primitiveOps.js';
import type { ManifoldModule } from './helpers.js';
import { notImplemented } from './helpers.js';
import { makeNode } from './opGraph.js';
import { wrap } from './meshHandle.js';

type Vec3 = [number, number, number];

const ORIGIN: Vec3 = [0, 0, 0];
const Z_AXIS: Vec3 = [0, 0, 1];

function magnitude(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function normalize(v: Vec3): Vec3 {
  const len = magnitude(v);
  if (len === 0) return [...Z_AXIS];
  return [v[0] / len, v[1] / len, v[2] / len];
}

// Rotation (deg) that takes +Z onto `direction`, in Manifold's z-y'-x'' order.
function rotationToDirection(direction: Vec3): Vec3 {
  const [x, y, z] = normalize(direction);
  const pitch = Math.atan2(Math.hypot(x, y), z) * (180 / Math.PI);
  const yaw = Math.atan2(y, x) * (180 / Math.PI);
  return [0, pitch, yaw];
}

export function makePrimitiveOps(module: ManifoldModule): KernelPrimitiveOps {
  const Manifold = module.Manifold;

  // Place an axis-aligned solid built along +Z at `center` oriented toward `direction`.
  function orient(solid: unknown, center: Vec3, direction: Vec3): unknown {
    let placed = solid as { rotate(r: Vec3): unknown; translate(t: Vec3): unknown };
    const isAligned = direction[0] === 0 && direction[1] === 0 && direction[2] > 0;
    if (!isAligned) {
      placed = placed.rotate(rotationToDirection(direction)) as typeof placed;
    }
    if (center[0] !== 0 || center[1] !== 0 || center[2] !== 0) {
      placed = placed.translate(center) as typeof placed;
    }
    return placed;
  }

  return {
    makeBox: (width, height, depth) => {
      const solid = Manifold.cube([width, height, depth] as Vec3, false);
      return wrap(solid, makeNode('makeBox', { width, height, depth }, []));
    },

    makeBoxFromCorners: (p1, p2) => {
      const size: Vec3 = [
        Math.abs(p2[0] - p1[0]),
        Math.abs(p2[1] - p1[1]),
        Math.abs(p2[2] - p1[2]),
      ];
      const min: Vec3 = [Math.min(p1[0], p2[0]), Math.min(p1[1], p2[1]), Math.min(p1[2], p2[2])];
      const solid = Manifold.cube(size, false).translate(min);
      return wrap(solid, makeNode('makeBoxWithCorners', { p1, p2 }, []));
    },

    makeCylinder: (radius, height, center = ORIGIN, direction = Z_AXIS) => {
      const base = Manifold.cylinder(height, radius, radius, 0, false);
      const solid = orient(base, center, direction);
      return wrap(solid, makeNode('makeCylinder', { radius, height, center, direction }, []));
    },

    makeSphere: (radius, center = ORIGIN) => {
      let solid = Manifold.sphere(radius, 0) as { translate(t: Vec3): unknown };
      if (center[0] !== 0 || center[1] !== 0 || center[2] !== 0) {
        solid = solid.translate(center) as typeof solid;
      }
      return wrap(solid, makeNode('makeSphere', { radius, center }, []));
    },

    makeCone: (radius1, radius2, height, center = ORIGIN, direction = Z_AXIS) => {
      const base = Manifold.cylinder(height, radius1, radius2, 0, false);
      const solid = orient(base, center, direction);
      return wrap(solid, makeNode('makeCone', { radius1, radius2, height, center, direction }, []));
    },

    makeTorus: (majorRadius, minorRadius, center = ORIGIN, direction = Z_AXIS) => {
      const segments = Math.max(3, module.getCircularSegments(minorRadius) as number);
      const profile: Array<[number, number]> = [];
      for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        profile.push([majorRadius + minorRadius * Math.cos(a), minorRadius * Math.sin(a)]);
      }
      const base = Manifold.revolve([profile], 0);
      const solid = orient(base, center, direction);
      return wrap(
        solid,
        makeNode('makeTorus', { majorRadius, minorRadius, center, direction }, [])
      );
    },

    makeEllipsoid: (aLength, bLength, cLength) => {
      const solid = Manifold.sphere(1, 0).scale([aLength, bLength, cLength] as Vec3);
      return wrap(solid, makeNode('makeEllipsoid', { aLength, bLength, cLength }, []));
    },

    makeRectangle: () => notImplemented('makeRectangle'),
  };
}
