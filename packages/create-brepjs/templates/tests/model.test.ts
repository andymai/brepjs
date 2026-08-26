import { describe, it, expect, beforeAll } from 'vitest';
import { init, csg } from 'brepjs';
import { resolve, evaluateModel } from 'brepjs-families';
import model from '../src/main.tsx';

beforeAll(async () => {
  await init();
}, 120000);

describe('model', () => {
  it('resolves and meshes every element', () => {
    const tree = resolve(model);
    using evaluator = new csg.Evaluator();
    const evaluated = evaluateModel(tree, evaluator);
    expect(evaluated.byKeyPath.size).toBeGreaterThan(0);
    for (const [keyPath, node] of evaluated.byKeyPath) {
      expect(node.mesh.ok, `${keyPath} failed to mesh`).toBe(true);
    }
  });
});
