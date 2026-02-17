import { describe, expect, it, beforeAll } from 'vitest';
import { initOC } from './setup.js';
import {
  box,
  createAssemblyNode,
  addChild,
  addMate,
  solveAssembly,
  isOk,
  isErr,
  unwrap,
  getFaces,
  faceCenter,
} from '../src/index.js';

beforeAll(async () => {
  await initOC();
}, 30000);

/** Find the face whose center has the highest Z. */
function topFace(shape: Parameters<typeof getFaces>[0]) {
  const faces = getFaces(shape);
  let best = faces[0];
  let bestZ = faceCenter(best)[2];
  for (let i = 1; i < faces.length; i++) {
    const z = faceCenter(faces[i])[2];
    if (z > bestZ) {
      best = faces[i];
      bestZ = z;
    }
  }
  return best;
}

/** Find the face whose center has the lowest Z. */
function bottomFace(shape: Parameters<typeof getFaces>[0]) {
  const faces = getFaces(shape);
  let best = faces[0];
  let bestZ = faceCenter(best)[2];
  for (let i = 1; i < faces.length; i++) {
    const z = faceCenter(faces[i])[2];
    if (z < bestZ) {
      best = faces[i];
      bestZ = z;
    }
  }
  return best;
}

describe('assembly mates', () => {
  it('coincident mate aligns two box faces', () => {
    const b1 = box(10, 10, 10);
    const b2 = box(5, 5, 5);

    const topOfB1 = topFace(b1);
    const bottomOfB2 = bottomFace(b2);

    let assembly = createAssemblyNode('root');
    assembly = addChild(assembly, createAssemblyNode('base', { shape: b1 }));
    assembly = addChild(assembly, createAssemblyNode('top', { shape: b2 }));

    assembly = addMate(assembly, {
      type: 'fixed',
      entity: { node: 'base' },
    });

    assembly = addMate(assembly, {
      type: 'coincident',
      entityA: { node: 'base', face: topOfB1 },
      entityB: { node: 'top', face: bottomOfB2 },
    });

    const result = solveAssembly(assembly);
    expect(isOk(result)).toBe(true);
    const solved = unwrap(result);
    expect(solved.converged).toBe(true);

    const topTransform = solved.transforms.get('top');
    expect(topTransform).toBeDefined();
    // box(10) top face center at z=10, box(5) bottom face center at z=0
    // Coincident should move b2 so its bottom face meets b1's top face
    // Normal of top face is (0,0,1)
    // dot = 1*(10-0) = 10, pos = [0,0,10]
    expect(topTransform?.position[2]).toBeCloseTo(10, 0);
  });

  it('distance mate separates two parts', () => {
    const b1 = box(10, 10, 10);
    const b2 = box(10, 10, 10);

    const topOfB1 = topFace(b1);
    const bottomOfB2 = bottomFace(b2);

    let assembly = createAssemblyNode('root');
    assembly = addChild(assembly, createAssemblyNode('base', { shape: b1 }));
    assembly = addChild(assembly, createAssemblyNode('upper', { shape: b2 }));

    assembly = addMate(assembly, {
      type: 'fixed',
      entity: { node: 'base' },
    });

    assembly = addMate(assembly, {
      type: 'distance',
      entityA: { node: 'base', face: topOfB1 },
      entityB: { node: 'upper', face: bottomOfB2 },
      distance: 5,
    });

    const result = solveAssembly(assembly);
    expect(isOk(result)).toBe(true);
    const solved = unwrap(result);
    expect(solved.converged).toBe(true);

    const upperTransform = solved.transforms.get('upper');
    expect(upperTransform).toBeDefined();
    // Top of b1 at z=10, bottom of b2 at z=0, distance 5
    // offset = (10-0) + 5 = 15
    expect(upperTransform?.position[2]).toBeCloseTo(15, 0);
  });

  it('returns error when no mates defined', () => {
    const assembly = createAssemblyNode('root');
    const result = solveAssembly(assembly);
    expect(isErr(result)).toBe(true);
  });
});
